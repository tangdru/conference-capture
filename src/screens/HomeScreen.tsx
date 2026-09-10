import { useEffect, useState } from 'react'
import type { Session } from '../types'
import { SessionCard } from '../components/SessionCard'
import './HomeScreen.css'

interface HomeScreenProps {
  sessions: Session[]
  onOpenSession: (id: string) => void
  onNewSession: () => void
}

export function HomeScreen({ sessions, onOpenSession, onNewSession }: HomeScreenProps) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const active = sessions.find((s) => s.status === 'recording' || s.status === 'suspended')
  const others = sessions
    .filter((s) => s.id !== active?.id)
    .sort((a, b) => b.startedAt - a.startedAt)

  return (
    <div className="home-screen">
      <header className="home-header">
        <h1 className="home-header__title">Conference Capture</h1>
        <button className="new-session-btn" onClick={onNewSession} aria-label="Start new session">
          + New Session
        </button>
      </header>

      <div className="home-list">
        {active && (
          <SessionCard session={active} now={now} onTap={() => onOpenSession(active.id)} />
        )}

        {others.length === 0 && !active && (
          <p className="home-empty">
            No sessions yet. Tap "New Session" to start capturing your first talk.
          </p>
        )}

        {others.map((s) => (
          <SessionCard key={s.id} session={s} now={now} onTap={() => onOpenSession(s.id)} />
        ))}
      </div>
    </div>
  )
}
