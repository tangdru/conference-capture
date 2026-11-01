import type { SessionResult } from '../search'
import { formatClock, formatSessionSubtitle } from '../format'
import './SearchResults.css'

const HITS_SHOWN = 3

/** Search across sessions: each matching session, with where in it the
 * words came up. Tapping a hit opens the session at that point. */
export function SearchResults({
  results,
  onOpen,
}: {
  results: SessionResult[]
  onOpen: (sessionId: string, itemId?: string) => void
}) {
  if (results.length === 0) {
    return <p className="search-empty">No sessions mention that.</p>
  }

  return (
    <div className="search-results">
      {results.map(({ session, hits }) => (
        <section key={session.id} className="search-result">
          <button className="search-result__session" onClick={() => onOpen(session.id)}>
            <span className="search-result__title">{session.title}</span>
            <span className="search-result__date">{formatSessionSubtitle(session.startedAt)}</span>
          </button>
          {hits.slice(0, HITS_SHOWN).map((hit) => (
            <button key={hit.itemId} className="search-hit" onClick={() => onOpen(session.id, hit.itemId)}>
              <span className="search-hit__meta">
                {hit.kind}
                {hit.kind !== 'Summary' && <span className="mono-timestamp"> {formatClock(hit.timestamp)}</span>}
              </span>
              <span className="search-hit__text">
                {hit.parts.map((part, i) => (part.match ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}
              </span>
            </button>
          ))}
          {hits.length > HITS_SHOWN && (
            <button className="search-result__more" onClick={() => onOpen(session.id)}>
              {hits.length - HITS_SHOWN} more in this session
            </button>
          )}
        </section>
      ))}
    </div>
  )
}
