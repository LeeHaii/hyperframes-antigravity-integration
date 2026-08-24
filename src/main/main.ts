import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  shell,
} from 'electron'
import { createReadStream } from 'node:fs'
import { createServer, Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { getMediaDuration } from './services/mediaMetadata'
import {
  registerLocalMediaProtocol,
  registerLocalMediaScheme,
} from './services/localMediaProtocol'
import { cancelActiveExport, exportVideo } from './services/export'
import { getEncoderCapabilities } from './services/hardware'
import {
  cancelAntigravity,
  getAntigravityStatus,
  launchAntigravityLogin,
  runAntigravity,
} from './services/antigravity'
import { renderHyperframesScene } from './services/hyperframes'
import {
  appendHyperframesStudioComposition,
  closeHyperframesStudio,
  hyperframesStudioDirectory,
  openHyperframesStudio,
  readHyperframesStudioHtml,
  writeHyperframesStudioHtml,
} from './services/hyperframesStudio'
import fs from 'fs/promises'
import {
  AppSettings,
  BatchExportRequest,
  BatchExportResult,
  ExportVideoRequest,
  ProjectDocument,
} from '../types/editor'

let mainWindow: BrowserWindow | null = null
let batchExportCancelled = false
let rendererServer: Server | null = null
let rendererOriginPromise: Promise<string> | null = null
let studioDownloadHandlerRegistered = false

registerLocalMediaScheme()

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webSecurity: false, // For loading local file:// URIs in development
      devTools: false,
    },
  })

  // Set CSP to allow local files and images
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== 'mainFrame') {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: file: rhymx-media: https:; media-src 'self' data: blob: file: rhymx-media: https:; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; frame-src 'self' blob: data: file: rhymx-media: http://localhost:* http://127.0.0.1:*;",
        ]
      }
    })
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadURL(await getRendererOrigin())
  }
}

function getRendererOrigin() {
  if (rendererOriginPromise) return rendererOriginPromise
  rendererOriginPromise = new Promise<string>((resolve, reject) => {
    const rendererDirectory = path.resolve(__dirname, '../dist-renderer')
    const server = createServer(async (request, response) => {
      try {
        const requestUrl = new URL(request.url || '/', 'http://127.0.0.1')
        const relativePath =
          requestUrl.pathname === '/'
            ? 'index.html'
            : decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '')
        const filePath = path.resolve(rendererDirectory, relativePath)
        if (
          filePath !== rendererDirectory &&
          !filePath.startsWith(`${rendererDirectory}${path.sep}`)
        ) {
          response.writeHead(403)
          response.end('Forbidden')
          return
        }
        const stats = await fs.stat(filePath)
        if (!stats.isFile()) throw new Error('Not a file')
        response.writeHead(200, {
          'Content-Type': rendererContentType(filePath),
          'Content-Length': stats.size,
          'Cache-Control': 'no-cache',
        })
        if (request.method === 'HEAD') {
          response.end()
        } else {
          createReadStream(filePath).pipe(response)
        }
      } catch {
        response.writeHead(404)
        response.end('Not found')
      }
    })
    server.once('error', (error) => {
      rendererOriginPromise = null
      reject(error)
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        rendererOriginPromise = null
        reject(new Error('Could not start the renderer server.'))
        return
      }
      rendererServer = server
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })
  return rendererOriginPromise
}

function rendererContentType(filePath: string) {
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  }
  return types[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
}

