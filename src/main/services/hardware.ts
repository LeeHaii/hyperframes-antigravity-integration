import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { EncoderCapabilities } from '../../types/editor'
import { getRemotionBinariesDirectory } from './remotionBinaries'

let cachedCapabilities: EncoderCapabilities | null = null

const NVENC_PROBE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

export function getEncoderCapabilities(): EncoderCapabilities {
  if (cachedCapabilities) return cachedCapabilities

  let gpuNames: string[] = []
  if (process.platform === 'win32') {
    try {
      const output = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) | ConvertTo-Json -Compress',
        ],
        { encoding: 'utf8', timeout: 10000, windowsHide: true }
      ).trim()
      if (output) {
        const parsed = JSON.parse(output) as string | string[]
        gpuNames = Array.isArray(parsed) ? parsed : [parsed]
      }
    } catch (error) {
      console.warn('Could not inspect video controllers.', error)
    }
  }

  if (gpuNames.length === 0) {
    try {
      gpuNames = execFileSync(
        'nvidia-smi',
        ['--query-gpu=name', '--format=csv,noheader'],
        { encoding: 'utf8', timeout: 10000, windowsHide: true }
      )
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean)
    } catch {
      // nvidia-smi is optional. The actual encoder probe below is authoritative.
    }
  }

  const nvencProbe = probeNvenc()
  cachedCapabilities = {
    cpu: true,
    nvenc: nvencProbe.available,
    nvencReason: nvencProbe.reason,
    nvencEncoder: nvencProbe.available ? 'h264_nvenc' : undefined,
    amdGpuDetected: gpuNames.some((name) => /\b(amd|radeon)\b/i.test(name)),
    gpuNames,
  }
  return cachedCapabilities
}

function probeNvenc(): { available: boolean; reason?: string } {
  if (process.platform !== 'win32' && process.platform !== 'linux') {
    return { available: false, reason: 'NVENC is only supported on Windows and Linux.' }
  }

  const ffmpegPath = path.join(
    getRemotionBinariesDirectory(),
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  )
  if (!existsSync(ffmpegPath)) {
    return {
      available: false,
      reason: 'The bundled NVENC-enabled FFmpeg binary could not be found.',
    }
  }

  const result = spawnSync(
    ffmpegPath,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'image2pipe',
      '-vcodec',
      'png',
      '-framerate',
      '30',
      '-i',
      'pipe:0',
      '-frames:v',
      '1',
      '-vf',
      'scale=256:256',
      '-c:v',
      'h264_nvenc',
      '-pix_fmt',
      'yuv420p',
      '-f',
      'null',
      '-',
    ],
    {
      input: NVENC_PROBE_PNG,
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    }
  )

  if (result.status === 0) return { available: true }

  const details = [result.error?.message, result.stderr]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return {
    available: false,
    reason: details
      ? `NVENC initialization failed: ${details.slice(0, 360)}`
      : 'NVENC initialization failed. Update the NVIDIA driver or use CPU encoding.',
  }
}
