import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getAntigravityStatus: () => ipcRenderer.invoke('antigravity-status'),
  launchAntigravityLogin: () => ipcRenderer.invoke('antigravity-login'),
  openAntigravityInstallDocs: () => ipcRenderer.invoke('antigravity-install-docs'),
  runAntigravity: (request: any) => ipcRenderer.invoke('antigravity-run', request),
  cancelAntigravity: (requestId: string) =>
    ipcRenderer.invoke('antigravity-cancel', requestId),
  onAntigravityStream: (callback: (event: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: any) => callback(value)
    ipcRenderer.on('antigravity-stream', listener)
    return () => ipcRenderer.removeListener('antigravity-stream', listener)
  },
  renderHyperframesScene: (request: any) =>
    ipcRenderer.invoke('hyperframes-render-scene', request),
  onHyperframesRenderProgress: (callback: (event: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: any) => callback(value)
    ipcRenderer.on('hyperframes-render-progress', listener)
    return () => ipcRenderer.removeListener('hyperframes-render-progress', listener)
  },
  openAudioFile: () => ipcRenderer.invoke('open-audio-file'),
  openMediaFiles: () => ipcRenderer.invoke('open-media-files'),
  getMediaDuration: (filePath: string) => ipcRenderer.invoke('get-media-duration', filePath),
  transcribeAudio: (filePath: string, apiKey: string) => ipcRenderer.invoke('transcribe-audio', filePath, apiKey),
  onTranscriptionProgress: (callback: (progress: any) => void) => {
    ipcRenderer.removeAllListeners('transcription-progress')
    ipcRenderer.on('transcription-progress', (_event, value) => callback(value))
  },
  autoMatchPexelsVideos: (scenes: any[], apiKey: string) =>
    ipcRenderer.invoke('auto-match-pexels-videos', scenes, apiKey),
  onPexelsAutoMatchProgress: (callback: (progress: any) => void) => {
    ipcRenderer.removeAllListeners('pexels-auto-match-progress')
    ipcRenderer.on('pexels-auto-match-progress', (_event, value) => callback(value))
  },
  listProjects: () => ipcRenderer.invoke('list-projects'),
  loadProject: (projectId: string) => ipcRenderer.invoke('load-project', projectId),
  saveProject: (project: any) => ipcRenderer.invoke('save-project', project),
  renameProject: (projectId: string, name: string) =>
    ipcRenderer.invoke('rename-project', projectId, name),
  duplicateProject: (projectId: string) =>
    ipcRenderer.invoke('duplicate-project', projectId),
  deleteProject: (projectId: string) =>
    ipcRenderer.invoke('delete-project', projectId),
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  chooseProjectsDirectory: () => ipcRenderer.invoke('choose-projects-directory'),
  resetProjectsDirectory: () => ipcRenderer.invoke('reset-projects-directory'),
  setAutoStockEnabled: (enabled: boolean) =>
    ipcRenderer.invoke('set-auto-stock-enabled', enabled),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  trimYouTube: (
    url: string,
    startTime: number,
    endTime: number,
    projectId: string
  ) => ipcRenderer.invoke('trim-youtube', url, startTime, endTime, projectId),
  onYouTubeTrimProgress: (callback: (progress: number) => void) => {
    ipcRenderer.removeAllListeners('youtube-trim-progress')
    ipcRenderer.on('youtube-trim-progress', (_event, value) => callback(value))
  },
  searchImages: (query: string, pexelsKey?: string) =>
    ipcRenderer.invoke('search-images', query, pexelsKey),
  searchDuckDuckGoImages: (query: string) =>
    ipcRenderer.invoke('search-duckduckgo-images', query),
  searchYouTube: (query: string, apiKey: string) =>
    ipcRenderer.invoke('search-youtube', query, apiKey),
  chooseExportPath: (defaultName: string) =>
    ipcRenderer.invoke('choose-export-path', defaultName),
  getEncoderCapabilities: () => ipcRenderer.invoke('get-encoder-capabilities'),
  exportVideo: (request: any) => ipcRenderer.invoke('export-video', request),
  cancelExport: () => ipcRenderer.invoke('cancel-export'),
  onExportProgress: (callback: (progress: number) => void) => {
    ipcRenderer.removeAllListeners('export-progress')
    ipcRenderer.on('export-progress', (_event, value) => callback(value))
  },
  chooseBatchExportDirectory: () =>
    ipcRenderer.invoke('choose-batch-export-directory'),
  batchExportProjects: (request: any) =>
    ipcRenderer.invoke('batch-export-projects', request),
  cancelBatchExport: () => ipcRenderer.invoke('cancel-batch-export'),
  onBatchExportProgress: (callback: (progress: any) => void) => {
    ipcRenderer.removeAllListeners('batch-export-progress')
    ipcRenderer.on('batch-export-progress', (_event, value) => callback(value))
  },
  getPexelsKey: () => ipcRenderer.invoke('get-pexels-key'),
  setPexelsKey: (key: string) => ipcRenderer.invoke('set-pexels-key', key),
  getGroqKey: () => ipcRenderer.invoke('get-groq-key'),
  setGroqKey: (key: string) => ipcRenderer.invoke('set-groq-key', key),
  getYouTubeKey: () => ipcRenderer.invoke('get-youtube-key'),
  setYouTubeKey: (key: string) => ipcRenderer.invoke('set-youtube-key', key),
})