app.whenReady().then(() => {
  registerStudioRenderDownloads()
  registerLocalMediaProtocol().then(createWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeHyperframesStudio()
  rendererServer?.close()
  rendererServer = null
  rendererOriginPromise = null
})

// --- IPC Handlers ---

ipcMain.handle('antigravity-status', () => getAntigravityStatus())

ipcMain.handle('antigravity-login', () => launchAntigravityLogin())

ipcMain.handle('antigravity-install-docs', () =>
  shell.openExternal('https://antigravity.google/docs/cli/install')
)

ipcMain.handle('antigravity-cancel', (_, requestId: string) =>
  cancelAntigravity(String(requestId || ''))
)

ipcMain.handle('antigravity-run', async (event, request) => {
  const projectId = String(request?.projectId || '')
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) throw new Error('Invalid project id.')
  const workingDirectory = path.join(
    await getProjectsDirectory(),
    '.assets',
    projectId,
    'agent-workspace'
  )
  await fs.mkdir(workingDirectory, { recursive: true })
  return await runAntigravity(
    String(request?.requestId || ''),
    String(request?.prompt || ''),
    workingDirectory,
    request?.conversationId ? String(request.conversationId) : undefined,
    (stream, chunk) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('antigravity-stream', {
          requestId: String(request?.requestId || ''),
          stream,
          chunk,
        })
      }
    },
    request?.model ? String(request.model) : undefined
  )
})

ipcMain.handle('antigravity-run-studio', async (event, request) => {
  const projectId = String(request?.projectId || '')
  const sceneId = String(request?.sceneId || '')
  const workingDirectory = hyperframesStudioDirectory(
    await getStudioProjectsDirectory(),
    projectId,
    sceneId
  )
  await fs.mkdir(workingDirectory, { recursive: true })
  return await runAntigravity(
    String(request?.requestId || ''),
    String(request?.prompt || ''),
    workingDirectory,
    request?.conversationId ? String(request.conversationId) : undefined,
    (stream, chunk) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('antigravity-stream', {
          requestId: String(request?.requestId || ''),
          stream,
          chunk,
        })
      }
    },
    request?.model ? String(request.model) : undefined
  )
})

function registerStudioRenderDownloads() {
  if (studioDownloadHandlerRegistered) return
  studioDownloadHandlerRegistered = true
  session.defaultSession.on('will-download', (_event, item) => {
    const sourceUrl = item.getURL()
    if (!/\/api\/projects\/[^/]+\/renders\/file\//.test(sourceUrl)) return
    item.pause()
    void (async () => {
      const outputPath = await availableNamedOutputPath(
        await getRenderDirectory(),
        item.getFilename()
      )
      if (item.getState() === 'cancelled') return
      item.setSavePath(outputPath)
      item.resume()
    })().catch((error) => {
      console.error('Could not prepare the Studio render download:', error)
      item.cancel()
    })
  })
}

ipcMain.handle('hyperframes-render-scene', async (event, request) => {
  const projectId = String(request?.projectId || '')
  const sceneId = String(request?.sceneId || '')
  const studioProjectsDirectory = await getStudioProjectsDirectory()
  return await renderHyperframesScene({
    appPath: app.getAppPath(),
    workingDirectory: await getRenderWorkingDirectory(),
    studioProjectDirectory: hyperframesStudioDirectory(
      studioProjectsDirectory,
      projectId,
      sceneId
    ),
    projectId,
    sceneId,
    html: String(request?.html || ''),
    onChunk: (chunk) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('hyperframes-render-progress', {
          sceneId,
          chunk,
        })
      }
    },
  })
})

ipcMain.handle('hyperframes-studio-open', async (_, request) => {
  return await openHyperframesStudio({
    appPath: app.getAppPath(),
    studioProjectsDirectory: await getStudioProjectsDirectory(),
    projectId: String(request?.projectId || ''),
    sceneId: String(request?.sceneId || ''),
    html: String(request?.html || ''),
  })
})

ipcMain.handle('hyperframes-studio-read', async (_, request) => {
  return await readHyperframesStudioHtml({
    studioProjectsDirectory: await getStudioProjectsDirectory(),
    projectId: String(request?.projectId || ''),
    sceneId: String(request?.sceneId || ''),
  })
})

ipcMain.handle('hyperframes-studio-write', async (_, request) => {
  return await writeHyperframesStudioHtml({
    studioProjectsDirectory: await getStudioProjectsDirectory(),
    projectId: String(request?.projectId || ''),
    sceneId: String(request?.sceneId || ''),
    html: String(request?.html || ''),
  })
})

