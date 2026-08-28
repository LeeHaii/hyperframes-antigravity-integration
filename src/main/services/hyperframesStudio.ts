import { ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  portableCompositionHtml,
  resolveHyperframesBin,
} from './hyperframes'

type ActiveStudio = {
  key: string
  child: ChildProcess
  directory: string
  internalPort: number
  proxy: Server
  ready: Promise<{ url: string }>
  url?: string
}

type StudioProxy = {
  server: Server
  url: string
}

type StudioHttpResult = {
  status: number
  body: string
}

const STUDIO_REQUEST_TIMEOUT_MS = 20_000
const STUDIO_WRITE_ATTEMPTS = 3
const studioWriteQueues = new WeakMap<ActiveStudio, Promise<void>>()

export type AppendStudioCompositionResult = {
  masterHtml: string
  compositionPath: string
  compositionCount: number
  totalDurationSec: number
  clipDurationSec: number
}

const STUDIO_ASSETS: Record<string, { file: string; contentType: string }> = {
  '/gravity-frames-logo.jpg': {
    file: 'gravity-frames-logo.jpg',
    contentType: 'image/jpeg',
  },
  '/gravity-frames-studio.js': {
    file: 'gravity-frames-studio.js',
    contentType: 'text/javascript; charset=utf-8',
  },
  '/gravity-frames-studio.css': {
    file: 'gravity-frames-studio.css',
    contentType: 'text/css; charset=utf-8',
  },
}

let activeStudio: ActiveStudio | null = null

function safeIdentifier(value: string, label: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error(`Invalid ${label}.`)
  return value
}

export function hyperframesStudioDirectory(
  studioProjectsDirectory: string,
  projectId: string,
  sceneId: string
) {
  return path.join(
    studioProjectsDirectory,
    safeIdentifier(projectId, 'project id'),
    safeIdentifier(sceneId, 'scene id')
  )
}

function injectGravityFramesStudio(html: string, masterHtml: string) {
  const timelineBootstrap = Buffer.from(
    JSON.stringify(masterTimelineBootstrap(masterHtml)),
    'utf8'
  ).toString('base64')
  const customization = [
    `<meta name="gravity-frames-master-timeline" content="${timelineBootstrap}">`,
    '<link rel="stylesheet" href="/gravity-frames-studio.css">',
    '<link rel="icon" type="image/jpeg" href="/gravity-frames-logo.jpg">',
    '<script src="/gravity-frames-studio.js?v=timeline-master-v2"></script>',
  ].join('')
  return /<head\b[^>]*>/i.test(html)
    ? html.replace(/<head\b[^>]*>/i, (head) => `${head}${customization}`)
    : `${customization}${html}`
}

function isStudioDocument(requestUrl: string) {
  try {
    return new URL(requestUrl, 'http://gravity-frames.local').pathname === '/'
  } catch {
    return false
  }
}

function isStudioJavaScript(requestUrl: string) {
  try {
    return /^\/assets\/index-[^/]+\.js$/i.test(
      new URL(requestUrl, 'http://gravity-frames.local').pathname
    )
  } catch {
    return false
  }
}

