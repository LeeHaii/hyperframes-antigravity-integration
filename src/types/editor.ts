export type AppScreen = 'projects' | 'new-project' | 'transcribing' | 'editor'

export type WorkspaceMode = 'chat' | 'studio'

export interface ChatReferenceImage {
  id: string
  name: string
  path: string
  relativePath: string
}

export interface AgentChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  createdAt: string
  sceneId?: string
  referenceImages?: ChatReferenceImage[]
}

export interface HyperframesSceneState {
  html: string
  updatedAt: string
  lastPrompt?: string
  renderedPath?: string
  clipDurationSec?: number
  compositionCount?: number
  lastCompositionPath?: string
}

export type MediaKind = 'video' | 'image' | 'music' | 'sfx'

export interface MediaAsset {
  id: string
  type:
    | 'pexels_video'
    | 'youtube_clip'
    | 'google_image'
    | 'duckduckgo_image'
    | 'local_video'
    | 'local_image'
  kind?: MediaKind
  sourceUrl: string
  thumbnailUrl: string
  title: string
  durationSec?: number
  sourceStartSec?: number
  sourceDurationSec?: number
  providerUrl?: string
  creatorName?: string
  creatorUrl?: string
  providerStartSec?: number
  imageFit?: 'cover' | 'contain'
  enableKenBurnsEffect?: boolean
  missing?: boolean
  missingReason?: string
}

export interface LibraryAsset {
  id: string
  name: string
  path: string
  kind: MediaKind
  durationSec?: number
  origin?: 'imported' | 'youtube'
  thumbnailUrl?: string
  providerUrl?: string
  providerStartSec?: number
  missing?: boolean
  missingReason?: string
}

export interface TimelineAudioClip {
  id: string
  name: string
  path: string
  kind: 'music' | 'sfx'
  startTimeSec: number
  durationSec: number
  sourceStartSec?: number
  sourceDurationSec?: number
  volume: number
}

export interface VideoTrack {
  id: string
  name: string
  muted: boolean
  visible: boolean
}

export interface TrackSettings {
  muted: boolean
  visible: boolean
}

export interface SubtitleSettings {
  enabled: boolean
  fontSize: number
  fontFamily: string
  fontWeight: number
  textColor: string
  backgroundEnabled: boolean
  backgroundColor: string
  backgroundOpacity: number
  outlineEnabled: boolean
  outlineColor: string
  outlineWidth: number
  position: 'bottom' | 'center'
}

export interface SubtitleSegment {
  id: string
  startTimeSec: number
  endTimeSec: number
  text: string
}

export interface SceneSegment {
  id: string
  startTimeSec: number
  endTimeSec: number
  durationSec: number
  transcriptText: string
  keywords: string[]
  media: MediaAsset | null
  trackId: string
  volume: number
  scale: number
  opacity: number
  sceneType?: 'media' | 'blank' | 'hyperframes'
  hyperframes?: HyperframesSceneState
}

export interface ProjectDocument {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  audioFile: { path: string; duration: number } | null
  scenes: SceneSegment[]
  videoTracks: VideoTrack[]
  voiceTrackSettings: TrackSettings
  audioTrackSettings: TrackSettings
  subtitles: SubtitleSegment[]
  mediaLibrary: LibraryAsset[]
  audioClips: TimelineAudioClip[]
  subtitleSettings: SubtitleSettings
  visualGapsFilled?: boolean
  agentChat?: AgentChatMessage[]
  antigravityConversationId?: string
  antigravityModel?: string
  timingRepair?: {
    previousTimelineDuration: number
    actualAudioDuration: number
  }
}

export interface ProjectSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  duration: number
  sceneCount: number
}

export interface AppSettings {
  projectsDirectory: string
  defaultProjectsDirectory: string
  renderDirectory: string
  defaultRenderDirectory: string
  workingDirectory: string
  studioProjectsDirectory: string
  defaultStudioProjectsDirectory: string
  autoStockEnabled: boolean
  cacheSizeBytes: number
  workingFilesSizeBytes: number
}