ipcMain.handle('hyperframes-studio-append-composition', async (_, request) => {
  return await appendHyperframesStudioComposition({
    studioProjectsDirectory: await getStudioProjectsDirectory(),
    projectId: String(request?.projectId || ''),
    sceneId: String(request?.sceneId || ''),
    html: String(request?.html || ''),
    label: String(request?.label || 'Animation'),
    preserveCurrent: Boolean(request?.preserveCurrent),
  })
})

ipcMain.handle('hyperframes-studio-close', () => closeHyperframesStudio())

ipcMain.handle('open-chat-reference-images', async (_, projectId: string) => {
  if (!mainWindow) return []
  const directory = await getProjectChatReferencesDirectory(String(projectId || ''))
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Add reference images',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
    ],
  })
  if (result.canceled) return []
  await fs.mkdir(directory, { recursive: true })
  return await Promise.all(
    result.filePaths.slice(0, 4).map(async (sourcePath) => {
      const extension = path.extname(sourcePath).toLowerCase()
      if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extension)) {
        throw new Error('Unsupported reference image format.')
      }
      const fileName = `${randomUUID()}${extension}`
      const destination = path.join(directory, fileName)
      await fs.copyFile(sourcePath, destination)
      return {
        id: randomUUID(),
        name: path.basename(sourcePath),
        path: destination,
        relativePath: path.join('references', fileName),
      }
    })
  )
})

ipcMain.handle(
  'save-chat-reference-image',
  async (_, projectId: string, image: any) => {
    const mimeTypes: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp',
      'image/gif': '.gif',
    }
    const mimeType = String(image?.mimeType || '').toLowerCase()
    const extension = mimeTypes[mimeType]
    if (!extension) throw new Error('Unsupported clipboard image format.')
    const bytes = Buffer.from(image?.data || [])
    if (bytes.length === 0) throw new Error('The clipboard image is empty.')
    if (bytes.length > 25 * 1024 * 1024) {
      throw new Error('Reference images must be smaller than 25 MB.')
    }
    const directory = await getProjectChatReferencesDirectory(String(projectId || ''))
    await fs.mkdir(directory, { recursive: true })
    const fileName = `${randomUUID()}${extension}`
    const destination = path.join(directory, fileName)
    await fs.writeFile(destination, bytes)
    return {
      id: randomUUID(),
      name: path.basename(String(image?.name || `Pasted image${extension}`)),
      path: destination,
      relativePath: path.join('references', fileName),
    }
  }
)

ipcMain.handle('get-media-duration', async (_, filePath: string) => {
  return await getMediaDuration(filePath)
})

ipcMain.handle('open-media-files', async () => {
  if (!mainWindow) return []
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Media',
        extensions: [
          'mp4', 'mov', 'mkv', 'webm', 'avi',
          'png', 'jpg', 'jpeg', 'webp', 'gif',
          'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus',
        ],
      },
    ],
  })
  if (result.canceled) return []

  const videoExtensions = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi'])
  const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])
  return await Promise.all(result.filePaths.map(async (filePath) => {
    const extension = path.extname(filePath).slice(1).toLowerCase()
    const kind = videoExtensions.has(extension)
      ? 'video'
      : imageExtensions.has(extension)
        ? 'image'
        : 'music'
    return {
      path: filePath,
      name: path.basename(filePath),
      kind,
      durationSec: kind === 'image' ? undefined : (await getMediaDuration(filePath)) || undefined,
    }
  }))
})

type PersistedPreferences = {
  projectsDirectory?: string
  renderDirectory?: string
  studioProjectsDirectory?: string
}

let preferencesCache: PersistedPreferences | null = null
const getDefaultProjectsDirectory = () => path.join(app.getPath('userData'), 'projects')
const getDefaultRenderDirectory = () => path.join(app.getPath('videos'), 'Gravity Frames')
const getPreferencesPath = () => path.join(app.getPath('userData'), 'preferences.json')

