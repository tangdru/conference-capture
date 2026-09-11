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
