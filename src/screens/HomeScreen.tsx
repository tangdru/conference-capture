import { useEffect, useState } from 'react'
import type { Session } from '../types'
import { SessionCard } from '../components/SessionCard'
import { SwipeActions, DeleteIcon, ExportIcon } from '../components/SwipeActions'
import './HomeScreen.css'

interface HomeScreenProps {
  sessions: Session[]
  onOpenSession: (id: string) => void
  onNewSession: () => void
  onSignOut: () => void
  onExportSession: (id: string) => void
  onDeleteSession: (id: string) => void
  error: string | null
  onDismissError: () => void
}

export function HomeScreen({
  sessions,
  onOpenSession,
  onNewSession,
  onSignOut,
  onExportSession,
  onDeleteSession,
  error,
  onDismissError,
}: HomeScreenProps) {
  const [now, setNow] = useState(Date.now())
  const [revealedId, setRevealedId] = useState<string | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const active = sessions.find((s) => s.status === 'recording' || s.status === 'suspended')
  const others = sessions
    .filter((s) => s.id !== active?.id)
    .sort((a, b) => b.startedAt - a.startedAt)

  function renderCard(session: Session) {
    return (
      <SwipeActions
        key={session.id}
        id={session.id}
        revealedId={revealedId}
        onReveal={setRevealedId}
        actions={[
          { icon: <ExportIcon />, label: 'Export', onClick: () => onExportSession(session.id) },
          { icon: <DeleteIcon />, label: 'Delete', onClick: () => onDeleteSession(session.id) },
        ]}
      >
        <SessionCard session={session} now={now} onTap={() => onOpenSession(session.id)} />
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

      <div className="home-scroll">
        <div className="home-list">
          {active && renderCard(active)}

          {others.length === 0 && !active && (
            <p className="home-empty">
              No sessions yet. Tap "New Session" to start capturing your first talk.
            </p>
          )}

          {others.map(renderCard)}
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
