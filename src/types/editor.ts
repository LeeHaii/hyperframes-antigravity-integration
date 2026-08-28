export type AppScreen = 'projects' | 'new-project' | 'editor'

export type WorkspaceMode = 'chat' | 'studio'

export interface ChatReferenceImage {
  id: string
  name: string
  path: string
  relativePath: string
}

export interface WebImageSearchCapability {
  allowed: boolean
  reason: string
}

export interface ProjectCapabilities {
  web_image_search: WebImageSearchCapability
}

export interface WebImageSearchDecision extends WebImageSearchCapability {
  explicit: boolean
}

export interface WebImageCandidate {
  id: string
  title: string
  thumbnailPath: string
  sourcePageUrl: string
  width: number
  height: number
  mimeType: string
  provider: 'wikimedia-commons'
  author: string
  license: string
  attribution: string
}

export interface WebImageSearchResult {
  searchId: string
  query: string
  candidates: WebImageCandidate[]
}

export interface WebImageAsset extends ChatReferenceImage {
  projectRelativePath: string
  sourcePageUrl: string
  sourceImageUrl: string
  width: number
  height: number
  mimeType: string
  provider: 'wikimedia-commons'
  author: string
  license: string
  attribution: string
  sha256: string
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
  type: 'local_video' | 'local_image'
  kind?: MediaKind
  sourceUrl: string
  thumbnailUrl: string
  title: string
  durationSec?: number
  sourceStartSec?: number
  sourceDurationSec?: number
  imageFit?: 'cover' | 'contain'
  enableKenBurnsEffect?: boolean
}

export interface LibraryAsset {
  id: string
  name: string
  path: string
  kind: MediaKind
  durationSec?: number
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
  capabilities?: ProjectCapabilities
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
  cacheSizeBytes: number
  workingFilesSizeBytes: number
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
  userPrompt?: string
  capabilities?: ProjectCapabilities
}

export interface SearchWebImagesRequest {
  projectId: string
  sceneId: string
  query: string
  userPrompt: string
  capabilities: ProjectCapabilities
  limit?: number
}

export interface IngestWebImageRequest {
  projectId: string
  sceneId: string
  searchId: string
  candidateId: string
  userPrompt: string
  capabilities: ProjectCapabilities
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
  searchWebImages: (request: SearchWebImagesRequest) => Promise<WebImageSearchResult>
  ingestWebImage: (request: IngestWebImageRequest) => Promise<WebImageAsset>
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
  openMediaFiles: () => Promise<ImportedFile[]>
  getMediaDuration: (filePath: string) => Promise<number | null>
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
  clearCache: () => Promise<AppSettings>
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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
