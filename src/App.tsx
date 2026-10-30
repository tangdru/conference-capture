import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import type { Session as AuthSession } from '@supabase/supabase-js'
import type { Session } from './types'
import * as db from './db'
import { supabase } from './supabaseClient'
import { AuthGate } from './auth/AuthGate'
import { HomeScreen } from './screens/HomeScreen'
import { CaptureScreen } from './screens/CaptureScreen'
import { DeckViewer } from './components/DeckViewer'

type Route = { screen: 'home' } | { screen: 'capture'; sessionId: string }

export default function App() {
  return <AuthGate>{(authSession) => <AuthedApp authSession={authSession} />}</AuthGate>
}

function AuthedApp({ authSession }: { authSession: AuthSession }) {
  const userId = authSession.user.id
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [route, setRoute] = useState<Route>({ screen: 'home' })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [homeError, setHomeError] = useState<string | null>(null)
  const [openDeck, setOpenDeck] = useState<{ title: string; html: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load(attempt: number) {
      try {
        const loaded = await db.fetchSessions(userId)
        if (!cancelled) setSessions(loaded)
      } catch (err) {
        if (cancelled) return
        const message: string = (err as { message?: string })?.message ?? 'Failed to load sessions'
        // A token minted moments ago (e.g. the native anonymous sign-in) can
        // be rejected as "issued at future" when Supabase's auth and database
        // clocks disagree by a second or two -- it's valid once that passes.
        if (/issued at future/i.test(message) && attempt < 5) {
          window.setTimeout(() => void load(attempt + 1), 1500)
          return
        }
        setLoadError(message)
      }
    }
    void load(1)
    return () => {
      cancelled = true
    }
  }, [userId])

  // Generation runs server-side for minutes, and the request that started it
  // doesn't survive the phone switching apps -- so while any deck is
  // building, read its state from the database instead of waiting on that
  // request: every few seconds, and right away when the app comes back.
  const generatingIds = sessions?.filter((s) => s.deckStatus === 'generating').map((s) => s.id).join(',') ?? ''
  useEffect(() => {
    if (!generatingIds) return
    const ids = generatingIds.split(',')
    function refresh() {
      ids.forEach((id) => {
        db.fetchSessionDeckState(id)
          .then((state) => updateSessionLocally(id, (s) => ({ ...s, ...state })))
          .catch(() => {})
      })
    }
    function onVisible() {
      if (document.visibilityState === 'visible') refresh()
    }
    // No immediate read: right after a tap the server may not have recorded
    // 'generating' yet, and the previous run's 'ready'/'error' would flip the
    // card back. It writes that within a second, well before the first poll.
    const interval = window.setInterval(refresh, 5000)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [generatingIds])

  function updateSessionLocally(id: string, updater: (session: Session) => Session) {
    setSessions((prev) => (prev ? prev.map((s) => (s.id === id ? updater(s) : s)) : prev))
  }

  async function startNewSession() {
    const session = await db.createSession(userId)
    setSessions((prev) => (prev ? [session, ...prev] : [session]))
    setRoute({ screen: 'capture', sessionId: session.id })
  }

  function openSession(id: string) {
    setRoute({ screen: 'capture', sessionId: id })
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
      // A new tab works in a browser, but the native app can't pass a blob:
      // URL to Safari -- show the page full-screen in-app there instead.
      if (Capacitor.isNativePlatform()) {
        setOpenDeck({ title: session.title, html: await db.fetchDeckHtml(session.deckPath) })
        return
      }
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
    // Deleting removes the notes, photos and transcript for good -- confirm
    // first. (The native app shows this as a standard iOS alert.)
    if (!window.confirm(`Delete "${session.title}"? Its notes, photos and transcript will be permanently removed.`)) return
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
        onBack={() => setRoute({ screen: 'home' })}
      />
    )
  }

  if (openDeck) {
    return <DeckViewer title={openDeck.title} html={openDeck.html} onClose={() => setOpenDeck(null)} />
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
