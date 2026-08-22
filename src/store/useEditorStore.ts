import { create } from 'zustand'
import {
  AgentChatMessage,
  AppScreen,
  LibraryAsset,
  MediaAsset,
  ProjectDocument,
  SceneSegment,
  SubtitleSegment,
  SubtitleSettings,
  TimelineAudioClip,
  TrackSettings,
  VideoTrack,
} from '../types/editor'

const defaultSubtitleSettings: SubtitleSettings = {
  enabled: true,
  fontSize: 48,
  fontFamily: 'Inter, Arial, sans-serif',
  fontWeight: 650,
  textColor: '#ffffff',
  backgroundEnabled: true,
  backgroundColor: '#000000',
  backgroundOpacity: 0.8,
  outlineEnabled: false,
  outlineColor: '#000000',
  outlineWidth: 3,
  position: 'bottom',
}

const defaultTrackSettings = (): TrackSettings => ({ muted: false, visible: true })

const defaultVideoTracks = (): VideoTrack[] => [
  { id: 'track_main', name: 'Main video', muted: false, visible: true },
]

const COLLISION_EPSILON = 1 / 300

type ClipInterval = {
  id: string
  start: number
  end: number
}

function overlaps(start: number, duration: number, interval: ClipInterval) {
  const end = start + duration
  return (
    start < interval.end - COLLISION_EPSILON &&
    end > interval.start + COLLISION_EPSILON
  )
}

function nearestAvailableStart(
  requestedStart: number,
  duration: number,
  intervals: ClipInterval[]
) {
  const requested = Math.max(0, requestedStart)
  if (!intervals.some((interval) => overlaps(requested, duration, interval))) {
    return requested
  }
  const candidates = Array.from(
    new Set([
      0,
      ...intervals.flatMap((interval) => [
        interval.end,
        Math.max(0, interval.start - duration),
      ]),
    ])
  )
    .filter(
      (candidate) =>
        !intervals.some((interval) => overlaps(candidate, duration, interval))
    )
    .sort(
      (first, second) =>
        Math.abs(first - requested) - Math.abs(second - requested) ||
        first - second
    )
  return candidates[0] ?? Math.max(0, ...intervals.map((interval) => interval.end))
}

function resolveSceneOverlaps(scenes: SceneSegment[]) {
  const output = scenes.map((scene) => ({ ...scene }))
  const trackIds = new Set(output.map((scene) => scene.trackId))
  for (const trackId of trackIds) {
    let cursor = 0
    output
      .filter((scene) => scene.trackId === trackId)
      .sort((first, second) => first.startTimeSec - second.startTimeSec)
      .forEach((scene) => {
        const startTimeSec = Math.max(cursor, scene.startTimeSec)
        scene.startTimeSec = startTimeSec
        scene.endTimeSec = startTimeSec + scene.durationSec
        cursor = scene.endTimeSec
      })
  }
  return output
}

function resolveAudioOverlaps(clips: TimelineAudioClip[]) {
  let cursor = 0
  return clips
    .map((clip) => ({ ...clip }))
    .sort((first, second) => first.startTimeSec - second.startTimeSec)
    .map((clip) => {
      const startTimeSec = Math.max(cursor, clip.startTimeSec)
      cursor = startTimeSec + clip.durationSec
      return { ...clip, startTimeSec }
    })
}

const normalizeVideoTracks = (tracks?: VideoTrack[]): VideoTrack[] =>
  (tracks?.length ? tracks : defaultVideoTracks()).map((track) => ({
    ...track,
    muted: track.muted ?? false,
    visible: track.visible ?? true,
  }))

const normalizeSubtitleSettings = (settings?: SubtitleSettings): SubtitleSettings => ({
  ...defaultSubtitleSettings,
  ...(settings || {}),
})

const normalizeScenes = (scenes: SceneSegment[], fallbackTrackId: string): SceneSegment[] =>
  resolveSceneOverlaps(scenes.map((scene) => {
    const media = scene.media
      ? {
          ...scene.media,
          sourceStartSec: scene.media.sourceStartSec ?? 0,
          sourceDurationSec: scene.media.sourceDurationSec ?? scene.media.durationSec,
        }
      : null
    const isImage =
      media?.type === 'local_image' ||
      media?.type === 'google_image' ||
      media?.type === 'duckduckgo_image'
    const maximumDuration =
      media && !isImage && media.sourceDurationSec
        ? Math.max(1 / 30, media.sourceDurationSec - (media.sourceStartSec ?? 0))
        : Number.POSITIVE_INFINITY
    const durationSec = Math.min(scene.durationSec, maximumDuration)
    return {
      ...scene,
      media,
      durationSec,
      endTimeSec: scene.startTimeSec + durationSec,
      trackId: scene.trackId || fallbackTrackId,
      volume: scene.volume ?? 1,
      scale: scene.scale ?? 1,
      opacity: scene.opacity ?? 1,
    }
  }))

export function extendVisualScenesAcrossSpeechGaps(
  scenes: SceneSegment[],
  timelineDurationSec: number,
  mainTrackId = scenes[0]?.trackId || 'track_main'
) {
  const output = scenes.map((scene) => ({ ...scene }))
  const mainScenes = output
    .filter((scene) => (scene.trackId || 'track_main') === mainTrackId)
    .sort((first, second) => first.startTimeSec - second.startTimeSec)
  for (let index = 0; index < mainScenes.length; index += 1) {
    const scene = mainScenes[index]
    const nextScene = mainScenes[index + 1]
    const fillUntil = nextScene?.startTimeSec ?? timelineDurationSec
    if (fillUntil > scene.endTimeSec + COLLISION_EPSILON) {
      scene.endTimeSec = fillUntil
      scene.durationSec = fillUntil - scene.startTimeSec
    }
  }
  return output
}

