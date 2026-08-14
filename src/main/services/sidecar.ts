import { spawn } from 'child_process'
import { app } from 'electron'
import { dir as compositorDirectory } from '@remotion/compositor-win32-x64-msvc'
import path from 'path'
import { pathToFileURL } from 'node:url'
import fs from 'fs/promises'

// Helper to run yt-dlp
export async function trimYouTube(
  url: string,
  startTime: number,
  endTime: number,
  outputDirectory: string,
  onProgress: (progress: number) => void = () => undefined
): Promise<string> {
  await fs.mkdir(outputDirectory, { recursive: true })
  const outputPath = path.join(outputDirectory, `rhymx_clip_${Date.now()}.mp4`)

  const ytdlpPath = await resolveYtDlpPath()

  const args = [
    url,
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--ffmpeg-location', ffmpegDirectory(),
    '--download-sections', `*${startTime}-${endTime}`,
    '--force-keyframes-at-cuts',
    '--newline',
    '--progress',
    '--progress-template', 'download:%(progress._percent_str)s',
    '--no-playlist',
    '-o', outputPath
  ]

  return new Promise((resolve, reject) => {
    const child = spawn(ytdlpPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let settled = false
    let lastProgress = -1
    let outputBuffer = ''
    const clipDuration = Math.max(0.01, endTime - startTime)

    const reportOutput = (chunk: Buffer | string) => {
      outputBuffer = `${outputBuffer}${String(chunk)}`.slice(-4096)
      const output = outputBuffer
      for (const match of output.matchAll(/(\d{1,3}(?:\.\d+)?)%/g)) {
        const rawPercent = Math.max(0, Math.min(100, Number(match[1])))
        const progress = Math.min(95, Math.round(rawPercent * 0.95))
        if (progress > lastProgress) {
          lastProgress = progress
          onProgress(progress)
        }
      }
      for (const match of output.matchAll(
        /time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g
      )) {
        const elapsed =
          Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
        const progress = Math.min(
          95,
          Math.round((elapsed / clipDuration) * 95)
        )
        if (progress > lastProgress) {
          lastProgress = progress
          onProgress(progress)
        }
      }
    }

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      console.error('yt-dlp error:', error)
      void fs
        .rm(outputPath, { force: true })
        .catch(() => undefined)
        .finally(() => reject(error))
    }

    onProgress(0)
    child.stdout.on('data', reportOutput)
    child.stderr.on('data', reportOutput)
    child.once('error', fail)
    child.once('close', (code) => {
      if (settled) return
      if (code !== 0) {
        fail(new Error(`yt-dlp exited with code ${code ?? 'unknown'}.`))
        return
      }
      void fs
        .stat(outputPath)
        .then((stats) => {
          if (!stats.isFile() || stats.size === 0) {
            throw new Error('yt-dlp completed without creating a usable clip.')
          }
          settled = true
          onProgress(100)
          resolve(pathToFileURL(outputPath).toString())
        })
        .catch((error) =>
          fail(error instanceof Error ? error : new Error(String(error)))
        )
    })
  })
}

async function resolveYtDlpPath() {
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(process.resourcesPath, 'bin', 'yt-dlp.exe'),
          path.join(app.getAppPath(), 'resources', 'bin', 'yt-dlp.exe'),
        ]
      : ['yt-dlp']
  for (const candidate of candidates) {
    if (candidate === 'yt-dlp') return candidate
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // Try the next development or packaged location.
    }
  }
  throw new Error(
    'The bundled yt-dlp executable is missing. Reinstall the app to restore YouTube trimming.'
  )
}

function ffmpegDirectory() {
  return compositorDirectory.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`
  )
}
