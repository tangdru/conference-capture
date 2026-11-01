import type { Session, TimelineItemData } from './types'

export interface SearchHit {
  itemId: string
  kind: 'Note' | 'Transcript' | 'Slide' | 'Summary'
  timestamp: number
  /** The snippet in pieces, `match` marking the searched-for words. */
  parts: { text: string; match: boolean }[]
}

export interface SessionResult {
  session: Session
  titleMatch: boolean
  hits: SearchHit[]
}

const SNIPPET_RADIUS = 60

/** The searchable text of an item, and what to call it. */
function searchable(item: TimelineItemData): { kind: SearchHit['kind']; text: string } | null {
  switch (item.type) {
    case 'note':
      return { kind: 'Note', text: item.text }
    case 'transcript':
      return { kind: 'Transcript', text: item.text }
    case 'photo': {
      const text = item.slideText?.replace(/\s*\n\s*/g, ' · ') || (item.caption !== 'Untitled photo' ? item.caption : '')
      return text ? { kind: 'Slide', text } : null
    }
    case 'enrichment':
      return item.subtype === 'summary' ? { kind: 'Summary', text: item.text } : null
    default:
      return null
  }
}

function terms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

/** Every session whose title or content has all the words searched for,
 * most matches first, then newest. */
export function searchSessions(sessions: Session[], query: string): SessionResult[] {
  const words = terms(query)
  if (words.length === 0) return []
  const has = (text: string) => {
    const lower = text.toLowerCase()
    return words.every((w) => lower.includes(w))
  }

  const results: SessionResult[] = []
  for (const session of sessions) {
    const hits: SearchHit[] = []
    for (const item of session.items) {
      const found = searchable(item)
      if (found && has(found.text)) {
        hits.push({ itemId: item.id, kind: found.kind, timestamp: item.timestamp, parts: snippet(found.text, words) })
      }
    }
    const titleMatch = has(session.title)
    if (titleMatch || hits.length > 0) results.push({ session, titleMatch, hits })
  }
  return results.sort(
    (a, b) =>
      Number(b.titleMatch) - Number(a.titleMatch) ||
      b.hits.length - a.hits.length ||
      b.session.startedAt - a.session.startedAt,
  )
}

/** A window of the text around the first match, split into matched and
 * unmatched pieces for highlighting. */
function snippet(text: string, words: string[]): SearchHit['parts'] {
  const flat = text.replace(/\s+/g, ' ').trim()
  const lower = flat.toLowerCase()
  const first = Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0))
  let start = Math.max(0, first - SNIPPET_RADIUS)
  let end = Math.min(flat.length, first + SNIPPET_RADIUS * 2)
  // Start and end on word boundaries.
  if (start > 0) start = flat.indexOf(' ', start) + 1 || start
  if (end < flat.length) end = flat.lastIndexOf(' ', end) > first ? flat.lastIndexOf(' ', end) : end
  const window = flat.slice(start, end)

  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const parts = window
    .split(pattern)
    .filter(Boolean)
    .map((piece) => ({ text: piece, match: words.includes(piece.toLowerCase()) }))
  if (start > 0) parts.unshift({ text: '…', match: false })
  if (end < flat.length) parts.push({ text: '…', match: false })
  return parts
}
