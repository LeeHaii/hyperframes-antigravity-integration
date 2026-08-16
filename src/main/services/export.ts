import { bundle } from '@remotion/bundler'
import {
  makeCancelSignal,
  renderMedia,
  selectComposition,
} from '@remotion/renderer'
import { createReadStream, existsSync, promises as fs } from 'node:fs'
import { createServer, Server } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'
import { ExportVideoRequest } from '../../types/editor'
import { getEncoderCapabilities } from './hardware'
import { getRemotionBinariesDirectory } from './remotionBinaries'

let cancelCurrentRender: (() => void) | null = null
let developmentBundle: Promise<string> | null = null

async function getBundledComposition() {
  const applicationPath = app
    .getAppPath()
    .replace(`${path.sep}app.asar`, `${path.sep}app.asar.unpacked`)
  const staticBundle = path.join(applicationPath, 'dist-remotion')
  if (existsSync(path.join(staticBundle, 'index.html'))) return staticBundle
  if (!developmentBundle) {
    developmentBundle = bundle({
      entryPoint: path.join(app.getAppPath(), 'src', 'remotion', 'index.ts'),
      webpackOverride: (config) => config,
    }).catch((error) => {
      developmentBundle = null
      throw error
    })
  }
  return await developmentBundle
}

export function cancelActiveExport() {
  if (!cancelCurrentRender) return false
  cancelCurrentRender()
  return true
}

export async function exportVideo(
  request: ExportVideoRequest,
  onProgress: (progress: number) => void
): Promise<string> {
  if (cancelCurrentRender) {
    throw new Error('Another export is already running.')
  }
  const missingYouTubeScene = request.scenes.find(
    (scene) => scene.media?.type === 'youtube_clip' && scene.media.missing
  )
  if (missingYouTubeScene) {
    throw new Error(
      `YouTube clip "${missingYouTubeScene.media?.title || missingYouTubeScene.id}" is missing. Download it again before exporting.`
    )
  }

  const { cancel, cancelSignal } = makeCancelSignal()
  cancelCurrentRender = cancel
  let assetServer: LocalAssetServer | null = null

  try {
    assetServer = await createLocalAssetServer(request)
    const inputProps = {
      scenes: request.scenes.map((scene) => ({
        ...scene,
        media: scene.media
          ? {
              ...scene.media,
              sourceUrl: assetServer!.rewrite(scene.media.sourceUrl),
            }
          : null,
      })),
      audioPath: assetServer.rewrite(request.audioPath),
      audioStartSec: request.audioStartSec || 0,
      audioClips: request.audioClips.map((clip) => ({
        ...clip,
        path: assetServer!.rewrite(clip.path),
      })),
      subtitleSettings: request.subtitleSettings,
      subtitles: request.subtitles,
      videoTracks: request.videoTracks,
      voiceTrackSettings: request.voiceTrackSettings,
      audioTrackSettings: request.audioTrackSettings,
    }

    const bundled = await getBundledComposition()
    const binariesDirectory = getRemotionBinariesDirectory()
    if (request.encoder === 'nvenc') {
      const capabilities = getEncoderCapabilities()
      if (!capabilities.nvenc) {
        throw new Error(
          capabilities.nvencReason ||
            'NVIDIA NVENC could not be initialized. Choose CPU encoding instead.'
        )
      }
    }

    const selectedComposition = await selectComposition({
      serveUrl: bundled,
      id: 'MainComposition',
      inputProps,
      binariesDirectory,
    })
    await fs.mkdir(path.dirname(request.outputPath), { recursive: true })
    await renderMedia({
      composition: selectedComposition,
      serveUrl: bundled,
      codec: 'h264',
      outputLocation: request.outputPath,
      inputProps,
      overwrite: true,
      scale: request.width / selectedComposition.width,
      videoBitrate: request.videoBitrate as `${number}M`,
      audioBitrate: '192k',
      binariesDirectory,
      ...(request.encoder === 'nvenc'
        ? {
            hardwareAcceleration: 'required' as const,
            logLevel: 'verbose' as const,
          }
        : {
            hardwareAcceleration: 'disable' as const,
            x264Preset: 'medium' as const,
          }),
      cancelSignal,
      onProgress: ({ progress }) => {
        onProgress(Math.round(progress * 100))
      },
    })

    return request.outputPath
  } catch (error) {
    console.error('Export failed:', error)
    throw error
  } finally {
    cancelCurrentRender = null
    await assetServer?.close()
  }
}