async function getPreferences(): Promise<PersistedPreferences> {
  if (preferencesCache) return preferencesCache
  try {
    preferencesCache = JSON.parse(
      await fs.readFile(getPreferencesPath(), 'utf8')
    ) as PersistedPreferences
  } catch {
    preferencesCache = {}
  }
  return preferencesCache
}

async function savePreferences(updates: Partial<PersistedPreferences>) {
  const preferences = { ...(await getPreferences()), ...updates }
  preferencesCache = preferences
  await fs.mkdir(path.dirname(getPreferencesPath()), { recursive: true })
  await fs.writeFile(getPreferencesPath(), JSON.stringify(preferences, null, 2), 'utf8')
  return preferences
}

async function getProjectsDirectory() {
  const preferences = await getPreferences()
  return preferences.projectsDirectory || getDefaultProjectsDirectory()
}

async function getProjectAgentWorkspaceDirectory(projectId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    throw new Error('Invalid project id.')
  }
  return path.join(
    await getProjectsDirectory(),
    '.assets',
    projectId,
    'agent-workspace'
  )
}

async function getProjectChatReferencesDirectory(projectId: string) {
  return path.join(await getProjectAgentWorkspaceDirectory(projectId), 'references')
}

async function getRenderDirectory() {
  const preferences = await getPreferences()
  return preferences.renderDirectory || getDefaultRenderDirectory()
}

async function getRenderWorkingDirectory() {
  return path.join(await getRenderDirectory(), '.gravity-frames')
}

async function getDefaultStudioProjectsDirectory() {
  return path.join(await getRenderWorkingDirectory(), 'studio')
}

async function getStudioProjectsDirectory() {
  const preferences = await getPreferences()
  return preferences.studioProjectsDirectory || (await getDefaultStudioProjectsDirectory())
}

async function getProjectPath(projectId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    throw new Error('Invalid project id.')
  }
  return path.join(await getProjectsDirectory(), `${projectId}.json`)
}

function cleanProjectName(name: string) {
  const cleaned = String(name || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  if (!cleaned) throw new Error('Project name cannot be empty.')
  return cleaned
}

async function writeProjectDocument(project: ProjectDocument) {
  const directory = await getProjectsDirectory()
  await fs.mkdir(directory, { recursive: true })
  const destination = await getProjectPath(project.id)
  const temporary = `${destination}.tmp`
  await fs.writeFile(temporary, JSON.stringify(project, null, 2), 'utf8')
  await fs.rename(temporary, destination)
}

async function uniqueDuplicateName(sourceName: string) {
  const directory = await getProjectsDirectory()
  await fs.mkdir(directory, { recursive: true })
  const existingNames = new Set<string>()
  for (const file of await fs.readdir(directory)) {
    if (!file.endsWith('.json')) continue
    try {
      const project = JSON.parse(
        await fs.readFile(path.join(directory, file), 'utf8')
      ) as ProjectDocument
      existingNames.add(project.name.toLocaleLowerCase())
    } catch {
      // Unreadable projects are already ignored by the project list.
    }
  }
  const copySuffix = ' copy'
  const source = cleanProjectName(sourceName)
  const baseName = `${source.slice(0, 120 - copySuffix.length)}${copySuffix}`
  let name = baseName
  let copyNumber = 2
  while (existingNames.has(name.toLocaleLowerCase())) {
    const suffix = ` (${copyNumber})`
    name = `${baseName.slice(0, 120 - suffix.length)}${suffix}`
    copyNumber += 1
  }
  return name
}

async function directorySize(directory: string): Promise<number> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    const sizes = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(directory, entry.name)
        if (entry.isDirectory()) return directorySize(entryPath)
        if (entry.isFile()) return (await fs.stat(entryPath)).size
        return 0
      })
    )
    return sizes.reduce((sum, size) => sum + size, 0)
  } catch {
    return 0
  }
}

