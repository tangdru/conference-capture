import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AskThread } from '../db'
import { formatSessionSubtitle } from '../format'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import { searchSessions } from '../search'
import type { Session } from '../types'
import { AskConversation, type AskFn, type AskTurn } from './AskSheet'
import { SearchResults } from './SearchResults'
import { DeleteIcon, SwipeActions } from './SwipeActions'
import './AskSheet.css'
import './AskPanel.css'

/** Where the search button sits, so the panel can grow out of it. */
export interface AskOrigin {
  x: number
  y: number
  r: number
}

interface AskPanelProps {
  origin: AskOrigin
  sessions: Session[]
  /** null while loading. */
  threads: AskThread[] | null
  threadsError: string | null
  /** The thread on screen; one with no turns yet is a new question. */
  threadId: string
  onThreadIdChange: (id: string) => void
  onThreadTurns: (id: string, turns: AskTurn[]) => void
  onDeleteThread: (id: string) => void
  ask: AskFn
  onOpenSession: (sessionId: string, itemId?: string) => void
  onOpenCitation: (sessionId: string, elapsedSeconds: number | null) => void
  onClose: () => void
}

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

/** Search is asking Claude: the search button grows into this full screen,
 * with earlier conversations kept to pick back up. While typing, sessions
 * and conversations that mention the words show up too. */
export function AskPanel({
  origin,
  sessions,
  threads,
  threadsError,
  threadId,
  onThreadIdChange,
  onThreadTurns,
  onDeleteThread,
  ask,
  onOpenSession,
  onOpenCitation,
  onClose,
}: AskPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [closing, setClosing] = useState(false)
  const [draft, setDraft] = useState('')
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const keyboardHeight = useKeyboardHeight()

  const thread = threads?.find((t) => t.id === threadId)
  const turns = thread?.turns ?? []
  const inThread = turns.length > 0

  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const circle = (r: number) => `circle(${r}px at ${origin.x}px ${origin.y}px)`
  const fullRadius = () => Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight))

  // Grow out of the search button.
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el || reduceMotion()) return
    el.animate([{ clipPath: circle(origin.r) }, { clipPath: circle(fullRadius()) }], { duration: 460, easing: EASE })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The search button already raised the keyboard; hand it to the composer.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function close() {
    if (closing) return
    inputRef.current?.blur()
    const el = panelRef.current
    if (!el || reduceMotion()) return onClose()
    setClosing(true)
    const anim = el.animate([{ clipPath: circle(fullRadius()) }, { clipPath: circle(origin.r) }], {
      duration: 360,
      easing: EASE,
      fill: 'forwards',
    })
    anim.onfinish = onClose
  }

  function newQuestion() {
    onThreadIdChange(crypto.randomUUID())
    setDraft('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const query = draft.trim()
  const sessionResults = useMemo(() => (query ? searchSessions(sessions, query) : []), [sessions, query])
  const matchingThreads = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const list = threads?.filter((t) => t.turns.length > 0) ?? []
    if (words.length === 0) return list
    return list.filter((t) => {
      const text = t.turns.map((turn) => turn.content).join(' ').toLowerCase()
      return words.every((w) => text.includes(w))
    })
  }, [threads, query])

  const home = (
    <div className="ask-panel__home">
      {!query && <p className="ask-panel__hint">Ask anything about your sessions. Answers point to where they came from.</p>}

      {threadsError && <p className="ask-sheet__error">{threadsError}</p>}

      {matchingThreads.length > 0 && (
        <section className="ask-panel__section">
          <h3 className="ask-panel__heading">{query ? 'Your conversations' : 'Recent'}</h3>
          {matchingThreads.map((t) => {
            const questions = t.turns.filter((turn) => turn.role === 'user').length
            return (
              <SwipeActions
                key={t.id}
                id={t.id}
                revealedId={revealedId}
                onReveal={setRevealedId}
                actions={[
                  {
                    icon: <DeleteIcon />,
                    label: 'Delete conversation',
                    onClick: () => {
                      setRevealedId(null)
                      onDeleteThread(t.id)
                    },
                  },
                ]}
              >
                <button
                  className="ask-thread"
                  onClick={() => {
                    setDraft('')
                    onThreadIdChange(t.id)
                  }}
                >
                  <span className="ask-thread__title">{t.title}</span>
                  <span className="ask-thread__meta">
                    {formatSessionSubtitle(t.updatedAt)}
                    {questions > 1 && ` · ${questions} questions`}
                  </span>
                </button>
              </SwipeActions>
            )
          })}
        </section>
      )}

      {query && sessionResults.length > 0 && (
        <section className="ask-panel__section">
          <h3 className="ask-panel__heading">Sessions that mention it</h3>
          <SearchResults results={sessionResults} query={query} onOpen={onOpenSession} />
        </section>
      )}

      {threads === null && !threadsError && <p className="ask-panel__loading">Loading conversations…</p>}
    </div>
  )

  return (
    <div
      ref={panelRef}
      className={`ask-panel ask-sheet${keyboardHeight ? ' ask-sheet--keyboard' : ''}${closing ? ' ask-panel--closing' : ''}`}
      style={{ height: `calc(100dvh - ${keyboardHeight}px)` }}
      role="dialog"
      aria-label="Ask Claude"
    >
      <header className="ask-sheet__header ask-panel__header">
        {inThread ? (
          <button className="ask-panel__icon-btn" onClick={newQuestion} aria-label="All conversations">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <span className="ask-panel__icon-btn ask-panel__icon-btn--glyph" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
              <path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
        )}
        <div className="ask-sheet__heading">
          <p className="ask-sheet__kicker">{inThread ? 'Conversation' : 'Across all sessions'}</p>
          <h2 className="ask-sheet__title">{inThread ? thread!.title : 'Ask Claude'}</h2>
        </div>
        <button className="ask-panel__icon-btn" onClick={close} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <AskConversation
        key={threadId}
        ask={ask}
        turns={turns}
        onTurnsChange={(next) => onThreadTurns(threadId, next)}
        sessionTitles={new Map(sessions.map((s) => [s.id, s.title]))}
        onOpenCitation={onOpenCitation}
        onDraftChange={setDraft}
        inputRef={inputRef}
        placeholder="Ask or search your sessions"
        empty={home}
      />
    </div>
  )
}