export interface PexelsAutoMatchProgress {
  completed: number
  total: number
  matched: number
  sceneId?: string
  query?: string
}

export interface TranscriptionProgress {
  stage: 'preparing' | 'transcribing' | 'keywords'
  completed: number
  total: number
  message: string
}

export interface PexelsAutoMatchResult {
  scenes: SceneSegment[]
  matchedCount: number
  unmatchedCount: number
  warnings: string[]
}

export interface ImportedFile {
  path: string
  name: string
  kind: MediaKind
  durationSec?: number
}

export interface AntigravityStatus {
  installed: boolean
  executablePath?: string
  version?: string
  accountEmail?: string
  accountPlan?: string
  minimumVersionMet: boolean
  authOwner: 'system-keyring'
  message: string
  models?: string[]
}

export interface AntigravityRunRequest {
  requestId: string
  prompt: string
  projectId: string
  conversationId?: string
  model?: string
}

export interface StudioAntigravityRunRequest extends AntigravityRunRequest {
  sceneId: string
}

export interface AntigravityRunResult {
  text: string
  conversationId?: string
  usage?: Record<string, number>
  accountEmail?: string
  accountPlan?: string
}

export interface HyperframesRenderRequest {
  projectId: string
  sceneId: string
  html: string
}

export interface HyperframesStudioRequest {
  projectId: string
  sceneId: string
  html: string
}

export interface HyperframesStudioAppendRequest {
  projectId: string
  sceneId: string
  html: string
  label: string
  preserveCurrent: boolean
}

export interface HyperframesStudioAppendResult {
  masterHtml: string
  compositionPath: string
  compositionCount: number
  totalDurationSec: number
  clipDurationSec: number
}

export interface ImageSearchResult {
  id: string
  sourceUrl: string
  thumbnailUrl: string
  title: string
  source: 'duckduckgo' | 'pexels' | 'wikimedia'
}

export interface YouTubeSearchResult {
  id: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  url: string
}

export type ExportEncoder = 'cpu' | 'nvenc'

export interface EncoderCapabilities {
  cpu: true
  nvenc: boolean
  nvencReason?: string
  nvencEncoder?: 'h264_nvenc'
  amdGpuDetected: boolean
  gpuNames: string[]
}

export interface ExportVideoRequest {
  scenes: SceneSegment[]
  audioPath: string
  audioStartSec?: number
  audioClips: TimelineAudioClip[]
  subtitleSettings: SubtitleSettings
  subtitles: SubtitleSegment[]
  videoTracks: VideoTrack[]
  voiceTrackSettings: TrackSettings
  audioTrackSettings: TrackSettings
  outputPath: string
  width: number
  height: number
  videoBitrate: string
  encoder: ExportEncoder
}

export interface BatchExportRequest {
  projectIds: string[]
  outputDirectory: string
  width: number
  height: number
  videoBitrate: string
  encoder: ExportEncoder
}

export interface BatchExportProgress {
  projectId: string
  projectName: string
  projectIndex: number
  totalProjects: number
  projectProgress: number
  status: 'preparing' | 'rendering' | 'completed' | 'failed' | 'cancelled'
  message?: string
}

export interface BatchExportResult {
  completed: Array<{ projectId: string; outputPath: string }>
  failed: Array<{ projectId: string; error: string }>
  cancelled: boolean
}

