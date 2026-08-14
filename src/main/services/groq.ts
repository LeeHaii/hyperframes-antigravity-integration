import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { dir as compositorDirectory } from '@remotion/compositor-win32-x64-msvc'
import { SceneSegment, TranscriptionProgress } from '../../types/editor'
import { getMediaDuration } from './mediaMetadata'
import { normalizeTranscriptScenes } from './transcriptTiming'

const execFileAsync = promisify(execFile)
const GROQ_API_ROOT = 'https://api.groq.com/openai/v1'
const PRIMARY_TRANSCRIPTION_MODEL = 'whisper-large-v3-turbo'
const ACCURACY_TRANSCRIPTION_MODEL = 'whisper-large-v3'
const KEYWORD_MODEL = 'llama-3.1-8b-instant'
const TARGET_CHUNK_SEC = 36
const MIN_CHUNK_SEC = 28
const MAX_CHUNK_SEC = 42
const OVERLAP_SEC = 2.5
const MAX_ACCURACY_RETRIES = 4
const MAX_GAP_RECOVERIES = 6

type SilenceRange = { start: number; end: number }
type TimedWord = { text: string; start: number; end: number }
type ChunkWindow = {
  index: number
  coreStart: number
  coreEnd: number
  start: number
  end: number
  filePath: string
}
type GroqWord = { word?: unknown; start?: unknown; end?: unknown }
type GroqSegment = {
  text?: unknown
  start?: unknown
  end?: unknown
  avg_logprob?: unknown
  compression_ratio?: unknown
  no_speech_prob?: unknown
}
type GroqTranscription = {
  text?: unknown
  language?: unknown
  duration?: unknown
  words?: GroqWord[]
  segments?: GroqSegment[]
}

class GroqApiError extends Error {
  status: number
  retryAfterMs: number | null

  constructor(message: string, status: number, retryAfterMs: number | null) {
    super(message)
    this.name = 'GroqApiError'
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

function retryAfterMilliseconds(value: string | null) {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null
}

function isRetryableError(error: unknown) {
  if (error instanceof GroqApiError) {
    return (
      error.status === 408 ||
      error.status === 409 ||
      error.status === 422 ||
      error.status === 429 ||
      error.status >= 500
    )
  }
  const message = error instanceof Error ? error.message : String(error)
  return /(?:ECONNRESET|ETIMEDOUT|fetch failed|network|abort|timeout)/i.test(message)
}

async function withRetries<T>(operation: () => Promise<T>) {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!isRetryableError(error) || attempt === 3) throw error
      const retryAfter =
        error instanceof GroqApiError ? error.retryAfterMs : null
      if (retryAfter !== null && retryAfter > 30_000) {
        throw new Error(
          'The Groq transcription quota is exhausted for now. Check the Groq Console limits page or try again after the reported reset time.'
        )
      }
      await delay(Math.max(1000 * 2 ** attempt, retryAfter ?? 0))
    }
  }
  throw lastError
}

async function readGroqError(response: Response) {
  const raw = await response.text()
  let message = raw
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; code?: string }
    }
    message = parsed.error?.message || parsed.error?.code || raw
  } catch {
    // Keep the response text when Groq did not return JSON.
  }
  if (response.status === 401 || response.status === 403) {
    message = `Groq rejected the API key. ${message}`
  } else if (response.status === 413) {
    message = `Groq rejected an audio chunk as too large. ${message}`
  } else if (response.status === 429) {
    message = `Groq rate limit reached. ${message}`
  }
  return new GroqApiError(
    message || `Groq request failed with HTTP ${response.status}.`,
    response.status,
    retryAfterMilliseconds(response.headers.get('retry-after'))
  )
}

