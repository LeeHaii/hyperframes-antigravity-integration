import { dir as bundledBinariesDirectory } from '@remotion/compositor-win32-x64-msvc'
import path from 'node:path'

export function getRemotionBinariesDirectory() {
  return bundledBinariesDirectory.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`
  )
}
