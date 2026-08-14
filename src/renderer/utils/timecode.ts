export type TimecodePart = 'hours' | 'minutes' | 'seconds'

export function splitTimecode(totalSeconds: number) {
  const safe = Math.max(0, Number.isFinite(totalSeconds) ? totalSeconds : 0)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = Number((safe - hours * 3600 - minutes * 60).toFixed(2))
  return { hours, minutes, seconds }
}

export function updateTimecodePart(
  totalSeconds: number,
  part: TimecodePart,
  rawValue: string
) {
  const current = splitTimecode(totalSeconds)
  const parsed = Math.max(0, Number(rawValue) || 0)
  if (part === 'hours') {
    return Math.floor(parsed) * 3600 + current.minutes * 60 + current.seconds
  }
  if (part === 'minutes') {
    return current.hours * 3600 + Math.floor(parsed) * 60 + current.seconds
  }
  return current.hours * 3600 + current.minutes * 60 + parsed
}

export function formatTimecode(totalSeconds: number) {
  const { hours, minutes, seconds } = splitTimecode(totalSeconds)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
    2,
    '0'
  )}:${String(Math.floor(seconds)).padStart(2, '0')}`
}
