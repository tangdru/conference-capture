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

/** Recent chats shown before "Show more". */
const RECENT_SHOWN = 5

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
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [closing, setClosing] = useState(false)
  const [draft, setDraft] = useState('')
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const keyboardHeight = useKeyboardHeight()

  const thread = threads?.find((t) => t.id === threadId)
  const turns = thread?.turns ?? []
  const inThread = turns.length > 0

  const bloomRef = useRef<HTMLDivElement>(null)
  const [settled, setSettled] = useState(false)
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // How far the circle grows to cover the screen from the button.
  const fullScale = () =>
    Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y)) / origin.r

  // Grow out of the search button: a circle behind the content scales up
  // (not a clip-path on the panel -- on iOS that leaves the list inside
  // unable to scroll), then the panel takes over its background.
  useLayoutEffect(() => {
    const bloom = bloomRef.current
    if (!bloom || reduceMotion()) return setSettled(true)
    const anim = bloom.animate([{ transform: 'scale(1)' }, { transform: `scale(${fullScale()})` }], {
      duration: 460,
      easing: EASE,
      fill: 'forwards',
    })
    anim.onfinish = () => setSettled(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The search button already raised the keyboard; hand it to the composer.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function close() {
    if (closing) return
    inputRef.current?.blur()
    const bloom = bloomRef.current
    if (!bloom || reduceMotion()) return onClose()
    setClosing(true)
    setSettled(false)
    const anim = bloom.animate([{ transform: `scale(${fullScale()})` }, { transform: 'scale(1)', opacity: 0.6 }], {
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
  // Typing searches every chat; the resting list is just the latest few.
  const shownThreads = query || showAll ? matchingThreads : matchingThreads.slice(0, RECENT_SHOWN)
  const hiddenCount = matchingThreads.length - shownThreads.length

  const home = (
    <div className="ask-panel__home">
      {!query && threads?.length === 0 && (
        <p className="ask-panel__hint">Type to find it in your sessions, or send it to ask Claude.</p>
      )}

      {threadsError && <p className="ask-sheet__error">{threadsError}</p>}

      {matchingThreads.length > 0 && (
        <section className="ask-panel__section">
          <h3 className="ask-panel__heading">{query ? 'Your conversations' : 'Recent'}</h3>
          {shownThreads.map((t) => {
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
          {hiddenCount > 0 && (
            <button className="ask-panel__more" onClick={() => setShowAll(true)}>
              Show {hiddenCount} more
            </button>
          )}
          {showAll && !query && matchingThreads.length > RECENT_SHOWN && (
            <button className="ask-panel__more" onClick={() => setShowAll(false)}>
              Show less
            </button>
          )}
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
      className={`ask-panel ask-sheet${keyboardHeight ? ' ask-sheet--keyboard' : ''}${closing ? ' ask-panel--closing' : ''}${settled ? ' ask-panel--settled' : ''}`}
      style={{ height: `calc(100dvh - ${keyboardHeight}px)` }}
      role="dialog"
      aria-label="Search"
    >
      <div
        ref={bloomRef}
        className="ask-panel__bloom"
        style={{ left: origin.x - origin.r, top: origin.y - origin.r, width: origin.r * 2, height: origin.r * 2 }}
        aria-hidden="true"
      />
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
          {inThread && <h2 className="ask-sheet__title">{thread!.title}</h2>}
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
        placeholder="Search or ask"
        empty={home}
      />
    </div>
  )
}
