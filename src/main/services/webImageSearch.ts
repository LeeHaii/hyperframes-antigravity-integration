import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { nativeImage } from 'electron'
import type {
  WebImageAsset,
  WebImageCandidate,
  WebImageSearchCapability,
  WebImageSearchResult,
} from '../../types/editor'
import { assertWebImageSearchAllowed } from '../../shared/imageSearchPolicy'

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
const MAX_PREVIEW_BYTES = 5 * 1024 * 1024
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 15_000
const PREVIEW_DOWNLOAD_ATTEMPTS = 2
const IMAGE_DOWNLOAD_ATTEMPTS = 5
const PREVIEW_REQUEST_SPACING_MS = 200
const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

type StoredCandidate = WebImageCandidate & {
  imageUrl: string
  thumbnailUrl: string
}

type StoredSearch = {
  searchId: string
  query: string
  createdAt: string
  candidates: StoredCandidate[]
}

type MediaManifest = {
  version: 1
  assets: Array<Record<string, unknown>>
}

function safeIdentifier(value: string, label: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error(`Invalid ${label}.`)
  return value
}

function normalizedProjectPath(...parts: string[]) {
  return parts.join('/').replace(/\\/g, '/')
}

function stripMarkup(value: unknown, fallback: string) {
  const text = String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return (text || fallback).slice(0, 500)
}

function metadataValue(metadata: Record<string, any> | undefined, key: string) {
  return metadata?.[key]?.value
}

function assertRemoteImageUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('The image provider returned an invalid URL.')
  }
  if (url.protocol !== 'https:') {
    throw new Error('Only HTTPS image downloads are allowed.')
  }
  if (url.hostname !== 'upload.wikimedia.org') {
    throw new Error('The image provider returned an untrusted download host.')
  }
  return url
}

function sniffImageMime(buffer: Buffer) {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return 'image/png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  throw new Error('The downloaded file is not a supported PNG, JPEG, or WebP image.')
}

function extensionForMime(mimeType: string) {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return 'jpg'
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function retryDelayMilliseconds(response: Response, attempt: number) {
  const retryAfter = response.headers.get('retry-after')?.trim()
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) {
      return Math.min(30_000, Math.max(750, Math.ceil(seconds * 1_000)))
    }
    const date = Date.parse(retryAfter)
    if (Number.isFinite(date)) {
      return Math.min(30_000, Math.max(750, date - Date.now()))
    }
  }
  return Math.min(16_000, 1_000 * 2 ** Math.max(0, attempt - 1))
}

async function fetchBuffer(
  urlValue: string,
  maximumBytes: number,
  maximumAttempts = IMAGE_DOWNLOAD_ATTEMPTS
) {
  const url = assertRemoteImageUrl(urlValue)
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        redirect: 'error',
        signal: controller.signal,
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1',
          'User-Agent': 'GravityFramesStudio/1.0 (web-image integration)',
        },
      })
      if (response.status === 429 || response.status === 503) {
        await response.body?.cancel()
        if (attempt === maximumAttempts) {
          throw new Error(
            `Wikimedia remained rate-limited after ${maximumAttempts} download attempts (HTTP ${response.status}). Please wait a minute and try again.`
          )
        }
        await wait(retryDelayMilliseconds(response, attempt))
        continue
      }
      if (!response.ok) throw new Error(`Image download failed with HTTP ${response.status}.`)
      const declaredSize = Number(response.headers.get('content-length') || 0)
      if (declaredSize > maximumBytes) throw new Error('The image exceeds the download size limit.')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('The image response did not contain a body.')
      const chunks: Buffer[] = []
      let received = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.byteLength
        if (received > maximumBytes) {
          await reader.cancel()
          throw new Error('The image exceeds the download size limit.')
        }
        chunks.push(Buffer.from(value))
      }
      const buffer = Buffer.concat(chunks)
      const mimeType = sniffImageMime(buffer)
      const declaredType = response.headers.get('content-type')
        ?.split(';')[0]
        .trim()
        .toLowerCase()
      if (
        declaredType &&
        declaredType !== 'application/octet-stream' &&
        declaredType !== mimeType
      ) {
        throw new Error('The image content type does not match its decoded file type.')
      }
      const decoded = nativeImage.createFromBuffer(buffer)
      if (decoded.isEmpty()) throw new Error('The downloaded image could not be decoded.')
      const size = decoded.getSize()
      if (size.width <= 0 || size.height <= 0) throw new Error('The image has invalid dimensions.')
      return { buffer, mimeType, width: size.width, height: size.height }
    } catch (error) {
      const retryableNetworkError =
        error instanceof Error &&
        /aborted|fetch failed|ECONNRESET|ETIMEDOUT|socket/i.test(error.message)
      if (!retryableNetworkError || attempt === maximumAttempts) throw error
      await wait(Math.min(8_000, 750 * 2 ** Math.max(0, attempt - 1)))
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new Error('The image download could not be completed.')
}

