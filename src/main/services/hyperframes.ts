import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function safeIdentifier(value: string, label: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error(`Invalid ${label}.`)
  return value
}

export function portableCompositionHtml(html: string) {
  return html.replace(
    /rhymx-media:\/\/local\/([^"'\s)<]+)/g,
    (_match, encoded: string) => {
      try {
        return pathToFileURL(decodeURIComponent(encoded)).toString()
      } catch {
        return _match
      }
    }
  )
}

export async function resolveHyperframesBin(appPath: string) {
  const candidates = [
    path.join(appPath, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs'),
    path.join(
      appPath.replace(/app\.asar$/i, 'app.asar.unpacked'),
      'node_modules',
      'hyperframes',
      'bin',
      'hyperframes.mjs'
    ),
  ]
  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // Keep looking for an unpacked or development copy.
    }
  }
  throw new Error('The bundled HyperFrames CLI is unavailable. Run npm install and restart the app.')
}

export async function renderHyperframesScene(options: {
  appPath: string
  workingDirectory: string
  studioProjectDirectory?: string
  projectId: string
  sceneId: string
  html: string
  onChunk: (chunk: string) => void
}) {
  const projectId = safeIdentifier(options.projectId, 'project id')
  const sceneId = safeIdentifier(options.sceneId, 'scene id')
  if (!options.html.includes('data-composition-id')) {
    throw new Error('This scene is missing a HyperFrames composition root.')
  }
  if (options.html.length > 1_000_000) throw new Error('Composition HTML is too large.')

  const sceneDirectory = path.join(
    options.workingDirectory,
    'clips',
    projectId,
    'hyperframes',
    sceneId
  )
  await fs.mkdir(sceneDirectory, { recursive: true })
  const inputPath = path.join(sceneDirectory, 'index.html')
  const outputPath = path.join(sceneDirectory, 'scene.mp4')
  if (options.html.includes('data-composition-src')) {
    if (!options.studioProjectDirectory) {
      throw new Error('The Studio project directory is required to render nested Comps.')
    }
    try {
      await fs.access(path.join(options.studioProjectDirectory, 'index.html'))
    } catch {
      throw new Error(
        'The Studio project files for this animation are missing. Open the project in Studio before exporting.'
      )
    }
    // A master composition references child HTML files (and potentially assets)
    // relative to its Studio project. Stage the whole project so the CLI sees
    // the same file graph that Studio previews.
    await fs.cp(options.studioProjectDirectory, sceneDirectory, {
      recursive: true,
      force: true,
    })
  }
  await fs.writeFile(inputPath, portableCompositionHtml(options.html), 'utf8')

  const cliPath = await resolveHyperframesBin(options.appPath)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, 'render', '-o', outputPath], {
      cwd: sceneDirectory,
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    })
    let errors = ''
    const timeout = setTimeout(() => child.kill(), 30 * 60 * 1_000)
    child.stdout.on('data', (data: Buffer) => options.onChunk(data.toString('utf8')))
    child.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString('utf8')
      errors += chunk
      options.onChunk(chunk)
    })
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(errors.trim() || `HyperFrames render exited with code ${code}.`))
    })
  })

  await fs.access(outputPath)
  return outputPath
}