async function appSettings(): Promise<AppSettings> {
  const renderDirectory = await getRenderDirectory()
  const workingDirectory = await getRenderWorkingDirectory()
  const defaultStudioProjectsDirectory = await getDefaultStudioProjectsDirectory()
  const cacheSizeBytes =
    (await directorySize(path.join(workingDirectory, 'cache'))) +
    (await directorySize(path.join(workingDirectory, 'temp')))
  return {
    projectsDirectory: await getProjectsDirectory(),
    defaultProjectsDirectory: getDefaultProjectsDirectory(),
    renderDirectory,
    defaultRenderDirectory: getDefaultRenderDirectory(),
    workingDirectory,
    studioProjectsDirectory: await getStudioProjectsDirectory(),
    defaultStudioProjectsDirectory,
    cacheSizeBytes,
    workingFilesSizeBytes: await directorySize(workingDirectory),
  }
}

ipcMain.handle('list-projects', async () => {
  const directory = await getProjectsDirectory()
  await fs.mkdir(directory, { recursive: true })
  const files = await fs.readdir(directory)
  const projects = await Promise.all(
    files
      .filter((file) => file.endsWith('.json'))
      .map(async (file) => {
        try {
          const project = JSON.parse(
            await fs.readFile(path.join(directory, file), 'utf8')
          ) as ProjectDocument
          return {
            id: project.id,
            name: project.name,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            duration: project.audioFile?.duration || 0,
            sceneCount: project.scenes?.length || 0,
          }
        } catch (error) {
          console.warn(`Skipping unreadable project file: ${file}`, error)
          return null
        }
      })
  )

  return projects
    .filter((project): project is NonNullable<typeof project> => Boolean(project))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
})

async function loadProjectDocument(projectId: string) {
  const contents = await fs.readFile(await getProjectPath(projectId), 'utf8')
  const project = JSON.parse(contents) as ProjectDocument
  await Promise.all([
    ...(project.mediaLibrary || []).map(async (asset) => {
      if (asset.kind === 'image' || asset.durationSec) return
      asset.durationSec = (await getMediaDuration(asset.path)) || undefined
    }),
    ...(project.audioClips || []).map(async (clip) => {
      if (clip.sourceDurationSec) return
      clip.sourceDurationSec = (await getMediaDuration(clip.path)) || undefined
      clip.sourceStartSec = clip.sourceStartSec ?? 0
    }),
    ...(project.scenes || []).map(async (scene) => {
      const media = scene.media
      if (
        !media ||
        media.sourceDurationSec ||
        media.type === 'local_image' ||
        /^(https?:|data:|blob:)/.test(media.sourceUrl)
      ) {
        return
      }
      const mediaPath = media.sourceUrl.startsWith('file:')
        ? fileURLToPath(media.sourceUrl)
        : media.sourceUrl
      media.sourceDurationSec = (await getMediaDuration(mediaPath)) || undefined
      media.sourceStartSec = media.sourceStartSec ?? 0
    }),
  ])
  return project
}

ipcMain.handle('load-project', async (_, projectId: string) => {
  return await loadProjectDocument(projectId)
})

ipcMain.handle('save-project', async (_, project: ProjectDocument) => {
  await writeProjectDocument(project)
})

ipcMain.handle('rename-project', async (_, projectId: string, name: string) => {
  const project = JSON.parse(
    await fs.readFile(await getProjectPath(projectId), 'utf8')
  ) as ProjectDocument
  project.name = cleanProjectName(name)
  project.updatedAt = new Date().toISOString()
  await writeProjectDocument(project)
})

ipcMain.handle('duplicate-project', async (_, projectId: string) => {
  const source = JSON.parse(
    await fs.readFile(await getProjectPath(projectId), 'utf8')
  ) as ProjectDocument
  const now = new Date().toISOString()
  const duplicate: ProjectDocument = {
    ...source,
    id: randomUUID(),
    name: await uniqueDuplicateName(source.name),
    createdAt: now,
    updatedAt: now,
  }
  await writeProjectDocument(duplicate)
  return duplicate.id
})

ipcMain.handle('delete-project', async (_, projectId: string) => {
  await fs.unlink(await getProjectPath(projectId))
})

