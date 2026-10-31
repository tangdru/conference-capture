import { useEffect, useRef, useState } from 'react'
import type { Session } from '../types'
import { isSessionActive } from '../sessionActivity'
import { hasContentSinceDeck } from '../deck'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { SessionCard } from '../components/SessionCard'
import {
  SwipeActions,
  type SwipeAction,
  DeleteIcon,
  GenerateIcon,
  ViewIcon,
  ShareIcon,
} from '../components/SwipeActions'
import './HomeScreen.css'

interface HomeScreenProps {
  sessions: Session[]
  onOpenSession: (id: string) => void
  onNewSession: () => void
  onSignOut: () => void
  onGenerateDeck: (id: string) => void
  onViewDeck: (id: string) => void
  onShareDeck: (id: string) => void
  onDeleteSession: (id: string) => void
  /** Reloads the list -- run by pulling it down past the top. */
  onRefresh: () => Promise<void>
  error: string | null
  onDismissError: () => void
}

export function HomeScreen({
  sessions,
  onOpenSession,
  onNewSession,
  onSignOut,
  onGenerateDeck,
  onViewDeck,
  onShareDeck,
  onDeleteSession,
  onRefresh,
  error,
  onDismissError,
}: HomeScreenProps) {
  const [now, setNow] = useState(Date.now())
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { progress, refreshing } = usePullToRefresh(scrollRef, listRef, onRefresh)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // Every live session on top, then the past ones -- each group newest first.
  const newestFirst = [...sessions].sort((a, b) => b.startedAt - a.startedAt)
  const live = newestFirst.filter((s) => isSessionActive(s, now))
  const past = newestFirst.filter((s) => !isSessionActive(s, now))

  function deckActions(session: Session): SwipeAction[] {
    switch (session.deckStatus) {
      case 'ready':
        return [
          { icon: <ViewIcon />, label: 'View presentation', onClick: () => onViewDeck(session.id) },
          { icon: <ShareIcon />, label: 'Share presentation', onClick: () => onShareDeck(session.id) },
          // Regenerating only makes sense once there's something new to add.
          ...(hasContentSinceDeck(session)
            ? [{ icon: <GenerateIcon />, label: 'Regenerate presentation', onClick: () => onGenerateDeck(session.id) }]
            : []),
        ]
      case 'generating':
        return []
      default:
        return [{ icon: <GenerateIcon />, label: 'Generate presentation', onClick: () => onGenerateDeck(session.id) }]
    }
  }

  function renderCard(session: Session) {
    return (
      <SwipeActions
        key={session.id}
        id={session.id}
        revealedId={revealedId}
        onReveal={setRevealedId}
        // Close the row on any action so the card slides back into view and
        // its status line (e.g. "Building presentation…") is visible.
        actions={[
          ...deckActions(session),
          { icon: <DeleteIcon />, label: 'Delete', onClick: () => onDeleteSession(session.id) },
        ].map((action) => ({
          ...action,
          onClick: () => {
            setRevealedId(null)
            action.onClick()
          },
        }))}
      >
        <SessionCard
          session={session}
          now={now}
          onTap={() => onOpenSession(session.id)}
          onViewDeck={() => onViewDeck(session.id)}
          onGenerateDeck={() => onGenerateDeck(session.id)}
        />
      </SwipeActions>
    )
  }

  return (
    <div className="home-screen">
      <header className="home-header">
        <div className="home-header__row">
          <h1 className="home-header__title">Conference Capture</h1>
          <button className="home-header__sign-out" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <div className="home-error" role="alert">
          {error} <button onClick={onDismissError}>Dismiss</button>
        </div>
      )}

      <div className="home-scroll" ref={scrollRef}>
        <div className="home-list" ref={listRef}>
          {/* Sits just above the list and is revealed as it's pulled down. */}
          <div
            className={`home-refresh${progress >= 1 ? ' home-refresh--armed' : ''}${refreshing ? ' home-refresh--spinning' : ''}`}
            style={{ opacity: refreshing ? 1 : Math.min(progress, 1) }}
            role={refreshing ? 'status' : undefined}
            aria-label={refreshing ? 'Refreshing' : undefined}
          >
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              aria-hidden="true"
              style={refreshing ? undefined : { transform: `rotate(${Math.min(progress, 1.2) * 300}deg)` }}
            >
              <path
                d="M20 12a8 8 0 1 1-2.34-5.66"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path d="M20 4v4.5h-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          {live.map(renderCard)}

          {sessions.length === 0 && (
            <p className="home-empty">
              No sessions yet. Tap "New Session" to start capturing your first talk.
            </p>
          )}

          {past.map(renderCard)}
        </div>
      </div>

      <div className="home-footer">
        <button className="new-session-btn" onClick={onNewSession} aria-label="Start new session">
          + New Session
        </button>
      </div>
    </div>
  )
}
