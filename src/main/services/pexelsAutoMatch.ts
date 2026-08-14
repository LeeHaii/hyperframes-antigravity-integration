import axios from 'axios'
import {
  PexelsAutoMatchProgress,
  PexelsAutoMatchResult,
  SceneSegment,
} from '../../types/editor'

type PexelsVideoFile = {
  id: number
  quality: string
  file_type: string
  width: number | null
  height: number | null
  link: string
}

type PexelsVideo = {
  id: number
  width: number
  height: number
  duration: number
  image: string
  url: string
  user?: { name?: string; url?: string }
  video_files?: PexelsVideoFile[]
}

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'and',
  'are',
  'because',
  'been',
  'before',
  'being',
  'but',
  'can',
  'could',
  'does',
  'for',
  'from',
  'have',
  'here',
  'into',
  'just',
  'more',
  'not',
  'our',
  'that',
  'the',
  'their',
  'there',
  'these',
  'they',
  'this',
  'through',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'will',
  'with',
  'would',
  'you',
  'your',
])

function sceneQueries(scene: SceneSegment) {
  const recommended = (scene.keywords || [])
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 3)
  const fallback = scene.transcriptText
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .slice(0, 5)
    .join(' ')
    .slice(0, 100)
  return Array.from(
    new Set([...recommended, fallback].filter(Boolean).map((query) => query.slice(0, 100)))
  ).slice(0, 3)
}

function bestVideoFile(video: PexelsVideo) {
  const files = (video.video_files || []).filter(
    (file) =>
      file.file_type === 'video/mp4' &&
      Boolean(file.link) &&
      Boolean(file.width) &&
      Boolean(file.height)
  )
  return (
    files
      .filter((file) => (file.width || 0) <= 1920)
      .sort((first, second) => (second.width || 0) - (first.width || 0))[0] ||
    files.sort((first, second) => (first.width || 0) - (second.width || 0))[0]
  )
}

function videoScore(video: PexelsVideo, sceneDuration: number, used: Set<number>) {
  const file = bestVideoFile(video)
  if (!file || video.duration + 0.05 < sceneDuration) return Number.NEGATIVE_INFINITY
  const ratio = (file.width || video.width) / Math.max(1, file.height || video.height)
  const aspectScore = 30 - Math.abs(16 / 9 - ratio) * 30
  const durationScore = 20 - Math.min(20, Math.abs(video.duration - sceneDuration))
  const resolutionScore = Math.min(20, (file.width || 0) / 96)
  const reusePenalty = used.has(video.id) ? 100 : 0
  return aspectScore + durationScore + resolutionScore - reusePenalty
}

export async function autoMatchPexelsVideos(
  scenes: SceneSegment[],
  apiKey: string,
  onProgress: (progress: PexelsAutoMatchProgress) => void
): Promise<PexelsAutoMatchResult> {
  const key = apiKey.trim()
  if (!key) throw new Error('A Pexels API key is required for automatic stock footage.')

  const output = scenes.map((scene) => ({ ...scene }))
  const warnings: string[] = []
  const usedVideoIds = new Set<number>()
  const searchCache = new Map<string, Promise<PexelsVideo[]>>()
  const maximumSearches = 40
  let searchCount = 0
  let nextIndex = 0
  let completed = 0
  let matched = 0

  const search = (query: string) => {
    const cacheKey = query.toLowerCase()
    const cached = searchCache.get(cacheKey)
    if (cached) return cached
    if (searchCount >= maximumSearches) return Promise.resolve([])
    searchCount += 1
    const request = axios
      .get('https://api.pexels.com/v1/videos/search', {
        headers: { Authorization: key },
        params: {
          query,
          orientation: 'landscape',
          size: 'medium',
          locale: 'en-US',
          per_page: 12,
        },
        timeout: 20000,
      })
      .then((response) => (response.data.videos || []) as PexelsVideo[])
    searchCache.set(cacheKey, request)
    return request
  }

  const worker = async () => {
    while (nextIndex < output.length) {
      const sceneIndex = nextIndex
      nextIndex += 1
      const scene = output[sceneIndex]
      const queries = sceneQueries(scene)
      let progressQuery = queries[0]

      try {
        if (queries.length === 0) {
          warnings.push(`Scene ${sceneIndex + 1} has no usable search keyword.`)
        } else {
          let selected: PexelsVideo | undefined
          let file: PexelsVideoFile | undefined
          for (const query of queries) {
            progressQuery = query
            const videos = await search(query)
            selected = videos
              .map((video) => ({
                video,
                score: videoScore(video, scene.durationSec, usedVideoIds),
              }))
              .filter((candidate) => Number.isFinite(candidate.score))
              .sort((first, second) => second.score - first.score)[0]?.video
            file = selected ? bestVideoFile(selected) : undefined
            if (selected && file) break
          }

          if (selected && file) {
            usedVideoIds.add(selected.id)
            const creatorName = selected.user?.name || 'Pexels contributor'
            scene.media = {
              id: `pexels_auto_${selected.id}_${scene.id}`,
              type: 'pexels_video',
              kind: 'video',
              sourceUrl: file.link,
              thumbnailUrl: selected.image,
              title: `Video by ${creatorName} on Pexels`,
              sourceStartSec: 0,
              sourceDurationSec: selected.duration,
              providerUrl: selected.url,
              creatorName,
              creatorUrl: selected.user?.url,
            }
            matched += 1
          } else {
            warnings.push(
              `No duration-compatible Pexels video found for “${queries.join('” or “')}”.`
            )
          }
        }
      } catch (error: any) {
        const status = error?.response?.status
        const message =
          error?.response?.data?.error ||
          error?.response?.data?.message ||
          error?.message ||
          'Pexels search failed.'
        if (status === 401 || status === 403) {
          throw new Error(`Pexels rejected the API key: ${message}`)
        }
        warnings.push(`Scene ${sceneIndex + 1}: ${message}`)
      } finally {
        completed += 1
        onProgress({
          completed,
          total: output.length,
          matched,
          sceneId: scene.id,
          query: progressQuery,
        })
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(3, Math.max(1, output.length)) }, () => worker())
  )

  if (searchCount >= maximumSearches && output.length > maximumSearches) {
    warnings.push(
      `Automatic matching was limited to ${maximumSearches} unique searches to protect the Pexels API quota.`
    )
  }

  return {
    scenes: output,
    matchedCount: matched,
    unmatchedCount: output.length - matched,
    warnings,
  }
}