function patchStudioJavaScript(source: string) {
  const manifestHelper = `function mergeGravityFramesMasterManifest(data) {
  try {
    const hashQuery = location.hash.includes("?") ? location.hash.split("?")[1] : "";
    if (new URLSearchParams(hashQuery).has("comp") || !Array.isArray(data?.clips)) return data;
    const encoded = document.querySelector('meta[name="gravity-frames-master-timeline"]')?.getAttribute("content");
    if (!encoded) return data;
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const master = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(master.clips) || master.clips.length === 0) return data;
    const receivedById = new Map(data.clips.map((clip) => [clip?.id, clip]));
    data.clips = master.clips.map((authored) => ({
      ...(receivedById.get(authored.id) ?? {}),
      ...authored,
    }));
    const numerator = Number.parseFloat(data.fps?.numerator);
    const denominator = Number.parseFloat(data.fps?.denominator) || 1;
    const fps = numerator > 0 && denominator > 0
      ? numerator / denominator
      : data.durationSeconds > 0
        ? data.durationInFrames / data.durationSeconds
        : 30;
    const masterDuration = Number.parseFloat(master.duration) || 0;
    if (Number.isFinite(data.durationSeconds)) data.durationSeconds = Math.max(data.durationSeconds, masterDuration);
    if (Number.isFinite(data.durationInFrames) && fps > 0) {
      data.durationInFrames = Math.max(data.durationInFrames, Math.round(masterDuration * fps));
    }
  } catch {}
  return data;
}
function preserveGravityFramesMasterElements(currentElements, nextElements) {
  try {
    const hashQuery = location.hash.includes("?") ? location.hash.split("?")[1] : "";
    if (new URLSearchParams(hashQuery).has("comp")) return nextElements;
    const encoded = document.querySelector('meta[name="gravity-frames-master-timeline"]')?.getAttribute("content");
    if (!encoded) return nextElements;
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const master = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(master.clips) || master.clips.length === 0) return nextElements;
    const masterById = new Map(master.clips.map((clip) => [clip.id, clip]));
    const currentById = new Map(currentElements.map((element) => [element?.id, element]));
    const nextById = new Map(nextElements.map((element) => [element?.id, element]));
    const retainedTopLevel = nextElements.filter((element) => {
      const identity = element?.key ?? element?.id;
      return !masterById.has(element?.id) && typeof identity === "string" && identity.startsWith("index.html#");
    });
    const masterElements = master.clips.map((authored) => {
      const existing = nextById.get(authored.id) ?? currentById.get(authored.id) ?? {};
      return {
        ...existing,
        ...authored,
        key: existing.key ?? "index.html#" + authored.id,
        domId: existing.domId ?? authored.id,
        tag: authored.tagName ?? existing.tag ?? "div",
        authoredTrack: authored.track,
        sourceFile: existing.sourceFile ?? "index.html",
      };
    });
    return [...retainedTopLevel, ...masterElements];
  } catch {}
  return nextElements;
}
function isGravityFramesMasterView() {
  const hashQuery = location.hash.includes("?") ? location.hash.split("?")[1] : "";
  return !new URLSearchParams(hashQuery).has("comp") && Boolean(
    document.querySelector('meta[name="gravity-frames-master-timeline"]')
  );
}
`
  let patchedSource = source
  const readableManifest =
    /(const processTimelineMessage\s*=\s*useCallback\d*\(\s*\(data\)\s*=>\s*\{)/
  if (readableManifest.test(source)) {
    patchedSource = source.replace(
      readableManifest,
      (match) => `${manifestHelper}${match}
      data = mergeGravityFramesMasterManifest(data);`
    )
  } else {
    const compactManifest =
      /(function\s+\w+\(\{iframeRef:\w+,[\s\S]{0,300}?applyPreviewAudioState:\w+\}\)\{const\s+\w+=\w+\.useCallback\((\w+)=>\{)/
    if (!compactManifest.test(source)) return source
    patchedSource = source.replace(
      compactManifest,
      (match, _prefix, dataName) =>
        `${manifestHelper}${match}${dataName}=mergeGravityFramesMasterManifest(${dataName});`
    )
  }
  const readableMerge =
    /(function mergeTimelineElementsPreservingDowngrades\((\w+),\s*(\w+),[^)]*\)\s*\{)/
  if (readableMerge.test(patchedSource)) {
    patchedSource = patchedSource.replace(
      readableMerge,
      (match, _prefix, currentName, nextName) =>
        `${match}\n  ${nextName} = preserveGravityFramesMasterElements(${currentName}, ${nextName});\n  if (isGravityFramesMasterView()) return ${nextName};`
    )
  } else {
    const compactMerge =
      /(function\s+\w+\((\w+),(\w+),\w+,\w+\)\{)(?=const\s+\w+=Number\.isFinite\(\w+\)\?\w+:0,\w+=Number\.isFinite\(\w+\)\?\w+:0;if\()/
    patchedSource = patchedSource.replace(
      compactMerge,
      (match, _prefix, currentName, nextName) =>
        `${match}${nextName}=preserveGravityFramesMasterElements(${currentName},${nextName});if(isGravityFramesMasterView())return ${nextName};`
    )
  }
  const readableEnrichment =
    /(function buildMissingCompositionElements\([^,]+,[^,]+,\s*(\w+),[^)]*\)\s*\{)/
  if (readableEnrichment.test(patchedSource)) {
    patchedSource = patchedSource.replace(
      readableEnrichment,
      (match, _prefix, currentName) =>
        `${match}\n  if (isGravityFramesMasterView()) return { missing: [], updatedEls: ${currentName}, patched: false };`
    )
  } else {
    const compactEnrichment =
      /(function\s+\w+\(\w+,\w+,(\w+),\w+\)\{)(?=const\s+\w+=new Set\(\2\.map\()/
    patchedSource = patchedSource.replace(
      compactEnrichment,
      (match, _prefix, currentName) =>
        `${match}if(isGravityFramesMasterView())return{missing:[],updatedEls:${currentName},patched:!1};`
    )
  }
  const domChildrenSetter = /(\.setDomClipChildren\()(\w+)(\))/g
  return patchedSource.replace(
    domChildrenSetter,
    (_match, prefix, childrenName, suffix) =>
      `${prefix}isGravityFramesMasterView() ? [] : ${childrenName}${suffix}`
  )
}

function availablePort() {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address() as AddressInfo
      probe.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })
}

function listen(server: Server) {
  return new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve((server.address() as AddressInfo).port)
    })
  })
}

async function serveCustomizationAsset(
  requestPath: string,
  appPath: string,
  response: ServerResponse
) {
  const asset = STUDIO_ASSETS[requestPath]
  if (!asset) return false
  const assetPath = path.join(appPath, 'resources', 'studio', asset.file)
  const content = await fs.readFile(assetPath)
  response.writeHead(200, {
    'Content-Type': asset.contentType,
    'Content-Length': String(content.length),
    'Cache-Control': 'no-store',
  })
  response.end(content)
  return true
}

function proxyStudioRequest(
  request: IncomingMessage,
  response: ServerResponse,
  internalPort: number,
  masterHtml: string
) {
  const requestUrl = request.url || '/'
  const headers = {
    ...request.headers,
    host: `127.0.0.1:${internalPort}`,
    'accept-encoding': 'identity',
  }
  const upstream = httpRequest(
    {
      hostname: '127.0.0.1',
      port: internalPort,
      path: requestUrl,
      method: request.method,
      headers,
    },
    (upstreamResponse) => {
      const contentType = String(upstreamResponse.headers['content-type'] || '')
      if (isStudioDocument(requestUrl) && contentType.includes('text/html')) {
        const chunks: Buffer[] = []
        upstreamResponse.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        upstreamResponse.on('end', () => {
          const content = Buffer.from(
            injectGravityFramesStudio(
              Buffer.concat(chunks).toString('utf8'),
              masterHtml
            ),
            'utf8'
          )
          const responseHeaders = { ...upstreamResponse.headers }
          delete responseHeaders['content-encoding']
          delete responseHeaders['transfer-encoding']
          responseHeaders['content-length'] = String(content.length)
          responseHeaders['cache-control'] = 'no-store'
          response.writeHead(upstreamResponse.statusCode || 200, responseHeaders)
          response.end(content)
        })
        return
      }
      if (isStudioJavaScript(requestUrl)) {
        const chunks: Buffer[] = []
        upstreamResponse.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        upstreamResponse.on('end', () => {
          const content = Buffer.from(
            patchStudioJavaScript(Buffer.concat(chunks).toString('utf8')),
            'utf8'
          )
          const responseHeaders = { ...upstreamResponse.headers }
          delete responseHeaders['content-encoding']
          delete responseHeaders['transfer-encoding']
          responseHeaders['content-length'] = String(content.length)
          responseHeaders['cache-control'] = 'no-store'
          response.writeHead(upstreamResponse.statusCode || 200, responseHeaders)
          response.end(content)
        })
        return
      }
      response.writeHead(
        upstreamResponse.statusCode || 200,
        upstreamResponse.headers
      )
      upstreamResponse.pipe(response)
    }
  )
  upstream.once('error', (error) => {
    if (response.headersSent) {
      response.destroy(error)
      return
    }
    response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end(`HyperFrames Studio is unavailable: ${error.message}`)
  })
  request.pipe(upstream)
}

function requestStudioServer(
  internalPort: number,
  requestPath: string,
  method: 'GET' | 'PUT',
  body?: string,
  headers: Record<string, string> = {}
) {
  return new Promise<StudioHttpResult>((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: '127.0.0.1',
        port: internalPort,
        path: requestPath,
        method,
        headers: {
          ...headers,
          ...(body === undefined
            ? {}
            : { 'Content-Length': String(Buffer.byteLength(body)) }),
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        response.on('end', () => {
          resolve({
            status: response.statusCode || 500,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
      }
    )
    request.setTimeout(STUDIO_REQUEST_TIMEOUT_MS, () => {
      request.destroy(
        new Error(
          `HyperFrames Studio ${method} ${requestPath} timed out after ${
            STUDIO_REQUEST_TIMEOUT_MS / 1_000
          } seconds.`
        )
      )
    })
    request.once('error', reject)
    if (body !== undefined) request.write(body)
    request.end()
  })
}

function transientStudioRequestError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /timed out|ECONNRESET|ECONNREFUSED|socket hang up/i.test(message)
}

function waitForStudioRetry(attempt: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, attempt * 350))
}

async function writeStudioProjectFileAttempt(
  studio: ActiveStudio,
  projectFilePath: string,
  html: string
) {
  const projectName = path.basename(studio.directory)
  const filePath = `/api/projects/${encodeURIComponent(
    projectName
  )}/files/${encodeURIComponent(projectFilePath)}`
  const current = await requestStudioServer(
    studio.internalPort,
    filePath,
    'GET'
  )
  if (current.status !== 200 && current.status !== 404) {
    throw new Error(
      `HyperFrames Studio could not read ${projectFilePath} (${current.status}).`
    )
  }
  let version: string | undefined
  if (current.status === 200) {
    try {
      const parsed = JSON.parse(current.body)
      version = parsed?.version
      if (parsed?.content === html) return
    } catch {
      throw new Error('HyperFrames Studio returned an invalid file version.')
    }
    if (!version) {
      throw new Error('HyperFrames Studio did not return a file version.')
    }
  }
  const written = await requestStudioServer(
    studio.internalPort,
    filePath,
    'PUT',
    html,
    {
      'Content-Type': 'text/plain; charset=utf-8',
      ...(version ? { 'If-Match': version } : { 'If-None-Match': '*' }),
    }
  )
  if (written.status < 200 || written.status >= 300) {
    let detail = written.body.trim()
    try {
      const parsed = JSON.parse(written.body)
      detail = parsed.error || parsed.message || detail
    } catch {
      // Keep the response text when Studio did not return JSON.
    }
    throw new Error(
      `HyperFrames Studio could not save ${projectFilePath} (${written.status})${
        detail ? `: ${detail.slice(0, 400)}` : '.'
      }`
    )
  }
}

async function writeStudioProjectFile(
  studio: ActiveStudio,
  projectFilePath: string,
  html: string
) {
  const previous = studioWriteQueues.get(studio) || Promise.resolve()
  const queued = previous
    .catch(() => undefined)
    .then(async () => {
      let lastError: unknown
      for (let attempt = 1; attempt <= STUDIO_WRITE_ATTEMPTS; attempt += 1) {
        try {
          await writeStudioProjectFileAttempt(studio, projectFilePath, html)
          return
        } catch (error) {
          lastError = error
          if (!transientStudioRequestError(error) || attempt === STUDIO_WRITE_ATTEMPTS) {
            throw error
          }
          await waitForStudioRetry(attempt)
        }
      }
      throw lastError
    })
  studioWriteQueues.set(studio, queued)
  try {
    await queued
  } finally {
    if (studioWriteQueues.get(studio) === queued) studioWriteQueues.delete(studio)
  }
}

async function writeThroughStudio(studio: ActiveStudio, html: string) {
  await writeStudioProjectFile(studio, 'index.html', html)
}

const CHAT_MASTER_MARKER = 'gravity-frames-chat-master'
const CHAT_INSERT_MARKER = '<!-- gravity-frames-chat-insert -->'

function htmlAttribute(tag: string, name: string) {
  const match = tag.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, 'i')
  )
  return match?.[1]
}

function compositionRootTag(html: string) {
  return html.match(/<[a-z][\w:-]*\b[^>]*\bdata-composition-id\s*=\s*["'][^"']+["'][^>]*>/i)?.[0] || ''
}

function compositionNumber(html: string, name: string, fallback: number) {
  const value = Number.parseFloat(htmlAttribute(compositionRootTag(html), name) || '')
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function setTagAttribute(tag: string, name: string, value: string | number) {
  const attribute = new RegExp(
    `((?:^|\\s)${name}\\s*=\\s*["'])[^"']*(["'])`,
    'i'
  )
  if (attribute.test(tag)) return tag.replace(attribute, `$1${value}$2`)
  return tag.replace(/>$/, ` ${name}="${value}">`)
}

function stripTagAttribute(tag: string, name: string) {
  return tag.replace(
    new RegExp(
      `\\s+${name}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?`,
      'gi'
    ),
    ''
  )
}

function numericAttribute(tag: string, name: string, fallback = 0) {
  const value = Number.parseFloat(htmlAttribute(tag, name) || '')
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function compositionSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'animation'
}

function childCompositionId(projectPath: string) {
  const fileName = projectPath.split(/[\\/]/).pop()?.replace(/\.html?$/i, '') || 'animation'
  return `gravity-${compositionSlug(fileName)}`
}

function replaceLiteral(value: string, search: string, replacement: string) {
  return search && search !== replacement ? value.split(search).join(replacement) : value
}

/**
 * Child compositions have their own local clock. A start offset belongs to the
 * host in index.html, never to the child root. Studio otherwise adds the root
 * offset to every child layer and makes a five-second comp appear ten seconds
 * long. Stable, per-file IDs also prevent timeline registries from colliding
 * when several generated files originated from the same scene seed.
 */
export function normalizeHyperframesChildComposition(
  sourceHtml: string,
  compositionId: string
) {
  let html = portableCompositionHtml(sourceHtml).replace(
    /\s*<script\s+data-gravity-frames-child-isolation\b[^>]*>[\s\S]*?<\/script>/gi,
    ''
  )
  let root = compositionRootTag(html)
  if (!root) throw new Error('The child composition is missing a composition root.')

  const oldCompositionId = htmlAttribute(root, 'data-composition-id') || ''
  const oldRootId = htmlAttribute(root, 'id') || ''
  html = replaceLiteral(html, oldCompositionId, compositionId)
  html = replaceLiteral(html, oldRootId, compositionId)

  root = compositionRootTag(html)
  const rootIndex = html.indexOf(root)
  let normalizedRoot = setTagAttribute(root, 'data-composition-id', compositionId)
  normalizedRoot = setTagAttribute(normalizedRoot, 'id', compositionId)
  normalizedRoot = setTagAttribute(
    normalizedRoot,
    'data-hf-id',
    `hf-${compositionId}-root`
  )
  normalizedRoot = setTagAttribute(normalizedRoot, 'data-start', 0)
  normalizedRoot = stripTagAttribute(normalizedRoot, 'data-track-index')
  html = html.slice(0, rootIndex) + normalizedRoot + html.slice(rootIndex + root.length)

  const usedIds = new Set(
    Array.from(
      html.matchAll(/(?:^|\s)id\s*=\s*["']([^"']+)["']/gi),
      (match) => match[1]
    )
  )
  let layerNumber = 0
  const normalizedRootIndex = html.indexOf(normalizedRoot)
  html = html.replace(
    /<[a-z][\w:-]*\b[^>]*\b(?:data-start|data-duration|data-track-index)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>/gi,
    (tag, offset: number) => {
      if (offset === normalizedRootIndex || htmlAttribute(tag, 'id')) return tag
      layerNumber += 1
      const hfId = htmlAttribute(tag, 'data-hf-id')
      const base = `${compositionId}-layer-${compositionSlug(hfId || String(layerNumber))}`
      let id = base
      let suffix = 2
      while (usedIds.has(id)) id = `${base}-${suffix++}`
      usedIds.add(id)
      return setTagAttribute(tag, 'id', id)
    }
  )

  return html
}

type CompositionHostInfo = {
  duration: number
  sourcePath: string
  start: number
  trackIndex: number
}

function compositionHosts(html: string): CompositionHostInfo[] {
  return Array.from(
    html.matchAll(
      /<[a-z][\w:-]*\b[^>]*\bdata-composition-src\s*=\s*(?:"[^"]*"|'[^']*')[^>]*>/gi
    ),
    (match) => ({
      duration: numericAttribute(match[0], 'data-duration', 0),
      sourcePath: htmlAttribute(match[0], 'data-composition-src') || '',
      start: numericAttribute(match[0], 'data-start', 0),
      trackIndex: numericAttribute(match[0], 'data-track-index', 0),
    })
  ).filter((host) => host.sourcePath)
}

function masterTimelineBootstrap(html: string) {
  const root = compositionRootTag(html)
  const clips = Array.from(
    html.matchAll(
      /<[a-z][\w:-]*\b[^>]*\bdata-composition-src\s*=\s*(?:"[^"]*"|'[^']*')[^>]*>/gi
    ),
    (match, index) => {
      const tag = match[0]
      const compositionId = htmlAttribute(tag, 'data-composition-id')
      const compositionSrc = htmlAttribute(tag, 'data-composition-src')
      const duration = numericAttribute(tag, 'data-duration', 0)
      if (!compositionId || !compositionSrc || duration <= 0) return null
      const id = htmlAttribute(tag, 'id') || `${compositionId}-host-${index + 1}`
      const timelineLabel =
        htmlAttribute(tag, 'data-timeline-label') ||
        htmlAttribute(tag, 'data-label') ||
        compositionId
      return {
        id,
        label: timelineLabel,
        start: numericAttribute(tag, 'data-start', 0),
        duration,
        track: numericAttribute(tag, 'data-track-index', index),
        zIndex: 0,
        stackingContextId: null,
        kind: 'composition',
        tagName: tag.match(/^<([a-z][\w:-]*)/i)?.[1]?.toLowerCase() || 'div',
        compositionId,
        compositionAncestors: [],
        parentCompositionId: null,
        nodePath: null,
        compositionSrc,
        playbackStart: numericAttribute(tag, 'data-playback-start', 0),
        playbackRate: Math.max(0.1, numericAttribute(tag, 'data-playback-rate', 1)),
        assetUrl: null,
        timelineRole: htmlAttribute(tag, 'data-timeline-role') || null,
        timelineLabel,
        timelineGroup: htmlAttribute(tag, 'data-timeline-group') || null,
        timelinePriority: null,
      }
    }
  ).filter((clip) => clip !== null)
  return {
    clips,
    duration: Math.max(
      compositionNumber(html, 'data-duration', 0),
      ...clips.map((clip) => clip.start + clip.duration)
    ),
  }
}

function compositionEnd(html: string) {
  return compositionHosts(html).reduce(
    (maximum, host) => Math.max(maximum, host.start + host.duration),
    0
  )
}

function nextCompositionTrack(html: string) {
  const hosts = compositionHosts(html)
  return hosts.length
    ? Math.max(...hosts.map((host) => Math.floor(host.trackIndex))) + 1
    : 0
}

export async function repairHyperframesStudioProject(
  directory: string,
  sourceMasterHtml: string,
  studio: ActiveStudio | null = null
) {
  let masterHtml = portableCompositionHtml(sourceMasterHtml)
  if (!masterHtml.includes('data-gravity-frames-master="1"')) return masterHtml

  const directoryRoot = path.resolve(directory)
  const hosts = compositionHosts(masterHtml)
  const repairedCompositionIds = new Map<string, string>()
  for (const host of hosts) {
    const childPath = path.resolve(directory, ...host.sourcePath.split(/[\\/]/))
    if (
      !childPath.startsWith(`${directoryRoot}${path.sep}`) ||
      !/\.html?$/i.test(childPath)
    ) {
      continue
    }
    let childHtml: string
    let normalized: string
    const compositionId = childCompositionId(host.sourcePath)
    try {
      childHtml = await fs.readFile(childPath, 'utf8')
      normalized = normalizeHyperframesChildComposition(childHtml, compositionId)
    } catch {
      // Leave a missing comp visible in Studio so the user can relink or remove it.
      continue
    }
    if (normalized !== childHtml) {
      await writeCompositionFile(studio, directory, host.sourcePath, normalized)
    }
    repairedCompositionIds.set(host.sourcePath, compositionId)
  }

  let hostIndex = 0
  const usedHostIds = new Set<string>()
  const usedTracks = new Set<number>()
  masterHtml = masterHtml.replace(
    /<[a-z][\w:-]*\b[^>]*\bdata-composition-src\s*=\s*(?:"[^"]*"|'[^']*')[^>]*>/gi,
    (tag) => {
      const sourcePath = htmlAttribute(tag, 'data-composition-src') || ''
      const existingTrack = Number.parseFloat(
        htmlAttribute(tag, 'data-track-index') || ''
      )
      let trackIndex = existingTrack
      if (
        !Number.isInteger(trackIndex) ||
        trackIndex < 0 ||
        usedTracks.has(trackIndex)
      ) {
        trackIndex = 0
        while (usedTracks.has(trackIndex)) trackIndex += 1
      }
      usedTracks.add(trackIndex)

      let normalized = setTagAttribute(tag, 'data-track-index', trackIndex)
      const compositionId =
        repairedCompositionIds.get(sourcePath) ||
        htmlAttribute(tag, 'data-composition-id') ||
        childCompositionId(sourcePath)
      const existingId = htmlAttribute(tag, 'id') || ''
      let hostId = existingId || `${compositionId}-host`
      if (usedHostIds.has(hostId)) hostId = `${compositionId}-host-${hostIndex + 1}`
      while (usedHostIds.has(hostId)) hostId = `${hostId}-copy`
      usedHostIds.add(hostId)
      normalized = setTagAttribute(normalized, 'data-composition-id', compositionId)
      normalized = setTagAttribute(normalized, 'id', hostId)
      normalized = stripTagAttribute(normalized, 'data-no-timeline')
      hostIndex += 1
      return normalized
    }
  )

  const root = compositionRootTag(masterHtml)
  const end = compositionEnd(masterHtml)
  if (root && end > 0) {
    const duration = Math.max(compositionNumber(masterHtml, 'data-duration', end), end)
    masterHtml = masterHtml.replace(root, setTagAttribute(root, 'data-duration', duration))
  }
  return masterHtml
}

function compositionHost(options: {
  compositionId: string
  sourcePath: string
  start: number
  duration: number
  trackIndex: number
  label: string
}) {
  const token = randomUUID().replace(/-/g, '').slice(0, 12)
  return `    <div data-hf-id="hf-${token}" id="${options.compositionId}-host" class="clip gravity-frames-composition" data-composition-id="${options.compositionId}" data-composition-src="${escapeAttribute(options.sourcePath)}" data-start="${options.start}" data-duration="${options.duration}" data-track-index="${options.trackIndex}" data-timeline-label="${escapeAttribute(options.label)}"></div>`
}

function newChatMaster(options: {
  width: number
  height: number
  duration: number
  hosts: string[]
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
    #${CHAT_MASTER_MARKER} { position: relative; width: ${options.width}px; height: ${options.height}px; overflow: hidden; background: #000; }
    .gravity-frames-composition { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; }
  </style>
</head>
<body>
  <div data-hf-id="hf-chat-master" id="${CHAT_MASTER_MARKER}" data-gravity-frames-master="1" data-composition-id="${CHAT_MASTER_MARKER}" data-no-timeline data-start="0" data-duration="${options.duration}" data-width="${options.width}" data-height="${options.height}">
${options.hosts.join('\n')}
    ${CHAT_INSERT_MARKER}
  </div>
</body>
</html>`
}

function appendChatHost(masterHtml: string, host: string, duration: number) {
  if (!masterHtml.includes(CHAT_INSERT_MARKER)) {
    throw new Error('The Gravity Frames master composition is missing its insert marker.')
  }
  const rootMatch = masterHtml.match(
    /<[a-z][\w:-]*\b[^>]*\bdata-gravity-frames-master\s*=\s*["']1["'][^>]*>/i
  )
  if (!rootMatch || rootMatch.index === undefined) {
    throw new Error('The Gravity Frames master composition root is invalid.')
  }
  const rootWithDuration = setTagAttribute(rootMatch[0], 'data-duration', duration)
  const updatedRoot = /\bdata-no-timeline(?:\s|=|>)/i.test(rootWithDuration)
    ? rootWithDuration
    : rootWithDuration.replace(/>$/, ' data-no-timeline>')
  const withDuration =
    masterHtml.slice(0, rootMatch.index) +
    updatedRoot +
    masterHtml.slice(rootMatch.index + rootMatch[0].length)
  return withDuration.replace(
    CHAT_INSERT_MARKER,
    `${host}\n    ${CHAT_INSERT_MARKER}`
  )
}

async function nextChatCompositionPath(directory: string, label: string) {
  const compositionsDirectory = path.join(directory, 'compositions')
  await fs.mkdir(compositionsDirectory, { recursive: true })
  let files: string[] = []
  try {
    files = await fs.readdir(compositionsDirectory)
  } catch {
    // The directory was just created and is empty.
  }
  const highest = files.reduce((maximum, file) => {
    const sequence = Number.parseInt(file.match(/^(\d+)-chat-/i)?.[1] || '', 10)
    return Number.isFinite(sequence) ? Math.max(maximum, sequence) : maximum
  }, 0)
  const sequence = highest + 1
  return {
    sequence,
    projectPath: `compositions/${String(sequence).padStart(3, '0')}-chat-${compositionSlug(label)}.html`,
  }
}

async function writeCompositionFile(
  studio: ActiveStudio | null,
  directory: string,
  projectFilePath: string,
  html: string
) {
  if (studio) {
    await writeStudioProjectFile(studio, projectFilePath, html)
    return
  }
  const filePath = path.join(directory, ...projectFilePath.split('/'))
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, html, 'utf8')
}

async function createStudioProxy(
  appPath: string,
  internalPort: number,
  masterHtml: string
): Promise<StudioProxy> {
  const server = createServer((request, response) => {
    const pathname = new URL(
      request.url || '/',
      'http://gravity-frames.local'
    ).pathname
    void serveCustomizationAsset(pathname, appPath, response)
      .then((served) => {
        if (!served) proxyStudioRequest(request, response, internalPort, masterHtml)
      })
      .catch((error) => {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end(
          error instanceof Error ? error.message : 'Studio customization failed.'
        )
      })
  })
  const port = await listen(server)
  return { server, url: `http://localhost:${port}` }
}

export async function openHyperframesStudio(options: {
  appPath: string
  studioProjectsDirectory: string
  projectId: string
  sceneId: string
  html: string
}) {
  if (!options.html.includes('data-composition-id')) {
    throw new Error('This animation is missing a HyperFrames composition root.')
  }
  if (options.html.length > 1_000_000) {
    throw new Error('Composition HTML is too large.')
  }

  const directory = hyperframesStudioDirectory(
    options.studioProjectsDirectory,
    options.projectId,
    options.sceneId
  )
  const key = `${options.projectId}:${options.sceneId}`
  await fs.mkdir(directory, { recursive: true })
  const existingStudio =
    activeStudio?.key === key &&
    !activeStudio.child.killed &&
    activeStudio.child.exitCode === null
      ? activeStudio
      : null
  const preparedHtml = await repairHyperframesStudioProject(
    directory,
    portableCompositionHtml(options.html),
    existingStudio
  )
  await writeCompositionFile(existingStudio, directory, 'index.html', preparedHtml)

  if (existingStudio) {
    return existingStudio.url ? { url: existingStudio.url } : await existingStudio.ready
  }
  closeHyperframesStudio()

  const internalPort = await availablePort()
  const proxy = await createStudioProxy(options.appPath, internalPort, preparedHtml)
  const cliPath = await resolveHyperframesBin(options.appPath)
  const child = spawn(
    process.execPath,
    [
      cliPath,
      'preview',
      directory,
      '--port',
      String(internalPort),
      '--force-new',
      '--no-open',
      '--no-proxy',
    ],
    {
      cwd: directory,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    }
  )
  let resolveReady!: (session: { url: string }) => void
  let rejectReady!: (error: Error) => void
  const ready = new Promise<{ url: string }>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  const studio: ActiveStudio = {
    key,
    child,
    directory,
    internalPort,
    proxy: proxy.server,
    ready,
  }
  activeStudio = studio

  let settled = false
  let output = ''
  let timeout: ReturnType<typeof setTimeout>
  const finish = () => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    const projectName = path.basename(directory)
    const url = `${proxy.url}/#project/${encodeURIComponent(projectName)}`
    studio.url = url
    resolveReady({ url })
  }
  const fail = (error: Error) => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    proxy.server.close()
    rejectReady(error)
  }
  const consume = (data: Buffer) => {
    output += data.toString('utf8')
    const cleanOutput = output.replace(/\u001b\[[0-9;]*m/g, '')
    if (/http:\/\/(?:localhost|127\.0\.0\.1):\d+/i.test(cleanOutput)) finish()
    if (output.length > 20_000) output = output.slice(-20_000)
  }
  timeout = setTimeout(() => {
    child.kill()
    fail(
      new Error(
        `HyperFrames Studio did not start in time. ${output.trim().slice(-800)}`
      )
    )
  }, 25_000)
  child.stdout?.on('data', consume)
  child.stderr?.on('data', consume)
  child.once('error', fail)
  child.once('close', (code) => {
    proxy.server.close()
    if (activeStudio?.child === child) activeStudio = null
    if (!settled) {
      fail(
        new Error(
          output.trim().slice(-800) ||
            `HyperFrames Studio exited with code ${code}.`
        )
      )
    }
  })

  return await ready
}

export async function readHyperframesStudioHtml(options: {
  studioProjectsDirectory: string
  projectId: string
  sceneId: string
}) {
  const directory = hyperframesStudioDirectory(
    options.studioProjectsDirectory,
    options.projectId,
    options.sceneId
  )
  const storedHtml = await fs.readFile(path.join(directory, 'index.html'), 'utf8')
  const active =
    activeStudio?.key === `${options.projectId}:${options.sceneId}` &&
    !activeStudio.child.killed &&
    activeStudio.child.exitCode === null
      ? activeStudio
      : null
  const html = await repairHyperframesStudioProject(directory, storedHtml, active)
  if (html !== storedHtml) await writeCompositionFile(active, directory, 'index.html', html)
  if (html.length > 1_000_000) throw new Error('Composition HTML is too large.')
  return html
}

export async function writeHyperframesStudioHtml(options: {
  studioProjectsDirectory: string
  projectId: string
  sceneId: string
  html: string
}) {
  if (!options.html.includes('data-composition-id')) {
    throw new Error('This animation is missing a HyperFrames composition root.')
  }
  if (options.html.length > 1_000_000) {
    throw new Error('Composition HTML is too large.')
  }
  const directory = hyperframesStudioDirectory(
    options.studioProjectsDirectory,
    options.projectId,
    options.sceneId
  )
  const html = portableCompositionHtml(options.html)
  const key = `${options.projectId}:${options.sceneId}`
  if (
    activeStudio?.key === key &&
    !activeStudio.child.killed &&
    activeStudio.child.exitCode === null
  ) {
    await writeThroughStudio(activeStudio, html)
    return true
  }
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, 'index.html'), html, 'utf8')
  return true
}

export async function appendHyperframesStudioComposition(options: {
  studioProjectsDirectory: string
  projectId: string
  sceneId: string
  html: string
  label: string
  preserveCurrent: boolean
}): Promise<AppendStudioCompositionResult> {
  if (!options.html.includes('data-composition-id')) {
    throw new Error('The generated animation is missing a HyperFrames composition root.')
  }
  if (options.html.length > 1_000_000) {
    throw new Error('Generated composition HTML is too large.')
  }
  const directory = hyperframesStudioDirectory(
    options.studioProjectsDirectory,
    options.projectId,
    options.sceneId
  )
  await fs.mkdir(directory, { recursive: true })
  const indexPath = path.join(directory, 'index.html')
  let currentHtml = await fs.readFile(indexPath, 'utf8')
  const active =
    activeStudio?.key === `${options.projectId}:${options.sceneId}` &&
    !activeStudio.child.killed &&
    activeStudio.child.exitCode === null
      ? activeStudio
      : null
  currentHtml = await repairHyperframesStudioProject(directory, currentHtml, active)

  const generatedSourceHtml = portableCompositionHtml(options.html)
  const clipDurationSec = Math.max(
    0.1,
    Math.min(3_600, compositionNumber(generatedSourceHtml, 'data-duration', 5))
  )
  const width = compositionNumber(generatedSourceHtml, 'data-width', 1920)
  const height = compositionNumber(generatedSourceHtml, 'data-height', 1080)

  let masterHtml: string
  let start = 0
  let compositionCount = 0
  let generatedFile: Awaited<ReturnType<typeof nextChatCompositionPath>>
  if (currentHtml.includes('data-gravity-frames-master="1"')) {
    generatedFile = await nextChatCompositionPath(directory, options.label)
    const generatedHtml = normalizeHyperframesChildComposition(
      generatedSourceHtml,
      childCompositionId(generatedFile.projectPath)
    )
    await writeCompositionFile(
      active,
      directory,
      generatedFile.projectPath,
      generatedHtml
    )
    start = compositionEnd(currentHtml)
    compositionCount = compositionHosts(currentHtml).length + 1
    masterHtml = appendChatHost(
      currentHtml,
      compositionHost({
        compositionId: childCompositionId(generatedFile.projectPath),
        sourcePath: generatedFile.projectPath,
        start,
        duration: clipDurationSec,
        trackIndex: nextCompositionTrack(currentHtml),
        label: options.label,
      }),
      start + clipDurationSec
    )
  } else {
    const hosts: string[] = []
    if (options.preserveCurrent) {
      const existingDuration = compositionNumber(currentHtml, 'data-duration', 5)
      const existingFile = await nextChatCompositionPath(directory, 'existing-animation')
      const existingHtml = normalizeHyperframesChildComposition(
        currentHtml,
        childCompositionId(existingFile.projectPath)
      )
      await writeCompositionFile(
        active,
        directory,
        existingFile.projectPath,
        existingHtml
      )
      hosts.push(
        compositionHost({
          compositionId: childCompositionId(existingFile.projectPath),
          sourcePath: existingFile.projectPath,
          start: 0,
          duration: existingDuration,
          trackIndex: 0,
          label: 'Existing animation',
        })
      )
      start = existingDuration
      compositionCount = existingFile.sequence
    }
    generatedFile = await nextChatCompositionPath(directory, options.label)
    const generatedHtml = normalizeHyperframesChildComposition(
      generatedSourceHtml,
      childCompositionId(generatedFile.projectPath)
    )
    await writeCompositionFile(
      active,
      directory,
      generatedFile.projectPath,
      generatedHtml
    )
    compositionCount = Math.max(compositionCount, generatedFile.sequence)
    hosts.push(
      compositionHost({
        compositionId: childCompositionId(generatedFile.projectPath),
        sourcePath: generatedFile.projectPath,
        start,
        duration: clipDurationSec,
        trackIndex: hosts.length,
        label: options.label,
      })
    )
    masterHtml = newChatMaster({
      width,
      height,
      duration: start + clipDurationSec,
      hosts,
    })
  }

  if (masterHtml.length > 1_000_000) {
    throw new Error('The master composition is too large.')
  }
  masterHtml = await repairHyperframesStudioProject(directory, masterHtml, active)
  await writeCompositionFile(active, directory, 'index.html', masterHtml)
  const totalDurationSec = compositionNumber(
    masterHtml,
    'data-duration',
    start + clipDurationSec
  )
  return {
    masterHtml,
    compositionPath: generatedFile.projectPath,
    compositionCount,
    totalDurationSec,
    clipDurationSec,
  }
}

export function closeHyperframesStudio() {
  const studio = activeStudio
  activeStudio = null
  studio?.proxy.close()
  const child = studio?.child
  if (child && !child.killed) child.kill()
  return true
}
