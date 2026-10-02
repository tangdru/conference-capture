import { useEffect, useState } from 'react'
import type { Session as AuthSession } from '@supabase/supabase-js'
import type { Session } from './types'
import * as db from './db'
import { supabase } from './supabaseClient'
import { AuthGate } from './auth/AuthGate'
import { HomeScreen } from './screens/HomeScreen'
import { CaptureScreen } from './screens/CaptureScreen'
import { ReviewStub } from './screens/ReviewStub'

type Route = { screen: 'home' } | { screen: 'capture' | 'review'; sessionId: string }

export default function App() {
  return <AuthGate>{(authSession) => <AuthedApp authSession={authSession} />}</AuthGate>
}

function AuthedApp({ authSession }: { authSession: AuthSession }) {
  const userId = authSession.user.id
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [route, setRoute] = useState<Route>({ screen: 'home' })
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    db.fetchSessions(userId)
      .then(setSessions)
      .catch((err) => setLoadError(err.message ?? 'Failed to load sessions'))
  }, [userId])

  function updateSessionLocally(id: string, updater: (session: Session) => Session) {
    setSessions((prev) => (prev ? prev.map((s) => (s.id === id ? updater(s) : s)) : prev))
  }

  async function startNewSession() {
    const session = await db.createSession(userId)
    setSessions((prev) => (prev ? [session, ...prev] : [session]))
    setRoute({ screen: 'capture', sessionId: session.id })
  }

  function openSession(id: string) {
    const session = sessions?.find((s) => s.id === id)
    if (!session) return
    if (session.status === 'recording' || session.status === 'suspended') {
      setRoute({ screen: 'capture', sessionId: id })
    } else {
      setRoute({ screen: 'review', sessionId: id })
    }
  }

  if (sessions === null) {
    return loadError ? (
      <div className="load-error">Couldn't load your sessions: {loadError}</div>
    ) : (
      <div className="auth-loading" />
    )
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
        userId={userId}
        onUpdateLocal={(updater) => updateSessionLocally(session.id, updater)}
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
    <HomeScreen
      sessions={sessions}
      onOpenSession={openSession}
      onNewSession={startNewSession}
      onSignOut={() => supabase.auth.signOut()}
    />
  )
}
