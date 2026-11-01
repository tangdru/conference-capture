import { useEffect, useRef, useState } from 'react'
import * as db from '../db'
import './AskSheet.css'

interface Turn {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'What were the main points?',
  'What did the speaker recommend?',
  'What should I follow up on?',
]

/** "Ask a session": questions answered from its transcript, notes and
 * slides. The conversation lasts while the sheet is open. */
export function AskSheet({ sessionId, title, onClose }: { sessionId: string; title: string; onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [turns.length, asking])

  async function ask(question: string) {
    const q = question.trim()
    if (!q || asking) return
    const history = turns
    setTurns([...history, { role: 'user', content: q }])
    setDraft('')
    setError(null)
    setAsking(true)
    try {
      const answer = await db.askSession(sessionId, q, history)
      setTurns((t) => [...t, { role: 'assistant', content: answer }])
    } catch (err) {
      // Take the question back so it can be sent again as it was.
      setTurns(history)
      setDraft(q)
      setError(err instanceof Error ? err.message : 'Couldn’t get an answer')
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="ask-sheet" role="dialog" aria-label={`Ask about ${title}`}>
      <header className="ask-sheet__header">
        <div className="ask-sheet__heading">
          <p className="ask-sheet__kicker">Ask about</p>
          <h2 className="ask-sheet__title">{title}</h2>
        </div>
        <button className="ask-sheet__done" onClick={onClose}>
          Done
        </button>
      </header>

      <div className="ask-sheet__scroll">
        {turns.length === 0 && !asking && (
          <div className="ask-sheet__empty">
            <p className="ask-sheet__hint">Answers come from this session’s transcript, notes and slides.</p>
            <div className="ask-sheet__suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="ask-sheet__suggestion" onClick={() => void ask(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i} className={`ask-turn ask-turn--${turn.role}`}>
            <p className="ask-turn__text">{turn.content}</p>
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
          void ask(draft)
        }}
      >
        <textarea
          ref={inputRef}
          className="ask-sheet__input"
          value={draft}
          rows={1}
          placeholder="Ask a question"
          enterKeyHint="send"
          onChange={(e) => {
            setDraft(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void ask(draft)
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
