import type { SessionResult } from '../search'
import { formatClock, formatSessionSubtitle } from '../format'
import { SparkleIcon } from './InlineIcons'
import './SearchResults.css'

const HITS_SHOWN = 3

/** Search across sessions: each matching session, with where in it the
 * words came up. Tapping a hit opens the session at that point. */
export function SearchResults({
  results,
  query,
  onOpen,
  onAsk,
}: {
  results: SessionResult[]
  query: string
  onOpen: (sessionId: string, itemId?: string) => void
  /** Hands the search text to Claude as a question across all sessions. */
  onAsk?: () => void
}) {
  return (
    <div className="search-results">
      {/* First, not after the matches, so it's in reach however many there
          are -- and it's what answers a question rather than a keyword. */}
      {onAsk && <button className="search-ask" onClick={onAsk}>
        <SparkleIcon />
        <span className="search-ask__body">
          <span className="search-ask__label">Ask Claude</span>
          <span className="search-ask__query">“{query}”</span>
        </span>
        <span className="search-ask__hint">across all sessions</span>
      </button>}

      {onAsk && results.length === 0 && <p className="search-empty">No sessions mention those words.</p>}

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