export interface ElectronAPI {
  getAntigravityStatus: () => Promise<AntigravityStatus>
  launchAntigravityLogin: () => Promise<void>
  openAntigravityInstallDocs: () => Promise<void>
  runAntigravity: (request: AntigravityRunRequest) => Promise<AntigravityRunResult>
  runStudioAntigravity: (
    request: StudioAntigravityRunRequest
  ) => Promise<AntigravityRunResult>
  cancelAntigravity: (requestId: string) => Promise<boolean>
  onAntigravityStream: (
    callback: (event: { requestId: string; stream: 'stdout' | 'stderr'; chunk: string }) => void
  ) => () => void
  renderHyperframesScene: (request: HyperframesRenderRequest) => Promise<string>
  onHyperframesRenderProgress: (
    callback: (event: { sceneId: string; chunk: string }) => void
  ) => () => void
  openHyperframesStudio: (
    request: HyperframesStudioRequest
  ) => Promise<{ url: string }>
  readHyperframesStudioHtml: (
    request: Pick<HyperframesStudioRequest, 'projectId' | 'sceneId'>
  ) => Promise<string>
  writeHyperframesStudioHtml: (
    request: HyperframesStudioRequest
  ) => Promise<boolean>
  appendHyperframesStudioComposition: (
    request: HyperframesStudioAppendRequest
  ) => Promise<HyperframesStudioAppendResult>
  closeHyperframesStudio: () => Promise<boolean>
  openChatReferenceImages: (projectId: string) => Promise<ChatReferenceImage[]>
  saveChatReferenceImage: (
    projectId: string,
    image: { name: string; mimeType: string; data: ArrayBuffer }
  ) => Promise<ChatReferenceImage>
  openAudioFile: () => Promise<{ path: string; duration: number } | null>
  openMediaFiles: () => Promise<ImportedFile[]>
  getMediaDuration: (filePath: string) => Promise<number | null>
  transcribeAudio: (filePath: string, apiKey: string) => Promise<SceneSegment[]>
  onTranscriptionProgress: (
    callback: (progress: TranscriptionProgress) => void
  ) => void
  autoMatchPexelsVideos: (
    scenes: SceneSegment[],
    apiKey: string
  ) => Promise<PexelsAutoMatchResult>
  onPexelsAutoMatchProgress: (
    callback: (progress: PexelsAutoMatchProgress) => void
  ) => void
  listProjects: () => Promise<ProjectSummary[]>
  loadProject: (projectId: string) => Promise<ProjectDocument>
  saveProject: (project: ProjectDocument) => Promise<void>
  renameProject: (projectId: string, name: string) => Promise<void>
  duplicateProject: (projectId: string) => Promise<string>
  deleteProject: (projectId: string) => Promise<void>
  getAppSettings: () => Promise<AppSettings>
  chooseProjectsDirectory: () => Promise<AppSettings | null>
  resetProjectsDirectory: () => Promise<AppSettings>
  chooseRenderDirectory: () => Promise<AppSettings | null>
  resetRenderDirectory: () => Promise<AppSettings>
  chooseStudioProjectsDirectory: () => Promise<AppSettings | null>
  resetStudioProjectsDirectory: () => Promise<AppSettings>
  openStudioProjectsDirectory: () => Promise<boolean>
  setAutoStockEnabled: (enabled: boolean) => Promise<AppSettings>
  clearCache: () => Promise<AppSettings>
  trimYouTube: (
    url: string,
    startTime: number,
    endTime: number,
    projectId: string
  ) => Promise<string>
  onYouTubeTrimProgress: (callback: (progress: number) => void) => void
  searchImages: (query: string, pexelsKey?: string) => Promise<ImageSearchResult[]>
  searchDuckDuckGoImages: (query: string) => Promise<ImageSearchResult[]>
  searchYouTube: (query: string, apiKey: string) => Promise<YouTubeSearchResult[]>
  getDefaultExportPath: (defaultName: string) => Promise<string>
  chooseExportPath: (defaultName: string) => Promise<string | null>
  getEncoderCapabilities: () => Promise<EncoderCapabilities>
  exportVideo: (request: ExportVideoRequest) => Promise<string>
  cancelExport: () => Promise<boolean>
  onExportProgress: (callback: (progress: number) => void) => void
  chooseBatchExportDirectory: () => Promise<string | null>
  batchExportProjects: (request: BatchExportRequest) => Promise<BatchExportResult>
  cancelBatchExport: () => Promise<boolean>
  onBatchExportProgress: (
    callback: (progress: BatchExportProgress) => void
  ) => void
  getPexelsKey: () => Promise<string | null>
  setPexelsKey: (key: string) => Promise<void>
  getGroqKey: () => Promise<string | null>
  setGroqKey: (key: string) => Promise<void>
  getYouTubeKey: () => Promise<string | null>
  setYouTubeKey: (key: string) => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
