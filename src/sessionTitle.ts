import type { Session } from './types'

// A new session is called "Session 2 : 11/11" -- numbered within its day,
// then the month and day -- until Sparkle (or the user) names it. Keep the
// pattern in step with DEFAULT_TITLE in supabase/functions/generate-deck,
// which renames a session still called this.
const DEFAULT = /^Session(?: (\d+) : \d{2}\/\d{2})?$/

function sameDay(a: number, b: number): boolean {
  const x = new Date(a)
  const y = new Date(b)
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
}

/** The next new session's title: one more than today's sessions so far. */
export function nextSessionTitle(sessions: Session[], now = Date.now()): string {
  const today = sessions.filter((s) => sameDay(s.startedAt, now))
  const numbered = today.map((s) => Number(DEFAULT.exec(s.title.trim())?.[1] ?? 0))
  const n = Math.max(today.length, ...numbered, 0) + 1
  const d = new Date(now)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `Session ${n} : ${mm}/${dd}`
}
