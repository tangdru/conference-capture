import { useEffect, useRef, useState, type ReactNode } from 'react'
import './AskSheet.css'

export interface AskTurn {
  role: 'user' | 'assistant'
  content: string
  /** Cross-session answers: citation label (S2) -> session id. */
  sessions?: Record<string, string>
}

export type AskFn = (
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[],
) => Promise<{ answer: string; sessions?: Record<string, string> }>

interface AskSheetProps {
  kicker: string
  title: string
  hint: string
  suggestions?: string[]
  ask: AskFn
  /** Held by the parent so the conversation outlasts the sheet (e.g. while
   * a cited session is open). */
  turns: AskTurn[]
  onTurnsChange: (turns: AskTurn[]) => void
  /** Asked as soon as the sheet opens, if nothing has been asked yet. */
  initialQuestion?: string
  /** For cross-session answers: names the cited sessions, and opens one. */
  sessionTitles?: Map<string, string>
  onOpenCitation?: (sessionId: string, elapsedSeconds: number | null) => void
  onClose: () => void
}

const CITATION = /\[(S\d+)(?:\s+(\d{1,3}(?::\d{2}){1,2}))?\]/g

/** Questions answered by Claude from what was captured -- in one session,
 * or across all of them. */
export function AskSheet({
  kicker,
  title,
  hint,
  suggestions = [],
  ask,
  turns,
  onTurnsChange,
  initialQuestion,
  sessionTitles,
  onOpenCitation,
  onClose,
}: AskSheetProps) {
  const [draft, setDraft] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const askedInitial = useRef(false)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [turns.length, asking])

  async function submit(question: string) {
    const q = question.trim()
    if (!q || asking) return
    const history = turns
    onTurnsChange([...history, { role: 'user', content: q }])
    setDraft('')
    setError(null)
    setAsking(true)
    try {
      const { answer, sessions } = await ask(
        q,
        history.map(({ role, content }) => ({ role, content })),
      )
      onTurnsChange([...history, { role: 'user', content: q }, { role: 'assistant', content: answer, sessions }])
    } catch (err) {
      // Take the question back so it can be sent again as it was.
      onTurnsChange(history)
      setDraft(q)
      setError(err instanceof Error ? err.message : 'Couldn’t get an answer')
    } finally {
      setAsking(false)
    }
  }

  // A ref, not just `turns`, so StrictMode's double effect doesn't ask twice.
  useEffect(() => {
    if (initialQuestion && turns.length === 0 && !askedInitial.current) {
      askedInitial.current = true
      void submit(initialQuestion)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** An answer's text with its [S2 12:30] citations as tappable chips. */
  function renderAnswer(turn: AskTurn): ReactNode {
    if (!turn.sessions || !onOpenCitation) return turn.content
    const parts: ReactNode[] = []
    let last = 0
    for (const match of turn.content.matchAll(CITATION)) {
      const sessionId = turn.sessions[match[1]]
      if (!sessionId) continue
      parts.push(turn.content.slice(last, match.index))
      const time = match[2]
      const name = sessionTitles?.get(sessionId) ?? 'Session'
      parts.push(
        <button
          key={match.index}
          className="ask-cite"
          onClick={() => onOpenCitation(sessionId, time ? toSeconds(time) : null)}
          aria-label={`Open ${name}${time ? ` at ${time}` : ''}`}
        >
          <span className="ask-cite__name">{name}</span>
          {time && <span className="ask-cite__time">{time}</span>}
        </button>,
      )
      last = match.index + match[0].length
    }
    parts.push(turn.content.slice(last))
    return parts
  }

  return (
    <div className="ask-sheet" role="dialog" aria-label={`${kicker} ${title}`}>
      <header className="ask-sheet__header">
        <div className="ask-sheet__heading">
          <p className="ask-sheet__kicker">{kicker}</p>
          <h2 className="ask-sheet__title">{title}</h2>
        </div>
        <button className="ask-sheet__done" onClick={onClose}>
          Done
        </button>
      </header>

      <div className="ask-sheet__scroll">
        {turns.length === 0 && !asking && (
          <div className="ask-sheet__empty">
            <p className="ask-sheet__hint">{hint}</p>
            <div className="ask-sheet__suggestions">
              {suggestions.map((s) => (
                <button key={s} className="ask-sheet__suggestion" onClick={() => void submit(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i} className={`ask-turn ask-turn--${turn.role}`}>
            <p className="ask-turn__text">{turn.role === 'assistant' ? renderAnswer(turn) : turn.content}</p>
          </div>
        ))}

        {asking && (
          <div className="ask-turn ask-turn--assistant" role="status" aria-label="Thinking">
            <p className="ask-turn__text ask-turn__text--thinking">
              <span className="live-ellipsis" aria-hidden="true">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </p>
          </div>
        )}

        {error && (
          <p className="ask-sheet__error" role="alert">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="ask-sheet__composer"
        onSubmit={(e) => {
          e.preventDefault()
          void submit(draft)
        }}
      >
        <textarea
          className="ask-sheet__input"
          value={draft}
          rows={1}
          placeholder={turns.length > 0 ? 'Ask a follow-up' : 'Ask a question'}
          enterKeyHint="send"
          onChange={(e) => {
            setDraft(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit(draft)
            }
          }}
        />
        <button className="ask-sheet__send" type="submit" disabled={!draft.trim() || asking} aria-label="Send">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  )
}

function toSeconds(time: string): number {
  return time.split(':').reduce((total, part) => total * 60 + Number(part), 0)
}
