import { useEffect, useState } from 'react'
import type { Session } from './types'
import { loadSessions, saveSessions, makeId } from './storage'
import { HomeScreen } from './screens/HomeScreen'
import { CaptureScreen } from './screens/CaptureScreen'
import { ReviewStub } from './screens/ReviewStub'

type Route = { screen: 'home' } | { screen: 'capture' | 'review'; sessionId: string }

export default function App() {
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions())
  const [route, setRoute] = useState<Route>({ screen: 'home' })

  useEffect(() => {
    saveSessions(sessions)
  }, [sessions])

  function updateSession(id: string, updater: (session: Session) => Session) {
    setSessions((prev) => prev.map((s) => (s.id === id ? updater(s) : s)))
  }

  function startNewSession() {
    const session: Session = {
      id: makeId(),
      title: 'Session',
      status: 'recording',
      startedAt: Date.now(),
      accumulatedMs: 0,
      liveSpanStartedAt: Date.now(),
      items: [],
    }
    setSessions((prev) => [...prev, session])
    setRoute({ screen: 'capture', sessionId: session.id })
  }

  function openSession(id: string) {
    const session = sessions.find((s) => s.id === id)
    if (!session) return
    if (session.status === 'recording' || session.status === 'suspended') {
      setRoute({ screen: 'capture', sessionId: id })
    } else {
      setRoute({ screen: 'review', sessionId: id })
    }
  }

  if (route.screen === 'capture') {
    const session = sessions.find((s) => s.id === route.sessionId)
    if (!session) {
      setRoute({ screen: 'home' })
      return null
    }
    return (
      <CaptureScreen
        session={session}
        onUpdate={(updater) => updateSession(session.id, updater)}
        onEnded={() => setRoute({ screen: 'home' })}
        onBack={() => setRoute({ screen: 'home' })}
      />
    )
  }

  if (route.screen === 'review') {
    const session = sessions.find((s) => s.id === route.sessionId)
    if (!session) {
      setRoute({ screen: 'home' })
      return null
    }
    return <ReviewStub session={session} onBack={() => setRoute({ screen: 'home' })} />
  }

  return (
    <HomeScreen sessions={sessions} onOpenSession={openSession} onNewSession={startNewSession} />
  )
}
