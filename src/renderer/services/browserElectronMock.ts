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
      models: [
        'Gemini 3.7 Flash (High)',
        'Gemini 3.7 Flash (Medium)',
        'Gemini 3.7 Flash (Low)',
        'Gemini 3.6 Flash (High)',
        'Gemini 3.6 Flash (Medium)',
        'Gemini 3.6 Flash (Low)',
        'Gemini 3.5 Flash (High)',
        'Gemini 3.5 Flash (Medium)',
        'Gemini 3.5 Flash (Low)',
        'Gemini 3.1 Pro (High)',
        'Gemini 3.1 Pro (Low)',
        'Claude Sonnet 4.6 (Thinking)',
        'Claude Opus 4.6 (Thinking)',
        'GPT-OSS 120B (Medium)',
      ],
      message: 'Antigravity is connected by the Electron desktop process.',
    }),
    launchAntigravityLogin: unavailable,
    openAntigravityInstallDocs: async () => undefined,
    runAntigravity: unavailable,
    runStudioAntigravity: unavailable,
    cancelAntigravity: async () => false,
    onAntigravityStream: removeListener,
    renderHyperframesScene: unavailable,
    onHyperframesRenderProgress: removeListener,
    openHyperframesStudio: unavailable,
    readHyperframesStudioHtml: unavailable,
    writeHyperframesStudioHtml: unavailable,
    appendHyperframesStudioComposition: unavailable,
    closeHyperframesStudio: async () => true,
    openChatReferenceImages: async () => [],
    saveChatReferenceImage: unavailable,
    openMediaFiles: async () => [],
    getMediaDuration: async () => null,
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
      renderDirectory: 'Browser preview renders',
      defaultRenderDirectory: 'Browser preview renders',
      workingDirectory: 'Browser preview renders/.gravity-frames',
      studioProjectsDirectory: 'Browser preview renders/.gravity-frames/studio',
      defaultStudioProjectsDirectory: 'Browser preview renders/.gravity-frames/studio',
      cacheSizeBytes: 0,
      workingFilesSizeBytes: 0,
    }),
    chooseProjectsDirectory: async () => null,
    resetProjectsDirectory: unavailable,
    chooseRenderDirectory: async () => null,
    resetRenderDirectory: unavailable,
    chooseStudioProjectsDirectory: async () => null,
    resetStudioProjectsDirectory: unavailable,
    openStudioProjectsDirectory: unavailable,
    clearCache: unavailable,
    getDefaultExportPath: async (defaultName) =>
      `Browser preview renders/${defaultName}`,
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
  } as ElectronAPI
}
