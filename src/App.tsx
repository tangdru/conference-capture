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
  const [homeError, setHomeError] = useState<string | null>(null)

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

  async function generateDeckForSession(id: string) {
    updateSessionLocally(id, (s) => ({ ...s, deckStatus: 'generating', deckError: null }))
    try {
      await db.generateDeck(id)
    } catch {
      // Fall through — the refetch below reads the authoritative state the
      // edge function itself recorded, whether this call failed or not.
    }
    try {
      const state = await db.fetchSessionDeckState(id)
      updateSessionLocally(id, (s) => ({ ...s, ...state }))
    } catch (err) {
      updateSessionLocally(id, (s) => ({
        ...s,
        deckStatus: 'error',
        deckError: err instanceof Error ? err.message : 'Failed to generate presentation',
      }))
    }
  }

  async function viewDeck(id: string) {
    const session = sessions?.find((s) => s.id === id)
    if (!session?.deckPath) return
    try {
      const url = await db.resolveDeckUrl(session.deckPath)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      setHomeError(err instanceof Error ? err.message : 'Failed to open presentation')
    }
  }

  async function downloadDeck(id: string) {
    const session = sessions?.find((s) => s.id === id)
    if (!session?.deckPath) return
    try {
      const url = await db.resolveDeckUrl(session.deckPath)
      const a = document.createElement('a')
      a.href = url
      a.download = `${session.title.replace(/[^\w\- ]+/g, '').trim() || 'presentation'}.html`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err) {
      setHomeError(err instanceof Error ? err.message : 'Failed to download presentation')
    }
  }

  async function deleteSession(id: string) {
    const session = sessions?.find((s) => s.id === id)
    if (!session) return
    setSessions((prev) => prev?.filter((s) => s.id !== id) ?? prev)
    try {
      await db.deleteSession(session)
    } catch (err) {
      setSessions((prev) => (prev ? [...prev, session] : prev))
      setHomeError(err instanceof Error ? err.message : 'Failed to delete session')
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
    return (
      <ReviewStub
        session={session}
        onBack={() => setRoute({ screen: 'home' })}
        onGenerateDeck={generateDeckForSession}
      />
    )
  }

  return (
    <HomeScreen
      sessions={sessions}
      onOpenSession={openSession}
      onNewSession={startNewSession}
      onSignOut={() => supabase.auth.signOut()}
      onGenerateDeck={generateDeckForSession}
      onViewDeck={viewDeck}
      onDownloadDeck={downloadDeck}
      onDeleteSession={deleteSession}
      error={homeError}
      onDismissError={() => setHomeError(null)}
    />
  )
}
