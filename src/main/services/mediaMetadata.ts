import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { dir as compositorDirectory } from '@remotion/compositor-win32-x64-msvc'

const execFileAsync = promisify(execFile)

export async function getMediaDuration(filePath: string): Promise<number | null> {
  try {
    const executable = path
      .join(compositorDirectory, 'ffprobe.exe')
      .replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
    const { stdout } = await execFileAsync(
      executable,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        '--',
        filePath,
      ],
      { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 }
    )
    const duration = Number.parseFloat(stdout.trim())
    return Number.isFinite(duration) && duration > 0 ? duration : null
  } catch (error) {
    console.warn(`Could not read media duration for ${filePath}`, error)
    return null
  }
}