ipcMain.handle('get-app-settings', () => appSettings())

ipcMain.handle('choose-projects-directory', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose project storage folder',
    defaultPath: await getProjectsDirectory(),
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const directory = path.resolve(result.filePaths[0])
  await fs.mkdir(directory, { recursive: true })
  const testPath = path.join(directory, `.rhymx-write-test-${Date.now()}`)
  await fs.writeFile(testPath, 'ok', 'utf8')
  await fs.unlink(testPath)
  await savePreferences({ projectsDirectory: directory })
  return await appSettings()
})

ipcMain.handle('reset-projects-directory', async () => {
  await savePreferences({ projectsDirectory: undefined })
  await fs.mkdir(getDefaultProjectsDirectory(), { recursive: true })
  return await appSettings()
})

ipcMain.handle('choose-render-directory', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose default render folder',
    defaultPath: await getRenderDirectory(),
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const directory = path.resolve(result.filePaths[0])
  await fs.mkdir(directory, { recursive: true })
  const testPath = path.join(directory, `.gravity-frames-write-test-${Date.now()}`)
  await fs.writeFile(testPath, 'ok', 'utf8')
  await fs.unlink(testPath)
  await savePreferences({ renderDirectory: directory })
  return await appSettings()
})

ipcMain.handle('choose-studio-projects-directory', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose HyperFrames Studio projects folder',
    defaultPath: await getStudioProjectsDirectory(),
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const directory = path.resolve(result.filePaths[0])
  await fs.mkdir(directory, { recursive: true })
  const testPath = path.join(directory, `.gravity-frames-write-test-${Date.now()}`)
  await fs.writeFile(testPath, 'ok', 'utf8')
  await fs.unlink(testPath)
  await savePreferences({ studioProjectsDirectory: directory })
  return await appSettings()
})

ipcMain.handle('reset-studio-projects-directory', async () => {
  await savePreferences({ studioProjectsDirectory: undefined })
  await fs.mkdir(await getDefaultStudioProjectsDirectory(), { recursive: true })
  return await appSettings()
})

ipcMain.handle('open-studio-projects-directory', async () => {
  const directory = await getStudioProjectsDirectory()
  await fs.mkdir(directory, { recursive: true })
  const error = await shell.openPath(directory)
  if (error) throw new Error(error)
  return true
})

ipcMain.handle('reset-render-directory', async () => {
  await savePreferences({ renderDirectory: undefined })
  await fs.mkdir(getDefaultRenderDirectory(), { recursive: true })
  return await appSettings()
})

ipcMain.handle('clear-cache', async () => {
  await session.defaultSession.clearCache()
  const workingDirectory = path.resolve(await getRenderWorkingDirectory())
  for (const name of ['cache', 'temp']) {
    const directory = path.resolve(workingDirectory, name)
    if (directory.startsWith(`${workingDirectory}${path.sep}`)) {
      await fs.rm(directory, { recursive: true, force: true })
      await fs.mkdir(directory, { recursive: true })
    }
  }
  return await appSettings()
})

ipcMain.handle('choose-export-path', async (_, defaultName: string) => {
  if (!mainWindow) return null
  const safeName = `${path.basename(defaultName || 'AI Video', path.extname(defaultName || ''))}.mp4`
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export video',
    defaultPath: path.join(await getRenderDirectory(), safeName),
    filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
  })
  return result.canceled ? null : result.filePath || null
})

ipcMain.handle('get-default-export-path', async (_, defaultName: string) => {
  const baseName = path.basename(
    defaultName || 'AI Video',
    path.extname(defaultName || '')
  )
  return await availableOutputPath(await getRenderDirectory(), baseName)
})

ipcMain.handle('get-encoder-capabilities', () => getEncoderCapabilities())
ipcMain.handle('cancel-export', () => cancelActiveExport())

ipcMain.handle('export-video', async (_, request: ExportVideoRequest) => {
  return await exportVideo(request, (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('export-progress', progress)
    }
  })
})