type LocalAssetServer = {
  rewrite: (source: string) => string
  close: () => Promise<void>
}

async function createLocalAssetServer(
  request: ExportVideoRequest
): Promise<LocalAssetServer> {
  const localPaths = new Set<string>()
  const collect = (source: string) => {
    const localPath = resolveLocalPath(source)
    if (localPath) localPaths.add(localPath)
  }

  collect(request.audioPath)
  request.audioClips.forEach((clip) => collect(clip.path))
  request.scenes.forEach((scene) => {
    if (scene.media) collect(scene.media.sourceUrl)
  })

  const byToken = new Map<string, string>()
  const byPath = new Map<string, string>()
  Array.from(localPaths).forEach((filePath, index) => {
    const token = String(index)
    byToken.set(token, filePath)
    byPath.set(filePath, token)
  })

  const server = createServer(async (incoming, response) => {
    try {
      const token = new URL(incoming.url || '/', 'http://127.0.0.1').pathname
        .replace(/^\/asset\//, '')
      const filePath = byToken.get(token)
      if (!filePath) {
        response.writeHead(404)
        response.end('Not found')
        return
      }

      const stats = await fs.stat(filePath)
      const range = incoming.headers.range
      response.setHeader('Access-Control-Allow-Origin', '*')
      response.setHeader('Accept-Ranges', 'bytes')
      response.setHeader('Content-Type', contentType(filePath))

      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range)
        const start = match?.[1] ? Number(match[1]) : 0
        const end = match?.[2] ? Number(match[2]) : stats.size - 1
        const safeStart = Math.max(0, Math.min(start, stats.size - 1))
        const safeEnd = Math.max(safeStart, Math.min(end, stats.size - 1))
        response.writeHead(206, {
          'Content-Range': `bytes ${safeStart}-${safeEnd}/${stats.size}`,
          'Content-Length': safeEnd - safeStart + 1,
        })
        createReadStream(filePath, { start: safeStart, end: safeEnd }).pipe(response)
        return
      }

      response.writeHead(200, { 'Content-Length': stats.size })
      createReadStream(filePath).pipe(response)
    } catch (error) {
      console.error('Local render asset server error:', error)
      response.writeHead(500)
      response.end('Could not read local media')
    }
  })

  await listen(server)
  const address = server.address()
  if (!address || typeof address === 'string') {
    await closeServer(server)
    throw new Error('Could not start the local render asset server.')
  }
  const origin = `http://127.0.0.1:${address.port}`

  return {
    rewrite: (source) => {
      const filePath = resolveLocalPath(source)
      if (!filePath) return source
      const token = byPath.get(filePath)
      if (token === undefined) return source
      return `${origin}/asset/${token}`
    },
    close: () => closeServer(server),
  }
}

function resolveLocalPath(source: string): string | null {
  if (!source || /^(https?:|data:|blob:)/i.test(source)) return null
  try {
    return source.startsWith('file:') ? fileURLToPath(source) : path.resolve(source)
  } catch {
    return null
  }
}

function listen(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
}

function closeServer(server: Server) {
  return new Promise<void>((resolve) => {
    server.close(() => resolve())
    server.closeAllConnections?.()
  })
}

function contentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase()
  const types: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  }
  return types[extension] || 'application/octet-stream'
}