function policyDirectory(projectDirectory: string) {
  return path.join(projectDirectory, '.gravity-frames')
}

export async function writeWebImageSearchBrief(
  projectDirectory: string,
  capability: WebImageSearchCapability
) {
  const directory = policyDirectory(projectDirectory)
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(
    path.join(directory, 'BRIEF.json'),
    JSON.stringify(
      {
        capabilities: { web_image_search: capability },
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  )
}

async function assertProjectWebImageSearchAllowed(projectDirectory: string) {
  try {
    const brief = JSON.parse(
      await fs.readFile(path.join(policyDirectory(projectDirectory), 'BRIEF.json'), 'utf8')
    )
    assertWebImageSearchAllowed(brief?.capabilities?.web_image_search || { allowed: false })
    return
  } catch {
    // Missing or malformed policy is denied below.
  }
  assertWebImageSearchAllowed({ allowed: false, reason: 'Missing normalized project brief.' })
}

function searchDirectory(projectDirectory: string, searchId: string) {
  return path.join(projectDirectory, '.media', 'search', safeIdentifier(searchId, 'search id'))
}

export async function searchWebImages(options: {
  projectDirectory: string
  query: string
  limit?: number
}): Promise<WebImageSearchResult> {
  await assertProjectWebImageSearchAllowed(options.projectDirectory)
  const query = options.query.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!query) throw new Error('Enter a subject to search for images.')
  const limit = Math.min(12, Math.max(4, Math.round(options.limit || 8)))
  const apiUrl = new URL(COMMONS_API)
  const params: Record<string, string> = {
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: String(Math.min(24, limit * 2)),
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: '640',
    iiextmetadatalanguage: 'en',
    iiextmetadatafilter:
      'Artist|LicenseShortName|LicenseUrl|Credit|ImageDescription|AttributionRequired',
  }
  for (const [key, value] of Object.entries(params)) apiUrl.searchParams.set(key, value)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
  let payload: any
  try {
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'GravityFramesStudio/1.0 (web-image integration)' },
    })
    if (!response.ok) throw new Error(`Wikimedia search failed with HTTP ${response.status}.`)
    payload = await response.json()
  } finally {
    clearTimeout(timeout)
  }

  const providerCandidates: StoredCandidate[] = (payload?.query?.pages || [])
    .map((page: any) => {
      const image = page?.imageinfo?.[0]
      if (!image?.url || !image?.thumburl || !SUPPORTED_MIME_TYPES.has(image.mime)) return null
      if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width < 800) {
        return null
      }
      const metadata = image.extmetadata || {}
      const title = stripMarkup(
        metadataValue(metadata, 'ImageDescription'),
        String(page.title || 'Wikimedia Commons image').replace(/^File:/i, '')
      )
      const author = stripMarkup(metadataValue(metadata, 'Artist'), 'Unknown creator')
      const license = stripMarkup(metadataValue(metadata, 'LicenseShortName'), 'unknown')
      return {
        id: `commons_${page.pageid}`,
        title,
        thumbnailPath: '',
        thumbnailUrl: image.thumburl,
        imageUrl: image.url,
        sourcePageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(
          String(page.title || '').replace(/ /g, '_')
        )}`,
        width: image.width,
        height: image.height,
        mimeType: image.mime,
        provider: 'wikimedia-commons' as const,
        author,
        license,
        attribution: `${author} — ${license}`,
      }
    })
    .filter((candidate: StoredCandidate | null): candidate is StoredCandidate => Boolean(candidate))
    .sort((first: StoredCandidate, second: StoredCandidate) => {
      const firstRatio = first.width / first.height
      const secondRatio = second.width / second.height
      return Math.abs(firstRatio - 16 / 9) - Math.abs(secondRatio - 16 / 9)
    })
    .slice(0, limit)

  if (providerCandidates.length === 0) {
    throw new Error(`No suitable PNG, JPEG, or WebP images were found for “${query}”.`)
  }

  const searchId = randomUUID()
  const directory = searchDirectory(options.projectDirectory, searchId)
  await fs.mkdir(directory, { recursive: true })
  const candidates: StoredCandidate[] = []
  for (const [index, candidate] of providerCandidates.entries()) {
    try {
      if (index > 0) await wait(PREVIEW_REQUEST_SPACING_MS)
      const preview = await fetchBuffer(
        candidate.thumbnailUrl,
        MAX_PREVIEW_BYTES,
        PREVIEW_DOWNLOAD_ATTEMPTS
      )
      const previewName = `candidate_${String(index + 1).padStart(2, '0')}.${extensionForMime(
        preview.mimeType
      )}`
      await fs.writeFile(path.join(directory, previewName), preview.buffer)
      candidates.push({ ...candidate, thumbnailPath: path.join(directory, previewName) })
    } catch {
      // A broken preview is excluded; the remaining candidates are still useful.
    }
  }
  if (candidates.length === 0) throw new Error('The provider returned images, but none could be validated.')

  const stored: StoredSearch = {
    searchId,
    query,
    createdAt: new Date().toISOString(),
    candidates,
  }
  await fs.writeFile(path.join(directory, 'candidates.json'), JSON.stringify(stored, null, 2), 'utf8')
  return { searchId, query, candidates }
}

async function readStoredSearch(projectDirectory: string, searchId: string) {
  const contents = await fs.readFile(
    path.join(searchDirectory(projectDirectory, searchId), 'candidates.json'),
    'utf8'
  )
  const parsed = JSON.parse(contents) as StoredSearch
  if (parsed.searchId !== searchId || !Array.isArray(parsed.candidates)) {
    throw new Error('The saved web-image search is invalid.')
  }
  return parsed
}

export async function ingestWebImage(options: {
  projectDirectory: string
  searchId: string
  candidateId: string
}): Promise<WebImageAsset> {
  await assertProjectWebImageSearchAllowed(options.projectDirectory)
  const stored = await readStoredSearch(
    options.projectDirectory,
    safeIdentifier(options.searchId, 'search id')
  )
  const candidate = stored.candidates.find((item) => item.id === options.candidateId)
  if (!candidate) throw new Error('The selected image candidate does not exist.')

  const downloaded = await fetchBuffer(candidate.imageUrl, MAX_IMAGE_BYTES)
  if (downloaded.width < 800) {
    throw new Error(`The selected image is only ${downloaded.width}px wide; at least 800px is required.`)
  }
  const sha256 = createHash('sha256').update(downloaded.buffer).digest('hex')
  const fileName = `web_image_${sha256.slice(0, 12)}.${extensionForMime(downloaded.mimeType)}`
  const imagesDirectory = path.join(options.projectDirectory, '.media', 'images')
  await fs.mkdir(imagesDirectory, { recursive: true })
  const destination = path.join(imagesDirectory, fileName)
  await fs.writeFile(destination, downloaded.buffer)

  const projectRelativePath = normalizedProjectPath('.media', 'images', fileName)
  const record = {
    id: path.parse(fileName).name,
    type: 'image',
    provider: candidate.provider,
    query: stored.query,
    path: projectRelativePath,
    sourcePage: candidate.sourcePageUrl,
    sourceImage: candidate.imageUrl,
    author: candidate.author,
    license: candidate.license || 'unknown',
    attribution: candidate.attribution,
    retrievedAt: new Date().toISOString(),
    width: downloaded.width,
    height: downloaded.height,
    mimeType: downloaded.mimeType,
    sha256,
  }
  const manifestPath = path.join(options.projectDirectory, '.media', 'manifest.json')
  let manifest: MediaManifest = { version: 1, assets: [] }
  try {
    const parsed = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as MediaManifest
    if (parsed?.version === 1 && Array.isArray(parsed.assets)) manifest = parsed
  } catch {
    // First ingested image creates the manifest.
  }
  manifest.assets = [
    ...manifest.assets.filter((asset) => asset.sha256 !== sha256),
    record,
  ]
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

  return {
    id: String(record.id),
    name: candidate.title,
    path: destination,
    relativePath: projectRelativePath,
    projectRelativePath,
    sourcePageUrl: candidate.sourcePageUrl,
    sourceImageUrl: candidate.imageUrl,
    width: downloaded.width,
    height: downloaded.height,
    mimeType: downloaded.mimeType,
    provider: candidate.provider,
    author: candidate.author,
    license: candidate.license || 'unknown',
    attribution: candidate.attribution,
    sha256,
  }
}