ipcMain.handle('choose-batch-export-directory', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose batch export folder',
    defaultPath: await getRenderDirectory(),
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled ? null : result.filePaths[0] || null
})

async function availableOutputPath(directory: string, projectName: string) {
  const safeName =
    projectName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'AI Video'
  let suffix = 1
  while (true) {
    const candidate = path.join(
      directory,
      `${safeName}${suffix === 1 ? '' : ` (${suffix})`}.mp4`
    )
    try {
      await fs.access(candidate)
      suffix += 1
    } catch {
      return candidate
    }
  }
}

async function availableNamedOutputPath(directory: string, requestedName: string) {
  const requestedExtension = path.extname(requestedName).toLowerCase()
  const extension = ['.mp4', '.webm', '.mov'].includes(requestedExtension)
    ? requestedExtension
    : '.mp4'
  const baseName =
    path
      .basename(requestedName, requestedExtension)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .trim() || 'HyperFrames render'
  await fs.mkdir(directory, { recursive: true })
  for (let suffix = 0; ; suffix += 1) {
    const candidate = path.join(
      directory,
      `${baseName}${suffix === 0 ? '' : ` (${suffix + 1})`}${extension}`
    )
    try {
      await fs.access(candidate)
    } catch {
      return candidate
    }
  }
}

ipcMain.handle(
  'batch-export-projects',
  async (_, request: BatchExportRequest): Promise<BatchExportResult> => {
    batchExportCancelled = false
    await fs.mkdir(request.outputDirectory, { recursive: true })
    const result: BatchExportResult = { completed: [], failed: [], cancelled: false }

    for (let index = 0; index < request.projectIds.length; index += 1) {
      if (batchExportCancelled) break
      const projectId = request.projectIds[index]
      let projectName = projectId

      try {
        const project = await loadProjectDocument(projectId)
        projectName = project.name
        if (!project.audioFile) throw new Error('Project has no voiceover audio.')
        const outputPath = await availableOutputPath(
          request.outputDirectory,
          project.name
        )
        const notify = (
          projectProgress: number,
          status:
            | 'preparing'
            | 'rendering'
            | 'completed'
            | 'failed'
            | 'cancelled',
          message?: string
        ) => {
          mainWindow?.webContents.send('batch-export-progress', {
            projectId,
            projectName: project.name,
            projectIndex: index,
            totalProjects: request.projectIds.length,
            projectProgress,
            status,
            message,
          })
        }

        notify(0, 'preparing')
        await exportVideo(
          {
            scenes: project.scenes,
            audioPath: project.audioFile.path,
            audioClips: project.audioClips || [],
            subtitleSettings: project.subtitleSettings,
            subtitles: project.subtitles || [],
            videoTracks: project.videoTracks || [],
            voiceTrackSettings: project.voiceTrackSettings || {
              muted: false,
              visible: true,
            },
            audioTrackSettings: project.audioTrackSettings || {
              muted: false,
              visible: true,
            },
            outputPath,
            width: request.width,
            height: request.height,
            videoBitrate: request.videoBitrate,
            encoder: request.encoder,
          },
          (progress) => notify(progress, 'rendering')
        )
        result.completed.push({ projectId, outputPath })
        notify(100, 'completed', outputPath)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (batchExportCancelled) {
          mainWindow?.webContents.send('batch-export-progress', {
            projectId,
            projectName,
            projectIndex: index,
            totalProjects: request.projectIds.length,
            projectProgress: 0,
            status: 'cancelled',
            message: 'Batch export cancelled.',
          })
          break
        }
        result.failed.push({ projectId, error: message })
        mainWindow?.webContents.send('batch-export-progress', {
          projectId,
          projectName,
          projectIndex: index,
          totalProjects: request.projectIds.length,
          projectProgress: 0,
          status: 'failed',
          message,
        })
      }
    }

    result.cancelled = batchExportCancelled
    batchExportCancelled = false
    return result
  }
)

ipcMain.handle('cancel-batch-export', () => {
  batchExportCancelled = true
  cancelActiveExport()
  return true
})