const normalizeAudioClips = (clips?: TimelineAudioClip[]): TimelineAudioClip[] =>
  resolveAudioOverlaps((clips || []).map((clip) => {
    const sourceStartSec = clip.sourceStartSec ?? 0
    return {
      ...clip,
      sourceStartSec,
      durationSec: clip.sourceDurationSec
        ? Math.min(
            clip.durationSec,
            Math.max(1 / 30, clip.sourceDurationSec - sourceStartSec)
          )
        : clip.durationSec,
    }
  }))

interface HistorySnapshot {
  audioFile: { path: string; duration: number } | null
  scenes: SceneSegment[]
  videoTracks: VideoTrack[]
  voiceTrackSettings: TrackSettings
  audioTrackSettings: TrackSettings
  subtitles: SubtitleSegment[]
  mediaLibrary: LibraryAsset[]
  audioClips: TimelineAudioClip[]
  subtitleSettings: SubtitleSettings
}

interface EditorStore {
  screen: AppScreen
  projectId: string | null
  projectName: string
  projectCreatedAt: string | null
  projectUpdatedAt: string | null
  audioFile: { path: string; duration: number } | null
  scenes: SceneSegment[]
  videoTracks: VideoTrack[]
  voiceTrackSettings: TrackSettings
  audioTrackSettings: TrackSettings
  subtitles: SubtitleSegment[]
  mediaLibrary: LibraryAsset[]
  audioClips: TimelineAudioClip[]
  subtitleSettings: SubtitleSettings
  agentChat: AgentChatMessage[]
  antigravityConversationId: string | null
  antigravityModel: string
  activeSceneId: string | null
  activeAudioClipId: string | null
  activeSubtitleId: string | null
  currentTimeSec: number
  isPlaying: boolean
  apiKeys: {
    groq: string
    pexels: string
    youtube: string
  }
  isProcessingAudio: boolean
  processingError: string | null
  processingStage: 'transcribing' | 'matching-stock' | 'saving'
  processingProgress: {
    completed: number
    total: number
    matched: number
    message?: string
  }
  editorNotice: string | null
  exportProgress: number | null
  seekTargetSec: number
  seekVersion: number
  playbackCommand: 'play' | 'pause' | 'toggle'
  playbackVersion: number
  history: HistorySnapshot[]
  future: HistorySnapshot[]

  setScreen: (screen: AppScreen) => void
  beginProject: (name: string, audioFile: { path: string; duration: number }) => void
  loadProject: (project: ProjectDocument) => void
  closeProject: () => void
  setProjectName: (name: string) => void
  setAudioFile: (file: { path: string; duration: number } | null) => void
  setScenes: (scenes: SceneSegment[], subtitleTimingScenes?: SceneSegment[]) => void
  updateScene: (id: string, updates: Partial<SceneSegment>) => void
  splitScene: (id: string, atTimeSec: number) => void
  trimScene: (
    id: string,
    startTimeSec: number,
    endTimeSec: number,
    sourceStartSec?: number
  ) => void
  deleteScene: (id: string) => void
  addVideoTrack: () => void
  removeVideoTrack: (id: string) => void
  updateVideoTrack: (id: string, updates: Partial<VideoTrack>) => void
  updateVoiceTrackSettings: (updates: Partial<TrackSettings>) => void
  updateAudioTrackSettings: (updates: Partial<TrackSettings>) => void
  addSceneFromAsset: (asset: LibraryAsset, trackId: string, startTimeSec: number) => void
  addBlankScene: (trackId?: string, startTimeSec?: number, durationSec?: number) => void
  moveScene: (id: string, startTimeSec: number, trackId: string) => void
  setActiveSceneId: (id: string | null) => void
  setActiveAudioClipId: (id: string | null) => void
  setActiveSubtitleId: (id: string | null) => void
  updateSubtitle: (id: string, text: string) => void
  splitSubtitle: (id: string, characterIndex: number) => void
  setCurrentTimeSec: (time: number) => void
  requestSeek: (time: number) => void
  requestPlayback: (command?: 'play' | 'pause' | 'toggle') => void
  setIsPlaying: (playing: boolean) => void
  setApiKeys: (keys: {
    groq?: string
    pexels?: string
    youtube?: string
  }) => void
  setIsProcessingAudio: (processing: boolean) => void
  setProcessingError: (error: string | null) => void
  setProcessingStage: (
    stage: 'transcribing' | 'matching-stock' | 'saving'
  ) => void
  setProcessingProgress: (progress: {
    completed: number
    total: number
    matched: number
    message?: string
  }) => void
  setEditorNotice: (notice: string | null) => void
  setExportProgress: (progress: number | null) => void
  addMediaAssets: (assets: LibraryAsset[]) => void
  removeMediaAsset: (id: string) => void
  assignMediaToScene: (sceneId: string, media: MediaAsset) => void
  addAudioClip: (asset: LibraryAsset, startTimeSec?: number) => void
  removeAudioClip: (id: string) => void
  moveAudioClip: (id: string, startTimeSec: number) => void
  updateAudioClip: (id: string, updates: Partial<TimelineAudioClip>) => void
  trimAudioClip: (
    id: string,
    startTimeSec: number,
    durationSec: number,
    sourceStartSec: number
  ) => void
  updateSubtitleSettings: (updates: Partial<SubtitleSettings>) => void
  appendAgentChat: (message: AgentChatMessage) => void
  clearAgentChat: () => void
  setAntigravityConversationId: (id: string | null) => void
  setAntigravityModel: (model: string) => void
  checkpointHistory: () => void
  undo: () => void
  redo: () => void
}