async function groqJsonRequest<T>(
  endpoint: string,
  apiKey: string,
  init: RequestInit
) {
  return await withRetries(async () => {
    const response = await fetch(`${GROQ_API_ROOT}${endpoint}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(90_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...init.headers,
      },
    })
    if (!response.ok) throw await readGroqError(response)
    return (await response.json()) as T
  })
}

export async function transcribeAudio(
  filePath: string,
  apiKey: string,
  onProgress: (progress: TranscriptionProgress) => void = () => undefined
): Promise<SceneSegment[]> {
  const trimmedApiKey = apiKey.trim()
  if (!trimmedApiKey) throw new Error('A Groq API key is required.')

  const audioDurationSec = await getMediaDuration(filePath)
  if (!audioDurationSec) {
    throw new Error('The voiceover duration could not be measured.')
  }

  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'rhymx-transcription-')
  )

  try {
    onProgress({
      stage: 'preparing',
      completed: 0,
      total: 0,
      message: 'Analyzing speech pauses',
    })
    const silenceRanges = await detectSilenceRanges(filePath, audioDurationSec)
    const windows = buildChunkWindows(
      audioDurationSec,
      silenceRanges,
      temporaryDirectory
    )

    onProgress({
      stage: 'preparing',
      completed: 0,
      total: windows.length,
      message: `Preparing ${windows.length} lossless audio chunks`,
    })
    for (const window of windows) {
      await extractAudioChunk(filePath, window)
    }

    let collectedWords: TimedWord[] = []
    let recoveryPasses = 0
    let accuracyRetries = 0

    for (const window of windows) {
      onProgress({
        stage: 'transcribing',
        completed: window.index,
        total: windows.length,
        message: `Groq Whisper chunk ${window.index + 1} of ${windows.length}`,
      })
      const audioBytes = await fs.readFile(window.filePath)
      const localDuration = window.end - window.start
      const primary = await requestGroqTranscript(
        trimmedApiKey,
        audioBytes,
        localDuration,
        PRIMARY_TRANSCRIPTION_MODEL
      )
      let words = wordsFromGroqTranscript(primary, localDuration)
      const speechDuration = speechDurationInWindow(
        window.start,
        window.end,
        silenceRanges
      )

      if (
        accuracyRetries < MAX_ACCURACY_RETRIES &&
        shouldRetryForAccuracy(primary, words, speechDuration)
      ) {
        accuracyRetries += 1
        recoveryPasses += 1
        onProgress({
          stage: 'transcribing',
          completed: window.index,
          total: windows.length,
          message: `Accuracy-checking chunk ${window.index + 1} with Whisper Large V3`,
        })
        const accurate = await requestGroqTranscript(
          trimmedApiKey,
          audioBytes,
          localDuration,
          ACCURACY_TRANSCRIPTION_MODEL
        )
        const accurateWords = wordsFromGroqTranscript(accurate, localDuration)
        if (transcriptWordScore(accurateWords) > transcriptWordScore(words)) {
          words = accurateWords
        }
      }

      collectedWords.push(...mapOwnedWords(words, window, windows.length))
      onProgress({
        stage: 'transcribing',
        completed: window.index + 1,
        total: windows.length,
        message: `Timestamped chunk ${window.index + 1} of ${windows.length}`,
      })
    }

    collectedWords = mergeTimedWords(collectedWords)
    if (collectedWords.length === 0) {
      throw new Error('Groq Whisper returned an empty transcript.')
    }

    const coverageGaps = findUncoveredSpeechRanges(
      collectedWords,
      silenceRanges,
      audioDurationSec
    )
      .filter((gap) => gap.end - gap.start >= 1.35)
      .sort(
        (first, second) =>
          second.end - second.start - (first.end - first.start)
      )
      .slice(0, MAX_GAP_RECOVERIES)
      .sort((first, second) => first.start - second.start)

    for (const [index, gap] of coverageGaps.entries()) {
      const recoveryStart = Math.max(0, gap.start - 1.25)
      const recoveryEnd = Math.min(audioDurationSec, gap.end + 1.25)
      const recoveryWindow: ChunkWindow = {
        index,
        coreStart: gap.start,
        coreEnd: gap.end,
        start: recoveryStart,
        end: recoveryEnd,
        filePath: path.join(
          temporaryDirectory,
          `coverage_${String(index + 1).padStart(3, '0')}.wav`
        ),
      }
      onProgress({
        stage: 'transcribing',
        completed: windows.length,
        total: windows.length,
        message: `Recovering uncovered speech near ${formatTimestamp(gap.start)}`,
      })
      try {
        await extractAudioChunk(filePath, recoveryWindow)
        const recoveryBytes = await fs.readFile(recoveryWindow.filePath)
        const recovered = await requestGroqTranscript(
          trimmedApiKey,
          recoveryBytes,
          recoveryEnd - recoveryStart,
          ACCURACY_TRANSCRIPTION_MODEL
        )
        const mapped = wordsFromGroqTranscript(
          recovered,
          recoveryEnd - recoveryStart
        )
          .map((word) => ({
            ...word,
            start: recoveryStart + word.start,
            end: recoveryStart + word.end,
          }))
          .filter((word) => {
            const midpoint = (word.start + word.end) / 2
            return midpoint >= gap.start && midpoint <= gap.end
          })
        if (mapped.length > 0) {
          recoveryPasses += 1
          collectedWords = mergeTimedWords([...collectedWords, ...mapped])
        }
      } catch (error) {
        console.warn(
          `Could not recover possible transcript gap near ${formatTimestamp(gap.start)}.`,
          error
        )
      }
    }

    let scenes = normalizeTranscriptScenes(
      scenesFromTimedWords(collectedWords),
      audioDurationSec
    )
    if (scenes.length === 0 || wordCount(scenes) === 0) {
      throw new Error('Groq Whisper returned an empty transcript after validation.')
    }

    const remainingUncoveredSpeech = findUncoveredSpeechRanges(
      collectedWords,
      silenceRanges,
      audioDurationSec
    ).reduce((total, gap) => total + gap.end - gap.start, 0)
    if (remainingUncoveredSpeech > 6) {
      console.warn(
        `Transcript coverage check found ${remainingUncoveredSpeech.toFixed(1)} seconds of non-silent audio without word timestamps.`
      )
    }

    onProgress({
      stage: 'keywords',
      completed: 0,
      total: Math.ceil(scenes.length / 40),
      message: 'Generating stock-footage search phrases with Groq',
    })
    scenes = await addSearchKeywords(
      trimmedApiKey,
      scenes,
      onProgress
    )

    console.info(
      `Groq transcribed ${audioDurationSec.toFixed(1)}s into ${collectedWords.length} timed words and ${scenes.length} scenes (${recoveryPasses} recovery passes).`
    )
    return scenes
  } catch (error) {
    console.error('Groq transcription error:', error)
    throw error
  } finally {
    await removeTemporaryDirectory(temporaryDirectory)
  }
}

async function requestGroqTranscript(
  apiKey: string,
  audioBytes: Buffer,
  durationSec: number,
  model: string
) {
  const payload = new Uint8Array(audioBytes.length)
  payload.set(audioBytes)
  const form = new FormData()
  form.append('file', new Blob([payload], { type: 'audio/wav' }), 'voiceover.wav')
  form.append('model', model)
  form.append('response_format', 'verbose_json')
  form.append('temperature', '0')
  form.append('timestamp_granularities[]', 'word')
  form.append('timestamp_granularities[]', 'segment')

  let response: GroqTranscription
  try {
    response = await groqJsonRequest<GroqTranscription>(
      '/audio/transcriptions',
      apiKey,
      { method: 'POST', body: form }
    )
  } catch (error) {
    if (
      model === PRIMARY_TRANSCRIPTION_MODEL &&
      error instanceof GroqApiError &&
      error.status === 404
    ) {
      return await requestGroqTranscript(
        apiKey,
        audioBytes,
        durationSec,
        ACCURACY_TRANSCRIPTION_MODEL
      )
    }
    throw error
  }
  const words = wordsFromGroqTranscript(response, durationSec)
  if (words.length === 0 && !String(response.text || '').trim()) {
    throw new Error(`${model} returned no speech or timestamps.`)
  }
  return response
}

function wordsFromGroqTranscript(
  transcript: GroqTranscription,
  durationSec: number
) {
  const words = (transcript.words || [])
    .map((word) => ({
      text: String(word.word || '').trim(),
      start: clampTimestamp(word.start, durationSec),
      end: clampTimestamp(word.end, durationSec),
    }))
    .filter(
      (word) =>
        Boolean(word.text) &&
        word.start !== null &&
        word.end !== null &&
        word.end > word.start
    )
    .map((word) => ({
      text: word.text,
      start: word.start as number,
      end: word.end as number,
    }))
  if (words.length > 0) return mergeTimedWords(words)

  const segmentWords = (transcript.segments || []).flatMap((segment) => {
    const start = clampTimestamp(segment.start, durationSec)
    const end = clampTimestamp(segment.end, durationSec)
    if (start === null || end === null || end <= start) return []
    return distributeTextAcrossTime(String(segment.text || ''), start, end)
  })
  if (segmentWords.length > 0) return mergeTimedWords(segmentWords)

  return distributeTextAcrossTime(
    String(transcript.text || ''),
    0,
    durationSec
  )
}

function clampTimestamp(value: unknown, durationSec: number) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number)
    ? Math.max(0, Math.min(durationSec, number))
    : null
}

function distributeTextAcrossTime(text: string, start: number, end: number) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.map((word, index) => ({
    text: word,
    start: start + ((end - start) * index) / words.length,
    end: start + ((end - start) * (index + 1)) / words.length,
  }))
}

function shouldRetryForAccuracy(
  transcript: GroqTranscription,
  words: TimedWord[],
  speechDuration: number
) {
  if (speechDuration >= 5 && words.length < Math.max(2, speechDuration * 0.22)) {
    return true
  }
  const suspiciousSegments = (transcript.segments || []).filter((segment) => {
    const averageLogProbability = Number(segment.avg_logprob)
    const compressionRatio = Number(segment.compression_ratio)
    const noSpeechProbability = Number(segment.no_speech_prob)
    return (
      (Number.isFinite(averageLogProbability) && averageLogProbability < -0.9) ||
      (Number.isFinite(compressionRatio) && compressionRatio > 2.5) ||
      (Number.isFinite(noSpeechProbability) &&
        noSpeechProbability > 0.75 &&
        String(segment.text || '').trim().length > 0)
    )
  })
  return suspiciousSegments.length >= 2
}

function transcriptWordScore(words: TimedWord[]) {
  if (words.length === 0) return 0
  const timedDuration = words.reduce(
    (total, word) => total + Math.max(0, word.end - word.start),
    0
  )
  return words.length + Math.min(words.length, timedDuration) * 0.05
}

function mapOwnedWords(
  words: TimedWord[],
  window: ChunkWindow,
  totalWindows: number
) {
  return words
    .map((word) => ({
      ...word,
      start: window.start + word.start,
      end: window.start + word.end,
    }))
    .filter((word) => {
      const midpoint = (word.start + word.end) / 2
      const ownsLowerBoundary = window.index === 0 || midpoint >= window.coreStart
      const ownsUpperBoundary =
        window.index === totalWindows - 1 || midpoint < window.coreEnd
      return ownsLowerBoundary && ownsUpperBoundary
    })
}

function normalizedWord(text: string) {
  return text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

function mergeTimedWords(words: TimedWord[]) {
  const output: TimedWord[] = []
  for (const word of [...words].sort(
    (first, second) => first.start - second.start || first.end - second.end
  )) {
    if (!word.text.trim() || word.end <= word.start) continue
    const duplicate = output
      .slice(-3)
      .find(
        (candidate) =>
          normalizedWord(candidate.text) &&
          normalizedWord(candidate.text) === normalizedWord(word.text) &&
          Math.abs(candidate.start - word.start) <= 0.28 &&
          Math.abs(candidate.end - word.end) <= 0.45
      )
    if (duplicate) {
      duplicate.start = Math.min(duplicate.start, word.start)
      duplicate.end = Math.max(duplicate.end, word.end)
      if (word.text.length > duplicate.text.length) duplicate.text = word.text
      continue
    }
    output.push({ ...word, text: word.text.trim() })
  }
  return output
}

function scenesFromTimedWords(words: TimedWord[]): SceneSegment[] {
  const groups: TimedWord[][] = []
  let group: TimedWord[] = []
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]
    group.push(word)
    const duration = word.end - group[0].start
    const next = words[index + 1]
    const pauseAfter = next ? Math.max(0, next.start - word.end) : Infinity
    const sentenceEnding = /[.!?…]["')\]]?$/.test(word.text)
    const shouldBreak =
      !next ||
      (duration >= 2.6 && sentenceEnding) ||
      (duration >= 4.2 && pauseAfter >= 0.2) ||
      duration >= 5.6
    if (shouldBreak) {
      groups.push(group)
      group = []
    }
  }

  if (
    groups.length >= 2 &&
    groups.at(-1)![groups.at(-1)!.length - 1].end -
      groups.at(-1)![0].start <
      1.6
  ) {
    const last = groups.pop()!
    const previous = groups.at(-1)!
    const mergedDuration = last[last.length - 1].end - previous[0].start
    if (mergedDuration <= 6.5) previous.push(...last)
    else groups.push(last)
  }

  return groups.map((sceneWords, index) => {
    const startTimeSec = sceneWords[0].start
    const endTimeSec = sceneWords[sceneWords.length - 1].end
    return {
      id: `scene_${index + 1}`,
      startTimeSec,
      endTimeSec,
      durationSec: endTimeSec - startTimeSec,
      transcriptText: joinTranscriptWords(sceneWords),
      keywords: [],
      media: null,
      trackId: '',
      volume: 1,
      scale: 1,
      opacity: 1,
    }
  })
}

function joinTranscriptWords(words: TimedWord[]) {
  return words
    .map((word) => word.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([,.;:!?%…)\]}])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .trim()
}

function buildChunkWindows(
  durationSec: number,
  silenceRanges: SilenceRange[],
  temporaryDirectory: string
) {
  const windows: ChunkWindow[] = []
  let coreStart = 0
  while (coreStart < durationSec - 0.01) {
    const remaining = durationSec - coreStart
    let coreEnd = durationSec
    if (remaining > MAX_CHUNK_SEC) {
      const desired = coreStart + TARGET_CHUNK_SEC
      const minimum = coreStart + MIN_CHUNK_SEC
      const maximum = Math.min(durationSec, coreStart + MAX_CHUNK_SEC)
      const candidates = silenceRanges
        .map((silence) => (silence.start + silence.end) / 2)
        .filter((candidate) => candidate >= minimum && candidate <= maximum)
        .sort(
          (first, second) =>
            Math.abs(first - desired) - Math.abs(second - desired)
        )
      coreEnd = candidates[0] ?? Math.min(durationSec, desired)
    }
    const index = windows.length
    windows.push({
      index,
      coreStart,
      coreEnd,
      start: index === 0 ? 0 : Math.max(0, coreStart - OVERLAP_SEC),
      end:
        coreEnd >= durationSec
          ? durationSec
          : Math.min(durationSec, coreEnd + OVERLAP_SEC),
      filePath: path.join(
        temporaryDirectory,
        `chunk_${String(index + 1).padStart(3, '0')}.wav`
      ),
    })
    coreStart = coreEnd
  }
  return windows
}

function ffmpegPath() {
  return path
    .join(compositorDirectory, 'ffmpeg.exe')
    .replace(
      `${path.sep}app.asar${path.sep}`,
      `${path.sep}app.asar.unpacked${path.sep}`
    )
}

async function extractAudioChunk(sourcePath: string, window: ChunkWindow) {
  await execFileAsync(
    ffmpegPath(),
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      sourcePath,
      '-ss',
      window.start.toFixed(3),
      '-t',
      (window.end - window.start).toFixed(3),
      '-map',
      '0:a:0',
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'pcm_s16le',
      window.filePath,
    ],
    {
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
    }
  )
}

async function detectSilenceRanges(filePath: string, durationSec: number) {
  try {
    const { stderr } = await execFileAsync(
      ffmpegPath(),
      [
        '-hide_banner',
        '-nostats',
        '-i',
        filePath,
        '-af',
        'silencedetect=noise=-42dB:d=0.18',
        '-f',
        'null',
        '-',
      ],
      {
        windowsHide: true,
        timeout: 120000,
        maxBuffer: 8 * 1024 * 1024,
      }
    )
    const events = Array.from(
      stderr.matchAll(/silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g)
    )
    const ranges: SilenceRange[] = []
    let openStart: number | null = null
    for (const event of events) {
      const value = Math.max(0, Math.min(durationSec, Number(event[2])))
      if (event[1] === 'start') {
        openStart = value
      } else {
        const start = openStart ?? 0
        if (value > start) ranges.push({ start, end: value })
        openStart = null
      }
    }
    if (openStart !== null && durationSec > openStart) {
      ranges.push({ start: openStart, end: durationSec })
    }
    return ranges
  } catch (error) {
    console.warn('Could not detect speech pauses; using fixed transcription chunks.', error)
    return []
  }
}

function speechDurationInWindow(
  start: number,
  end: number,
  silenceRanges: SilenceRange[]
) {
  const silenceDuration = silenceRanges.reduce((total, silence) => {
    const overlap = Math.max(
      0,
      Math.min(end, silence.end) - Math.max(start, silence.start)
    )
    return total + overlap
  }, 0)
  return Math.max(0, end - start - silenceDuration)
}

function findUncoveredSpeechRanges(
  words: TimedWord[],
  silenceRanges: SilenceRange[],
  durationSec: number
) {
  const speechRanges: Array<{ start: number; end: number }> = []
  let cursor = 0
  for (const silence of silenceRanges) {
    if (silence.start > cursor) speechRanges.push({ start: cursor, end: silence.start })
    cursor = Math.max(cursor, silence.end)
  }
  if (cursor < durationSec) speechRanges.push({ start: cursor, end: durationSec })

  const gaps: Array<{ start: number; end: number }> = []
  const orderedWords = [...words].sort(
    (first, second) => first.start - second.start
  )
  for (const speech of speechRanges) {
    let coveredUntil = speech.start
    for (const word of orderedWords) {
      if (word.end <= speech.start) continue
      if (word.start >= speech.end) break
      const coveredStart = Math.max(speech.start, word.start)
      const coveredEnd = Math.min(speech.end, word.end)
      if (coveredStart > coveredUntil) {
        gaps.push({ start: coveredUntil, end: coveredStart })
      }
      coveredUntil = Math.max(coveredUntil, coveredEnd)
    }
    if (coveredUntil < speech.end) gaps.push({ start: coveredUntil, end: speech.end })
  }
  return gaps.filter((gap) => gap.end - gap.start > 0.05)
}

function wordCount(scenes: Array<{ transcriptText: string }>) {
  return scenes.reduce(
    (count, scene) =>
      count + scene.transcriptText.trim().split(/\s+/).filter(Boolean).length,
    0
  )
}

function formatTimestamp(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60)
  const remainder = Math.floor(Math.max(0, seconds) % 60)
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

async function addSearchKeywords(
  apiKey: string,
  scenes: SceneSegment[],
  onProgress: (progress: TranscriptionProgress) => void
) {
  const batches: SceneSegment[][] = []
  for (let index = 0; index < scenes.length; index += 40) {
    batches.push(scenes.slice(index, index + 40))
  }
  const keywordMap = new Map<string, string[]>()

  for (const [index, batch] of batches.entries()) {
    try {
      const response = await groqJsonRequest<{
        choices?: Array<{ message?: { content?: string } }>
      }>('/chat/completions', apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: KEYWORD_MODEL,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Return only a JSON object with a scenes array. Each item must have the supplied id and 2 or 3 concise English stock-video search phrases in keywords. Keep phrases concrete, visual, and searchable.',
            },
            {
              role: 'user',
              content: JSON.stringify(
                batch.map(({ id, transcriptText }) => ({ id, transcriptText }))
              ),
            },
          ],
        }),
      })
      const content = response.choices?.[0]?.message?.content
      if (content) {
        const parsed = JSON.parse(content) as {
          scenes?: Array<{ id?: string; keywords?: unknown[] }>
        }
        for (const result of parsed.scenes || []) {
          if (!result.id || !Array.isArray(result.keywords)) continue
          keywordMap.set(
            result.id,
            result.keywords
              .map((keyword) => String(keyword).trim())
              .filter(Boolean)
              .slice(0, 3)
          )
        }
      }
    } catch (error) {
      console.warn(`Could not generate Groq keywords for batch ${index + 1}.`, error)
    }
    onProgress({
      stage: 'keywords',
      completed: index + 1,
      total: batches.length,
      message: `Generated search phrases for batch ${index + 1} of ${batches.length}`,
    })
  }

  return scenes.map((scene) => ({
    ...scene,
    keywords: keywordMap.get(scene.id) || fallbackKeywords(scene.transcriptText),
  }))
}

function fallbackKeywords(text: string) {
  const words = text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 5)
  return words.length ? [words.join(' ')] : ['general background video']
}

async function removeTemporaryDirectory(directory: string) {
  const resolvedDirectory = path.resolve(directory)
  const temporaryRoot = path.resolve(os.tmpdir())
  if (
    path.basename(resolvedDirectory).startsWith('rhymx-transcription-') &&
    resolvedDirectory.startsWith(`${temporaryRoot}${path.sep}`)
  ) {
    try {
      await fs.rm(resolvedDirectory, {
        recursive: true,
        force: true,
        maxRetries: 8,
        retryDelay: 250,
      })
    } catch (error) {
      console.warn('Could not remove temporary transcription files.', error)
    }
  }
}
