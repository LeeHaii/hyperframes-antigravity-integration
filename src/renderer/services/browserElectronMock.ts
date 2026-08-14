import { ElectronAPI, ProjectDocument } from '../../types/editor'

// Vite's browser preview does not have Electron's preload bridge. A small,
// local-only adapter keeps the UI inspectable without pretending that desktop
// integrations (OAuth, filesystem dialogs, rendering) are available.
if (!window.electronAPI) {
  const projects = new Map<string, ProjectDocument>()
  const unavailable = async () => {
    throw new Error('This action is available in the Electron app.')
  }
  const noop = () => undefined
  const removeListener = () => noop

  window.electronAPI = {
    getAntigravityStatus: async () => ({
      installed: true,
      minimumVersionMet: true,
      version: 'agy 1.1.12',
      authOwner: 'system-keyring',
      accountEmail: 'preview.user@example.com',
      accountPlan: 'Google AI Pro',
      message: 'Antigravity is connected by the Electron desktop process.',
    }),
    launchAntigravityLogin: unavailable,
    openAntigravityInstallDocs: async () => undefined,
    runAntigravity: unavailable,
    cancelAntigravity: async () => false,
    onAntigravityStream: removeListener,
    renderHyperframesScene: unavailable,
    onHyperframesRenderProgress: removeListener,
    openAudioFile: async () => null,
    openMediaFiles: async () => [],
    getMediaDuration: async () => null,
    transcribeAudio: unavailable,
    onTranscriptionProgress: noop,
    autoMatchPexelsVideos: unavailable,
    onPexelsAutoMatchProgress: noop,
    listProjects: async () => [],
    loadProject: async (projectId) => {
      const project = projects.get(projectId)
      if (!project) throw new Error('Project not found in browser preview.')
      return project
    },
    saveProject: async (project) => {
      projects.set(project.id, project)
    },
    renameProject: async () => undefined,
    duplicateProject: unavailable,
    deleteProject: async (projectId) => {
      projects.delete(projectId)
    },
    getAppSettings: async () => ({
      projectsDirectory: 'Browser preview',
      defaultProjectsDirectory: 'Browser preview',
      autoStockEnabled: false,
      cacheSizeBytes: 0,
    }),
    chooseProjectsDirectory: async () => null,
    resetProjectsDirectory: unavailable,
    setAutoStockEnabled: unavailable,
    clearCache: unavailable,
    trimYouTube: unavailable,
    onYouTubeTrimProgress: noop,
    searchImages: async () => [],
    searchDuckDuckGoImages: async () => [],
    searchYouTube: async () => [],
    chooseExportPath: async () => null,
    getEncoderCapabilities: async () => ({
      cpu: true,
      nvenc: false,
      amdGpuDetected: false,
      gpuNames: [],
    }),
    exportVideo: unavailable,
    cancelExport: async () => false,
    onExportProgress: noop,
    chooseBatchExportDirectory: async () => null,
    batchExportProjects: unavailable,
    cancelBatchExport: async () => false,
    onBatchExportProgress: noop,
    getPexelsKey: async () => null,
    setPexelsKey: async () => undefined,
    getGroqKey: async () => null,
    setGroqKey: async () => undefined,
    getYouTubeKey: async () => null,
    setYouTubeKey: async () => undefined,
  } as ElectronAPI
}
