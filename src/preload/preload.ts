import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getAntigravityStatus: () => ipcRenderer.invoke('antigravity-status'),
  launchAntigravityLogin: () => ipcRenderer.invoke('antigravity-login'),
  openAntigravityInstallDocs: () => ipcRenderer.invoke('antigravity-install-docs'),
  runAntigravity: (request: any) => ipcRenderer.invoke('antigravity-run', request),
  runStudioAntigravity: (request: any) =>
    ipcRenderer.invoke('antigravity-run-studio', request),
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
  openHyperframesStudio: (request: any) =>
    ipcRenderer.invoke('hyperframes-studio-open', request),
  readHyperframesStudioHtml: (request: any) =>
    ipcRenderer.invoke('hyperframes-studio-read', request),
  writeHyperframesStudioHtml: (request: any) =>
    ipcRenderer.invoke('hyperframes-studio-write', request),
  appendHyperframesStudioComposition: (request: any) =>
    ipcRenderer.invoke('hyperframes-studio-append-composition', request),
  closeHyperframesStudio: () => ipcRenderer.invoke('hyperframes-studio-close'),
  openChatReferenceImages: (projectId: string) =>
    ipcRenderer.invoke('open-chat-reference-images', projectId),
  saveChatReferenceImage: (projectId: string, image: any) =>
    ipcRenderer.invoke('save-chat-reference-image', projectId, image),
  openMediaFiles: () => ipcRenderer.invoke('open-media-files'),
  getMediaDuration: (filePath: string) => ipcRenderer.invoke('get-media-duration', filePath),
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
  chooseRenderDirectory: () => ipcRenderer.invoke('choose-render-directory'),
  resetRenderDirectory: () => ipcRenderer.invoke('reset-render-directory'),
  chooseStudioProjectsDirectory: () =>
    ipcRenderer.invoke('choose-studio-projects-directory'),
  resetStudioProjectsDirectory: () =>
    ipcRenderer.invoke('reset-studio-projects-directory'),
  openStudioProjectsDirectory: () =>
    ipcRenderer.invoke('open-studio-projects-directory'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  getDefaultExportPath: (defaultName: string) =>
    ipcRenderer.invoke('get-default-export-path', defaultName),
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
})