const markUpdated = () => new Date().toISOString()

const subtitlesFromScenes = (scenes: SceneSegment[]): SubtitleSegment[] =>
  scenes.map((scene, index) => ({
    id: `subtitle_${index + 1}_${scene.id}`,
    startTimeSec: scene.startTimeSec,
    endTimeSec: scene.endTimeSec,
    text: scene.transcriptText,
  }))

const capture = (state: EditorStore): HistorySnapshot => ({
  audioFile: state.audioFile,
  scenes: state.scenes,
  videoTracks: state.videoTracks,
  voiceTrackSettings: state.voiceTrackSettings,
  audioTrackSettings: state.audioTrackSettings,
  subtitles: state.subtitles,
  mediaLibrary: state.mediaLibrary,
  audioClips: state.audioClips,
  subtitleSettings: state.subtitleSettings,
})

const historyChange = (state: EditorStore, changes: Partial<EditorStore>) => ({
  ...changes,
  history: [...state.history.slice(-49), capture(state)],
  future: [],
  projectUpdatedAt: markUpdated(),
})

const restoredSelection = (state: EditorStore, snapshot: HistorySnapshot) => ({
  activeSceneId: snapshot.scenes.some((scene) => scene.id === state.activeSceneId)
    ? state.activeSceneId
    : snapshot.scenes[0]?.id || null,
  activeAudioClipId: snapshot.audioClips.some((clip) => clip.id === state.activeAudioClipId)
    ? state.activeAudioClipId
    : null,
  activeSubtitleId: snapshot.subtitles.some((subtitle) => subtitle.id === state.activeSubtitleId)
    ? state.activeSubtitleId
    : snapshot.subtitles[0]?.id || null,
})

