// Sessions grouped under the day they happened -- a conference is a run of
// days, each with a stack of talks.

export interface DayGroup<T> {
  /** Local date, YYYY-MM-DD: stable across renders and app opens. */
  key: string
  /** "Today", "Yesterday", "Sun, Nov 8", or with the year when it isn't this year. */
  label: string
  items: T[]
}

function dayKey(time: number): string {
  const d = new Date(time)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dayLabel(time: number, now = Date.now()): string {
  const key = dayKey(time)
  if (key === dayKey(now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (key === dayKey(yesterday.getTime())) return 'Yesterday'
  const d = new Date(time)
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}),
  })
}

/** Items (already in display order) in runs by day, in that same order. */
export function groupByDay<T>(items: T[], timeOf: (item: T) => number, now = Date.now()): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const item of items) {
    const time = timeOf(item)
    const key = dayKey(time)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(item)
    else groups.push({ key, label: dayLabel(time, now), items: [item] })
  }
  return groups
}
