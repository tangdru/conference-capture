export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

export function formatClock(timestamp: number): string {
  const d = new Date(timestamp)
  const hours = d.getHours().toString().padStart(2, '0')
  const minutes = d.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

export function formatSessionSubtitle(startedAt: number): string {
  const d = new Date(startedAt)
  const time = formatClock(startedAt)
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${time} · ${date}`
}

/** Compact duration for display next to a date, e.g. "47m" or "1h 12m". */
export function formatDurationCompact(ms: number): string {
  const totalMinutes = Math.round(ms / 60000)
  if (totalMinutes < 1) return '<1m'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

/** m:ss label for a short video clip, e.g. "0:24". */
export function formatClipDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** Shorter running time for tight spots: 7:12, or 1:07:12 past an hour. */
export function formatShortElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/** A session's recorded length for a card: "42m", "1h 05m", or "<1m". */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return '<1m'
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${(minutes % 60).toString().padStart(2, '0')}m` : `${minutes}m`
}