export const useEditorStore = create<EditorStore>((set) => ({
  screen: 'projects',
  projectId: null,
  projectName: '',
  projectCreatedAt: null,
  projectUpdatedAt: null,
  audioFile: null,
  scenes: [],
  videoTracks: defaultVideoTracks(),
  voiceTrackSettings: defaultTrackSettings(),
  audioTrackSettings: defaultTrackSettings(),
  subtitles: [],
  mediaLibrary: [],
  audioClips: [],
  subtitleSettings: defaultSubtitleSettings,
  agentChat: [],
  antigravityConversationId: null,
  antigravityModel:
    (typeof window !== 'undefined' &&
      localStorage.getItem('hyperframes:antigravityModel')) ||
    'Gemini 3.7 Flash (High)',
  activeSceneId: null,
  activeAudioClipId: null,
  activeSubtitleId: null,
  currentTimeSec: 0,
  isPlaying: false,
  apiKeys: {
    groq: '',
    pexels: '',
    youtube: '',
  },
  isProcessingAudio: false,
  processingError: null,
  processingStage: 'transcribing',
  processingProgress: { completed: 0, total: 0, matched: 0 },
  editorNotice: null,
  exportProgress: null,
  seekTargetSec: 0,
  seekVersion: 0,
  playbackCommand: 'pause',
  playbackVersion: 0,
  history: [],
  future: [],

  setScreen: (screen) => set({ screen }),
  beginProject: (name, audioFile) => {
    const now = markUpdated()
    set({
      screen: 'transcribing',
      projectId: crypto.randomUUID(),
      projectName: name.trim() || 'Untitled project',
      projectCreatedAt: now,
      projectUpdatedAt: now,
      audioFile,
      scenes: [],
      videoTracks: defaultVideoTracks(),
      voiceTrackSettings: defaultTrackSettings(),
      audioTrackSettings: defaultTrackSettings(),
      subtitles: [],
      mediaLibrary: [],
      audioClips: [],
      subtitleSettings: defaultSubtitleSettings,
      agentChat: [],
      antigravityConversationId: null,
      antigravityModel:
        (typeof window !== 'undefined' &&
          localStorage.getItem('hyperframes:antigravityModel')) ||
        'Gemini 3.7 Flash (High)',
      activeSceneId: null,
      activeAudioClipId: null,
      activeSubtitleId: null,
      currentTimeSec: 0,
      isProcessingAudio: true,
      processingError: null,
      processingStage: 'transcribing',
      processingProgress: { completed: 0, total: 0, matched: 0 },
      editorNotice: null,
      history: [],
      future: [],
    })
  },
  loadProject: (project) => {
    const videoTracks = normalizeVideoTracks(project.videoTracks)
    const normalizedScenes = normalizeScenes(project.scenes, videoTracks[0].id)
    const scenes = project.visualGapsFilled
      ? normalizedScenes
      : extendVisualScenesAcrossSpeechGaps(
          normalizedScenes,
          project.audioFile?.duration ||
            normalizedScenes.reduce(
              (maximum, scene) => Math.max(maximum, scene.endTimeSec),
              0
            ),
          videoTracks[0].id
        )
    const subtitles = project.subtitles?.length ? project.subtitles : subtitlesFromScenes(scenes)
    set({
      screen: 'editor',
      projectId: project.id,
      projectName: project.name,
      projectCreatedAt: project.createdAt,
      projectUpdatedAt: project.updatedAt,
      audioFile: project.audioFile,
      scenes,
      videoTracks,
      voiceTrackSettings: {
        ...defaultTrackSettings(),
        ...(project.voiceTrackSettings || {}),
      },
      audioTrackSettings: {
        ...defaultTrackSettings(),
        ...(project.audioTrackSettings || {}),
      },
      subtitles,
      mediaLibrary: project.mediaLibrary || [],
      audioClips: normalizeAudioClips(project.audioClips),
      subtitleSettings: normalizeSubtitleSettings(project.subtitleSettings),
      agentChat: project.agentChat || [],
      antigravityConversationId: project.antigravityConversationId || null,
      antigravityModel:
        project.antigravityModel ||
        (typeof window !== 'undefined' &&
          localStorage.getItem('hyperframes:antigravityModel')) ||
        'Gemini 3.7 Flash (High)',
      activeSceneId: scenes[0]?.id || null,
      activeAudioClipId: null,
      activeSubtitleId: subtitles[0]?.id || null,
      currentTimeSec: 0,
      isPlaying: false,
      processingError: null,
      editorNotice: project.timingRepair
        ? `Subtitle timing was repaired from ${project.timingRepair.previousTimelineDuration.toFixed(1)}s to match the ${project.timingRepair.actualAudioDuration.toFixed(1)}s voiceover.`
        : null,
      history: [],
      future: [],
    })
  },
  closeProject: () =>
    set({
      screen: 'projects',
      projectId: null,
      projectName: '',
      projectCreatedAt: null,
      projectUpdatedAt: null,
      audioFile: null,
      scenes: [],
      videoTracks: defaultVideoTracks(),
      voiceTrackSettings: defaultTrackSettings(),
      audioTrackSettings: defaultTrackSettings(),
      subtitles: [],
      mediaLibrary: [],
      audioClips: [],
      agentChat: [],
      antigravityConversationId: null,
      antigravityModel:
        (typeof window !== 'undefined' &&
          localStorage.getItem('hyperframes:antigravityModel')) ||
        'Gemini 3.7 Flash (High)',
      activeSceneId: null,
      activeAudioClipId: null,
      activeSubtitleId: null,
      currentTimeSec: 0,
      isPlaying: false,
      processingError: null,
      processingStage: 'transcribing',
      processingProgress: { completed: 0, total: 0, matched: 0 },
      editorNotice: null,
      history: [],
      future: [],
    }),
  setProjectName: (projectName) => set({ projectName, projectUpdatedAt: markUpdated() }),
  setAudioFile: (audioFile) =>
    set((state) => historyChange(state, { audioFile })),
  setScenes: (scenes, subtitleTimingScenes) =>
    set((state) => {
      const videoTracks = state.videoTracks.length ? state.videoTracks : defaultVideoTracks()
      const normalizedScenes = normalizeScenes(scenes, videoTracks[0].id)
      const normalizedSubtitleTimingScenes = subtitleTimingScenes
        ? normalizeScenes(subtitleTimingScenes, videoTracks[0].id)
        : normalizedScenes
      const duration = normalizedScenes.reduce(
        (max, scene) => Math.max(max, scene.endTimeSec),
        0
      )
      const subtitles = subtitlesFromScenes(normalizedSubtitleTimingScenes)
      return historyChange(state, {
        scenes: normalizedScenes,
        videoTracks,
        subtitles,
        audioFile: state.audioFile
          ? {
              ...state.audioFile,
              duration: state.audioFile.duration > 0 ? state.audioFile.duration : duration,
            }
          : null,
        activeSceneId: normalizedScenes[0]?.id || null,
        activeSubtitleId: subtitles[0]?.id || null,
      })
    }),
  updateScene: (id, updates) =>
    set((state) => {
      const current = state.scenes.find((scene) => scene.id === id)
      if (!current) return state
      let updated = { ...current, ...updates }
      const timingChanged =
        updates.startTimeSec !== undefined ||
        updates.durationSec !== undefined ||
        updates.endTimeSec !== undefined ||
        updates.trackId !== undefined
      if (timingChanged) {
        const durationSec = Math.max(
          1 / 30,
          updates.durationSec ??
            (updates.endTimeSec !== undefined
              ? updates.endTimeSec - (updates.startTimeSec ?? current.startTimeSec)
              : current.durationSec)
        )
        const trackId = updates.trackId ?? current.trackId
        const intervals = state.scenes
          .filter((scene) => scene.id !== id && scene.trackId === trackId)
          .map((scene) => ({
            id: scene.id,
            start: scene.startTimeSec,
            end: scene.endTimeSec,
          }))
        let startTimeSec = updates.startTimeSec ?? current.startTimeSec
        if (
          updates.startTimeSec !== undefined ||
          updates.trackId !== undefined
        ) {
          startTimeSec = nearestAvailableStart(
            startTimeSec,
            durationSec,
            intervals
          )
        } else if (updates.durationSec !== undefined) {
          const nextStart = Math.min(
            Number.POSITIVE_INFINITY,
            ...intervals
              .filter(
                (interval) =>
                  interval.start >= current.endTimeSec - COLLISION_EPSILON
              )
              .map((interval) => interval.start)
          )
          updated.durationSec = Math.min(
            durationSec,
            nextStart - current.startTimeSec
          )
        }
        updated = {
          ...updated,
          trackId,
          startTimeSec,
          durationSec: updated.durationSec ?? durationSec,
          endTimeSec: startTimeSec + (updated.durationSec ?? durationSec),
        }
      }
      return historyChange(state, {
        scenes: state.scenes.map((scene) => (scene.id === id ? updated : scene)),
      })
    }),
  splitScene: (id, atTimeSec) =>
    set((state) => {
      const index = state.scenes.findIndex((scene) => scene.id === id)
      const scene = state.scenes[index]
      if (!scene || atTimeSec <= scene.startTimeSec + 0.2 || atTimeSec >= scene.endTimeSec - 0.2) {
        return state
      }
      const ratio = (atTimeSec - scene.startTimeSec) / scene.durationSec
      const words = scene.transcriptText.trim().split(/\s+/).filter(Boolean)
      const wordSplit =
        words.length > 1
          ? Math.max(1, Math.min(words.length - 1, Math.round(words.length * ratio)))
          : words.length
      const first: SceneSegment = {
        ...scene,
        id: crypto.randomUUID(),
        endTimeSec: atTimeSec,
        durationSec: atTimeSec - scene.startTimeSec,
        transcriptText: words.slice(0, wordSplit).join(' ') || scene.transcriptText,
      }
      const second: SceneSegment = {
        ...scene,
        id: crypto.randomUUID(),
        startTimeSec: atTimeSec,
        durationSec: scene.endTimeSec - atTimeSec,
        transcriptText: words.slice(wordSplit).join(' ') || scene.transcriptText,
        media:
          scene.media &&
          scene.media.type !== 'local_image' &&
          scene.media.type !== 'google_image' &&
          scene.media.type !== 'duckduckgo_image'
            ? {
                ...scene.media,
                sourceStartSec:
                  (scene.media.sourceStartSec ?? 0) +
                  (atTimeSec - scene.startTimeSec),
              }
            : scene.media,
      }
      const scenes = [...state.scenes]
      scenes.splice(index, 1, first, second)
      return historyChange(state, { scenes, activeSceneId: second.id })
    }),
  trimScene: (id, startTimeSec, endTimeSec, sourceStartSec) =>
    set((state) => ({
      scenes: state.scenes.map((scene) => {
        if (scene.id !== id) return scene
        const neighbors = state.scenes.filter(
          (candidate) =>
            candidate.id !== id && candidate.trackId === scene.trackId
        )
        const previousEnd = Math.max(
          0,
          ...neighbors
            .filter(
              (candidate) =>
                candidate.endTimeSec <=
                scene.startTimeSec + COLLISION_EPSILON
            )
            .map((candidate) => candidate.endTimeSec)
        )
        const nextStart = Math.min(
          Number.POSITIVE_INFINITY,
          ...neighbors
            .filter(
              (candidate) =>
                candidate.startTimeSec >=
                scene.endTimeSec - COLLISION_EPSILON
            )
            .map((candidate) => candidate.startTimeSec)
        )
        const boundedStart = Math.max(
          previousEnd,
          Math.min(endTimeSec - 1 / 30, startTimeSec)
        )
        const boundedEnd = Math.min(
          nextStart,
          Math.max(boundedStart + 1 / 30, endTimeSec)
        )
        return {
          ...scene,
          startTimeSec: boundedStart,
          endTimeSec: boundedEnd,
          durationSec: boundedEnd - boundedStart,
          media:
            scene.media && sourceStartSec !== undefined
              ? {
                  ...scene.media,
                  sourceStartSec: Math.max(
                    0,
                    (scene.media.sourceStartSec ?? 0) +
                      boundedStart -
                      scene.startTimeSec
                  ),
                }
              : scene.media,
        }
      }),
      projectUpdatedAt: markUpdated(),
    })),
  deleteScene: (id) =>
    set((state) =>
      historyChange(state, {
        scenes: state.scenes.filter((scene) => scene.id !== id),
        activeSceneId: state.activeSceneId === id ? null : state.activeSceneId,
      })
    ),
  addVideoTrack: () =>
    set((state) =>
      historyChange(state, {
        videoTracks: [
          ...state.videoTracks,
          {
            id: crypto.randomUUID(),
            name: `Overlay ${Math.max(1, state.videoTracks.length)}`,
            muted: false,
            visible: true,
          },
        ],
      })
    ),
  removeVideoTrack: (id) =>
    set((state) => {
      const mainTrack = state.videoTracks[0]
      if (!mainTrack || id === mainTrack.id) return state
      return historyChange(state, {
        videoTracks: state.videoTracks.filter((track) => track.id !== id),
        scenes: resolveSceneOverlaps(
          state.scenes.map((scene) =>
            scene.trackId === id ? { ...scene, trackId: mainTrack.id } : scene
          )
        ),
      })
    }),
  updateVideoTrack: (id, updates) =>
    set((state) =>
      historyChange(state, {
        videoTracks: state.videoTracks.map((track) =>
          track.id === id ? { ...track, ...updates } : track
        ),
      })
    ),
  updateVoiceTrackSettings: (updates) =>
    set((state) =>
      historyChange(state, {
        voiceTrackSettings: { ...state.voiceTrackSettings, ...updates },
      })
    ),
  updateAudioTrackSettings: (updates) =>
    set((state) =>
      historyChange(state, {
        audioTrackSettings: { ...state.audioTrackSettings, ...updates },
      })
    ),
  addSceneFromAsset: (asset, trackId, startTimeSec) =>
    set((state) => {
      if (asset.kind !== 'video' && asset.kind !== 'image') return state
      const id = crypto.randomUUID()
      const durationSec =
        asset.kind === 'video'
          ? Math.max(0.2, Math.min(5, asset.durationSec || 5))
          : 5
      const start = nearestAvailableStart(
        startTimeSec,
        durationSec,
        state.scenes
          .filter((scene) => scene.trackId === trackId)
          .map((scene) => ({
            id: scene.id,
            start: scene.startTimeSec,
            end: scene.endTimeSec,
          }))
      )
      const scene: SceneSegment = {
        id,
        startTimeSec: start,
        endTimeSec: start + durationSec,
        durationSec,
        transcriptText: asset.name,
        keywords: [],
        media: {
          id: asset.id,
          type:
            asset.origin === 'youtube'
              ? 'youtube_clip'
              : asset.kind === 'video'
                ? 'local_video'
                : 'local_image',
          kind: asset.kind,
          sourceUrl: asset.path,
          thumbnailUrl: asset.thumbnailUrl || asset.path,
          title: asset.name,
          sourceStartSec: 0,
          sourceDurationSec: asset.durationSec,
          providerUrl: asset.providerUrl,
          providerStartSec: asset.providerStartSec,
          imageFit: 'cover',
          enableKenBurnsEffect: asset.kind === 'image',
          missing: asset.missing,
          missingReason: asset.missingReason,
        },
        trackId,
        volume: 1,
        scale: 1,
        opacity: 1,
        sceneType: 'media',
      }
      return historyChange(state, {
        scenes: [...state.scenes, scene],
        activeSceneId: id,
        activeAudioClipId: null,
      })
    }),
  moveScene: (id, startTimeSec, trackId) =>
    set((state) => ({
      scenes: state.scenes.map((scene) =>
        scene.id === id
          ? (() => {
              const availableStart = nearestAvailableStart(
                startTimeSec,
                scene.durationSec,
                state.scenes
                  .filter(
                    (candidate) =>
                      candidate.id !== id && candidate.trackId === trackId
                  )
                  .map((candidate) => ({
                    id: candidate.id,
                    start: candidate.startTimeSec,
                    end: candidate.endTimeSec,
                  }))
              )
              return {
                ...scene,
                trackId,
                startTimeSec: availableStart,
                endTimeSec: availableStart + scene.durationSec,
              }
            })()
          : scene
      ),
      projectUpdatedAt: markUpdated(),
    })),
  addBlankScene: (requestedTrackId, requestedStartTimeSec, requestedDurationSec = 5) =>
    set((state) => {
      const trackId =
        state.videoTracks.find((track) => track.id === requestedTrackId)?.id ||
        state.videoTracks[0]?.id
      if (!trackId) return state
      const durationSec = Math.max(1 / 30, requestedDurationSec)
      const startTimeSec = nearestAvailableStart(
        requestedStartTimeSec ?? state.currentTimeSec,
        durationSec,
        state.scenes
          .filter((scene) => scene.trackId === trackId)
          .map((scene) => ({
            id: scene.id,
            start: scene.startTimeSec,
            end: scene.endTimeSec,
          }))
      )
      const id = crypto.randomUUID()
      const scene: SceneSegment = {
        id,
        startTimeSec,
        endTimeSec: startTimeSec + durationSec,
        durationSec,
        transcriptText: 'Blank motion scene',
        keywords: [],
        media: null,
        trackId,
        volume: 1,
        scale: 1,
        opacity: 1,
        sceneType: 'blank',
      }
      return historyChange(state, {
        scenes: [...state.scenes, scene],
        activeSceneId: id,
        activeAudioClipId: null,
        currentTimeSec: startTimeSec,
        seekTargetSec: startTimeSec,
        seekVersion: state.seekVersion + 1,
      })
    }),
  setActiveSceneId: (activeSceneId) =>
    set((state) => {
      const scene = state.scenes.find((item) => item.id === activeSceneId)
      const activeSubtitle =
        scene &&
        state.subtitles.find(
          (subtitle) =>
            subtitle.startTimeSec < scene.endTimeSec &&
            subtitle.endTimeSec > scene.startTimeSec
        )
      return {
        activeSceneId,
        activeAudioClipId: null,
        activeSubtitleId: activeSubtitle?.id || state.activeSubtitleId,
      }
    }),
  setActiveAudioClipId: (activeAudioClipId) =>
    set({
      activeAudioClipId,
      activeSceneId: null,
      activeSubtitleId: null,
    }),
  setActiveSubtitleId: (activeSubtitleId) => set({ activeSubtitleId }),
  updateSubtitle: (id, text) =>
    set((state) =>
      historyChange(state, {
        subtitles: state.subtitles.map((subtitle) =>
          subtitle.id === id ? { ...subtitle, text } : subtitle
        ),
      })
    ),
  splitSubtitle: (id, characterIndex) =>
    set((state) => {
      const index = state.subtitles.findIndex((subtitle) => subtitle.id === id)
      const subtitle = state.subtitles[index]
      if (!subtitle) return state
      const firstText = subtitle.text.slice(0, characterIndex).trim()
      const secondText = subtitle.text.slice(characterIndex).trim()
      if (!firstText || !secondText) return state
      const ratio = firstText.length / (firstText.length + secondText.length)
      const splitTime = Math.max(
        subtitle.startTimeSec + 0.1,
        Math.min(
          subtitle.endTimeSec - 0.1,
          subtitle.startTimeSec + (subtitle.endTimeSec - subtitle.startTimeSec) * ratio
        )
      )
      const first: SubtitleSegment = { ...subtitle, endTimeSec: splitTime, text: firstText }
      const second: SubtitleSegment = {
        id: crypto.randomUUID(),
        startTimeSec: splitTime,
        endTimeSec: subtitle.endTimeSec,
        text: secondText,
      }
      const subtitles = [...state.subtitles]
      subtitles.splice(index, 1, first, second)
      return historyChange(state, { subtitles, activeSubtitleId: second.id })
    }),
  setCurrentTimeSec: (currentTimeSec) =>
    set((state) =>
      Math.abs(state.currentTimeSec - currentTimeSec) < 0.0001
        ? state
        : { currentTimeSec }
    ),
  requestSeek: (seekTargetSec) =>
    set((state) => ({
      seekTargetSec,
      seekVersion: state.seekVersion + 1,
      currentTimeSec: seekTargetSec,
    })),
  requestPlayback: (playbackCommand = 'toggle') =>
    set((state) => ({
      playbackCommand,
      playbackVersion: state.playbackVersion + 1,
    })),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setApiKeys: (keys) => set((state) => ({ apiKeys: { ...state.apiKeys, ...keys } })),
  setIsProcessingAudio: (isProcessingAudio) => set({ isProcessingAudio }),
  setProcessingError: (processingError) => set({ processingError }),
  setProcessingStage: (processingStage) => set({ processingStage }),
  setProcessingProgress: (processingProgress) => set({ processingProgress }),
  setEditorNotice: (editorNotice) => set({ editorNotice }),
  setExportProgress: (exportProgress) => set({ exportProgress }),
  addMediaAssets: (assets) =>
    set((state) => {
      const existing = new Set(state.mediaLibrary.map((asset) => asset.path))
      return historyChange(state, {
        mediaLibrary: [...state.mediaLibrary, ...assets.filter((asset) => !existing.has(asset.path))],
      })
    }),
  removeMediaAsset: (id) =>
    set((state) =>
      historyChange(state, {
        mediaLibrary: state.mediaLibrary.filter((asset) => asset.id !== id),
      })
    ),
  assignMediaToScene: (sceneId, media) =>
    set((state) =>
      historyChange(state, {
        scenes: state.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene
          const normalizedMedia = {
            ...media,
            sourceStartSec: media.sourceStartSec ?? 0,
            sourceDurationSec: media.sourceDurationSec ?? media.durationSec,
          }
          const isImage =
            normalizedMedia.type === 'local_image' ||
            normalizedMedia.type === 'google_image' ||
            normalizedMedia.type === 'duckduckgo_image'
          const maximumDuration =
            !isImage && normalizedMedia.sourceDurationSec
              ? Math.max(
                  1 / 30,
                  normalizedMedia.sourceDurationSec -
                    (normalizedMedia.sourceStartSec ?? 0)
                )
              : Number.POSITIVE_INFINITY
          const durationSec = Math.min(scene.durationSec, maximumDuration)
          return {
            ...scene,
            media: normalizedMedia,
            durationSec,
            endTimeSec: scene.startTimeSec + durationSec,
          }
        }),
      })
    ),
  addAudioClip: (asset, startTimeSec) =>
    set((state) => {
      const id = crypto.randomUUID()
      const durationSec = asset.durationSec || 10
      const requestedStart = Math.max(
        0,
        startTimeSec ?? state.currentTimeSec
      )
      const availableStart = nearestAvailableStart(
        requestedStart,
        durationSec,
        state.audioClips.map((clip) => ({
          id: clip.id,
          start: clip.startTimeSec,
          end: clip.startTimeSec + clip.durationSec,
        }))
      )
      return historyChange(state, {
        audioClips: [
          ...state.audioClips,
          {
            id,
            name: asset.name,
            path: asset.path,
            kind: asset.kind === 'sfx' ? 'sfx' : 'music',
            startTimeSec: availableStart,
            durationSec,
            sourceStartSec: 0,
            sourceDurationSec: asset.durationSec,
            volume: asset.kind === 'sfx' ? 1 : 0.35,
          },
        ],
        activeAudioClipId: id,
        activeSceneId: null,
      })
    }),
  removeAudioClip: (id) =>
    set((state) =>
      historyChange(state, {
        audioClips: state.audioClips.filter((clip) => clip.id !== id),
        activeAudioClipId: state.activeAudioClipId === id ? null : state.activeAudioClipId,
      })
    ),
  moveAudioClip: (id, startTimeSec) =>
    set((state) => ({
      audioClips: state.audioClips.map((clip) =>
        clip.id === id
          ? {
              ...clip,
              startTimeSec: nearestAvailableStart(
                startTimeSec,
                clip.durationSec,
                state.audioClips
                  .filter((candidate) => candidate.id !== id)
                  .map((candidate) => ({
                    id: candidate.id,
                    start: candidate.startTimeSec,
                    end: candidate.startTimeSec + candidate.durationSec,
                  }))
              ),
            }
          : clip
      ),
      projectUpdatedAt: markUpdated(),
    })),
  updateAudioClip: (id, updates) =>
    set((state) =>
      historyChange(state, {
        audioClips: state.audioClips.map((clip) =>
          clip.id === id
            ? (() => {
                const merged = { ...clip, ...updates }
                const sourceStartSec = Math.max(0, merged.sourceStartSec ?? 0)
                const maximumDuration = merged.sourceDurationSec
                  ? Math.max(0.05, merged.sourceDurationSec - sourceStartSec)
                  : Number.POSITIVE_INFINITY
                let durationSec = Math.max(
                  0.05,
                  Math.min(merged.durationSec, maximumDuration)
                )
                const intervals = state.audioClips
                  .filter((candidate) => candidate.id !== id)
                  .map((candidate) => ({
                    id: candidate.id,
                    start: candidate.startTimeSec,
                    end: candidate.startTimeSec + candidate.durationSec,
                  }))
                let startTimeSec = merged.startTimeSec
                if (updates.startTimeSec !== undefined) {
                  startTimeSec = nearestAvailableStart(
                    startTimeSec,
                    durationSec,
                    intervals
                  )
                } else if (updates.durationSec !== undefined) {
                  const nextStart = Math.min(
                    Number.POSITIVE_INFINITY,
                    ...intervals
                      .filter(
                        (interval) =>
                          interval.start >=
                          clip.startTimeSec +
                            clip.durationSec -
                            COLLISION_EPSILON
                      )
                      .map((interval) => interval.start)
                  )
                  durationSec = Math.min(
                    durationSec,
                    nextStart - clip.startTimeSec
                  )
                }
                return {
                  ...merged,
                  sourceStartSec,
                  startTimeSec,
                  durationSec,
                }
              })()
            : clip
        ),
      })
    ),
  trimAudioClip: (id, startTimeSec, durationSec, _sourceStartSec) =>
    set((state) => ({
      audioClips: state.audioClips.map((clip) => {
        if (clip.id !== id) return clip
        const neighbors = state.audioClips.filter(
          (candidate) => candidate.id !== id
        )
        const originalEnd = clip.startTimeSec + clip.durationSec
        const requestedEnd = startTimeSec + durationSec
        const previousEnd = Math.max(
          0,
          ...neighbors
            .filter(
              (candidate) =>
                candidate.startTimeSec + candidate.durationSec <=
                clip.startTimeSec + COLLISION_EPSILON
            )
            .map(
              (candidate) => candidate.startTimeSec + candidate.durationSec
            )
        )
        const nextStart = Math.min(
          Number.POSITIVE_INFINITY,
          ...neighbors
            .filter(
              (candidate) =>
                candidate.startTimeSec >= originalEnd - COLLISION_EPSILON
            )
            .map((candidate) => candidate.startTimeSec)
        )
        const boundedStart = Math.max(
          previousEnd,
          Math.min(requestedEnd - 1 / 30, startTimeSec)
        )
        const boundedEnd = Math.min(
          nextStart,
          Math.max(boundedStart + 1 / 30, requestedEnd)
        )
        return {
          ...clip,
          startTimeSec: boundedStart,
          durationSec: boundedEnd - boundedStart,
          sourceStartSec: Math.max(
            0,
            (clip.sourceStartSec ?? 0) + boundedStart - clip.startTimeSec
          ),
        }
      }),
      projectUpdatedAt: markUpdated(),
    })),
  updateSubtitleSettings: (updates) =>
    set((state) =>
      historyChange(state, {
        subtitleSettings: { ...state.subtitleSettings, ...updates },
      })
    ),
  appendAgentChat: (message) =>
    set((state) => ({
      agentChat: [...state.agentChat.slice(-99), message],
      projectUpdatedAt: markUpdated(),
    })),
  clearAgentChat: () =>
    set({
      agentChat: [],
      antigravityConversationId: null,
      projectUpdatedAt: markUpdated(),
    }),
  setAntigravityConversationId: (antigravityConversationId) =>
    set({ antigravityConversationId, projectUpdatedAt: markUpdated() }),
  setAntigravityModel: (antigravityModel) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('hyperframes:antigravityModel', antigravityModel)
      }
    } catch {
      // ignore
    }
    set({ antigravityModel, projectUpdatedAt: markUpdated() })
  },
  checkpointHistory: () =>
    set((state) => ({
      history: [...state.history.slice(-49), capture(state)],
      future: [],
    })),
  undo: () =>
    set((state) => {
      const previous = state.history[state.history.length - 1]
      if (!previous) return state
      return {
        ...previous,
        ...restoredSelection(state, previous),
        history: state.history.slice(0, -1),
        future: [capture(state), ...state.future.slice(0, 49)],
        projectUpdatedAt: markUpdated(),
      }
    }),
  redo: () =>
    set((state) => {
      const next = state.future[0]
      if (!next) return state
      return {
        ...next,
        ...restoredSelection(state, next),
        history: [...state.history.slice(-49), capture(state)],
        future: state.future.slice(1),
        projectUpdatedAt: markUpdated(),
      }
    }),
}))

export function getProjectDocument(): ProjectDocument | null {
  const state = useEditorStore.getState()
  if (!state.projectId || !state.projectCreatedAt) return null

  return {
    id: state.projectId,
    name: state.projectName,
    createdAt: state.projectCreatedAt,
    updatedAt: state.projectUpdatedAt || markUpdated(),
    audioFile: state.audioFile,
    scenes: state.scenes,
    videoTracks: state.videoTracks,
    voiceTrackSettings: state.voiceTrackSettings,
    audioTrackSettings: state.audioTrackSettings,
    subtitles: state.subtitles,
    mediaLibrary: state.mediaLibrary,
    audioClips: state.audioClips,
    subtitleSettings: state.subtitleSettings,
    agentChat: state.agentChat,
    antigravityConversationId: state.antigravityConversationId || undefined,
    antigravityModel: state.antigravityModel || undefined,
    visualGapsFilled: true,
  }
}
