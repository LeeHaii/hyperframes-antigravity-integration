import { ProjectDocument, SceneSegment } from '../../types/editor'

const MIN_DURATION_SEC = 1 / 30

function finiteNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

export function parseTimestampSec(value: unknown): number | null {
  if (typeof value === 'string' && value.includes(':')) {
    const parts = value
      .trim()
      .split(':')
      .map((part) => Number(part))
    if (
      parts.length >= 2 &&
      parts.length <= 3 &&
      parts.every((part) => Number.isFinite(part) && part >= 0)
    ) {
      return parts.reduce((seconds, part) => seconds * 60 + part, 0)
    }
    return null
  }
  const number = finiteNumber(value)
  return number === null ? null : Math.max(0, number)
}

type RawScene = Partial<SceneSegment> & Record<string, unknown>

export function normalizeTranscriptScenes(
  rawScenes: unknown,
  audioDurationSec: number | null
): SceneSegment[] {
  if (!Array.isArray(rawScenes)) return []

  const parsed = rawScenes
    .map((raw, index) => {
      const scene = (raw || {}) as RawScene
      const start = parseTimestampSec(scene.startTimeSec) ?? 0
      const suppliedDuration = parseTimestampSec(scene.durationSec)
      const end =
        parseTimestampSec(scene.endTimeSec) ??
        start + Math.max(MIN_DURATION_SEC, suppliedDuration ?? 5)
      return {
        id: String(scene.id || `scene_${index + 1}`),
        startTimeSec: start,
        endTimeSec: Math.max(start + MIN_DURATION_SEC, end),
        durationSec: Math.max(MIN_DURATION_SEC, end - start),
        transcriptText: String(scene.transcriptText || '').trim(),
        keywords: Array.isArray(scene.keywords)
          ? scene.keywords
              .map((keyword) => String(keyword).trim())
              .filter(Boolean)
              .slice(0, 3)
          : [],
        media: scene.media || null,
        trackId: String(scene.trackId || ''),
        volume: finiteNumber(scene.volume) ?? 1,
        scale: finiteNumber(scene.scale) ?? 1,
        opacity: finiteNumber(scene.opacity) ?? 1,
      } satisfies SceneSegment
    })
    .sort(
      (first, second) =>
        first.startTimeSec - second.startTimeSec ||
        first.endTimeSec - second.endTimeSec
    )

  const rawTimelineEnd = parsed.reduce(
    (maximum, scene) => Math.max(maximum, scene.endTimeSec),
    0
  )
  const measuredDuration =
    audioDurationSec && Number.isFinite(audioDurationSec) && audioDurationSec > 0
      ? audioDurationSec
      : null
  const tolerance = measuredDuration
    ? Math.max(0.5, measuredDuration * 0.005)
    : Number.POSITIVE_INFINITY
  const scale =
    measuredDuration &&
    rawTimelineEnd > measuredDuration + tolerance &&
    rawTimelineEnd > 0
      ? measuredDuration / rawTimelineEnd
      : 1

  let previousEnd = 0
  const calibrated: SceneSegment[] = []
  for (const scene of parsed) {
    const scaledStart = scene.startTimeSec * scale
    const scaledEnd = scene.endTimeSec * scale
    const startTimeSec = Math.max(previousEnd, scaledStart)
    const maximumEnd = measuredDuration ?? Number.POSITIVE_INFINITY
    const endTimeSec = Math.min(
      maximumEnd,
      Math.max(startTimeSec + MIN_DURATION_SEC, scaledEnd)
    )
    if (endTimeSec <= startTimeSec) continue
    calibrated.push({
      ...scene,
      startTimeSec,
      endTimeSec,
      durationSec: endTimeSec - startTimeSec,
    })
    previousEnd = endTimeSec
  }

  return splitLongScenes(calibrated)
}

function splitLongScenes(scenes: SceneSegment[]) {
  const normalized: SceneSegment[] = []
  for (const scene of scenes) {
    const duration = scene.endTimeSec - scene.startTimeSec
    const chunkCount = duration > 6.5 ? Math.max(2, Math.round(duration / 5)) : 1
    const words = scene.transcriptText.split(/\s+/).filter(Boolean)

    for (let index = 0; index < chunkCount; index += 1) {
      const chunkStart = scene.startTimeSec + (duration * index) / chunkCount
      const chunkEnd = scene.startTimeSec + (duration * (index + 1)) / chunkCount
      const wordStart = Math.round((words.length * index) / chunkCount)
      const wordEnd = Math.round((words.length * (index + 1)) / chunkCount)
      normalized.push({
        ...scene,
        id: `scene_${normalized.length + 1}`,
        startTimeSec: chunkStart,
        endTimeSec: chunkEnd,
        durationSec: chunkEnd - chunkStart,
        transcriptText: words.slice(wordStart, wordEnd).join(' '),
      })
    }
  }
  return normalized
}

export function repairProjectTranscriptTiming(
  project: ProjectDocument,
  actualAudioDuration: number
) {
  if (!project.audioFile || !Number.isFinite(actualAudioDuration) || actualAudioDuration <= 0) {
    return { repaired: false, previousTimelineDuration: 0 }
  }

  const subtitleEnd = (project.subtitles || []).reduce(
    (maximum, subtitle) => Math.max(maximum, subtitle.endTimeSec),
    0
  )
  const transcriptSceneEnd = (project.scenes || [])
    .filter((scene) => Boolean(scene.transcriptText?.trim()))
    .reduce((maximum, scene) => Math.max(maximum, scene.endTimeSec), 0)
  const transcriptTimelineEnd = Math.max(subtitleEnd, transcriptSceneEnd)
  const savedAudioDuration = project.audioFile.duration || 0
  const tolerance = Math.max(0.75, actualAudioDuration * 0.01)
  const shouldScale =
    transcriptTimelineEnd > actualAudioDuration + tolerance &&
    savedAudioDuration > actualAudioDuration + tolerance

  project.audioFile.duration = actualAudioDuration
  if (!shouldScale || transcriptTimelineEnd <= 0) {
    return { repaired: false, previousTimelineDuration: transcriptTimelineEnd }
  }

  const scale = actualAudioDuration / transcriptTimelineEnd
  project.subtitles = (project.subtitles || []).map((subtitle) => ({
    ...subtitle,
    startTimeSec: subtitle.startTimeSec * scale,
    endTimeSec: Math.min(actualAudioDuration, subtitle.endTimeSec * scale),
  }))
  project.scenes = (project.scenes || []).map((scene) => {
    if (!scene.transcriptText?.trim()) return scene
    const startTimeSec = scene.startTimeSec * scale
    const endTimeSec = Math.min(actualAudioDuration, scene.endTimeSec * scale)
    return {
      ...scene,
      startTimeSec,
      endTimeSec,
      durationSec: Math.max(MIN_DURATION_SEC, endTimeSec - startTimeSec),
    }
  })
  project.updatedAt = new Date().toISOString()
  project.timingRepair = {
    previousTimelineDuration: transcriptTimelineEnd,
    actualAudioDuration,
  }
  return { repaired: true, previousTimelineDuration: transcriptTimelineEnd }
}
