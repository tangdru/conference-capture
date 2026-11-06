import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { ActionSheet, ActionSheetButtonStyle } from '@capacitor/action-sheet'
import type { Session as AuthSession } from '@supabase/supabase-js'
import type { PhotoItem, Session } from './types'
import * as db from './db'
import { compactDeckPhotos, hasPhotoLinks, hasShortVersion, shortDeckHtml } from './deck'
import { supabase } from './supabaseClient'
import { AuthGate } from './auth/AuthGate'
import { HomeScreen } from './screens/HomeScreen'
import { CaptureScreen } from './screens/CaptureScreen'
import { DeckViewer } from './components/DeckViewer'
import { AskSheet, type AskTurn } from './components/AskSheet'
import { onPhotoUploaded, pendingPhotos, syncPhotoUploadAuth } from './photoUploads'
import { startOutbox } from './itemOutbox'

type Route = { screen: 'home' } | { screen: 'capture'; sessionId: string; focusItemId?: string }

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
  // Ask across all sessions. Held here, not in HomeScreen, so it's still
  // open with its answers on coming back from a session it cited.
  const [askAll, setAskAll] = useState<{ question: string; turns: AskTurn[] } | null>(null)

  useEffect(() => syncPhotoUploadAuth(), [])
  useEffect(() => startOutbox(), [])

  // A photo that finishes uploading in the background is now in Supabase
  // like any other.
  useEffect(
    () =>
      onPhotoUploaded((id) =>
        setSessions((prev) =>
          prev?.map((s) => ({
            ...s,
            items: s.items.map((i) => (i.id === id && i.type === 'photo' ? { ...i, uploading: false } : i)),
          })) ?? prev,
        ),
      ),
    [],
  )

  useEffect(() => {
    let cancelled = false
    async function load(attempt: number) {
      try {
        const loaded = await fetchSessionsWithPending()
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

  /** Sessions as stored, plus what's still on the phone waiting to be sent. */
  async function fetchSessionsWithPending(): Promise<Session[]> {
    const [loaded, photos, items] = await Promise.all([
      db.fetchSessions(userId),
      pendingPhotos().catch(() => new Map<string, PhotoItem[]>()),
      db.pendingItems(),
    ])
    return loaded.map((s) => {
      const ids = new Set(s.items.map((i) => i.id))
      const waiting = [...(photos.get(s.id) ?? []), ...(items.get(s.id) ?? [])].filter((p) => !ids.has(p.id))
      return waiting.length ? { ...s, items: [...s.items, ...waiting].sort((a, b) => a.timestamp - b.timestamp) } : s
    })
  }

  async function refreshSessions() {
    try {
      setSessions(await fetchSessionsWithPending())
    } catch (err) {
      setHomeError(err instanceof Error ? err.message : 'Failed to refresh')
    }
  }

  function updateSessionLocally(id: string, updater: (session: Session) => Session) {
    setSessions((prev) => (prev ? prev.map((s) => (s.id === id ? updater(s) : s)) : prev))
  }

  async function startNewSession() {
    const session = await db.createSession(userId)
    setSessions((prev) => (prev ? [session, ...prev] : [session]))
    setRoute({ screen: 'capture', sessionId: session.id })
  }

  function openSession(id: string, focusItemId?: string) {
    setRoute({ screen: 'capture', sessionId: id, focusItemId })
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

  /** The presentation's page, its photos shrunk -- saved back the first time
   * so later opens and shares download the small one. */
  async function loadDeckHtml(session: Session, deckPath: string): Promise<string> {
    const html = await db.fetchDeckHtml(deckPath)
    const compacted = await compactDeckPhotos(html)
    // Skip the save while a rebuild runs: it would overwrite the new page.
    if (hasPhotoLinks(html) || compacted.length < html.length * 0.8) {
      const { deckStatus } = await db.fetchSessionDeckState(session.id).catch(() => ({ deckStatus: null }))
      if (deckStatus === 'ready') void db.replaceDeckHtml(deckPath, compacted).catch(() => {})
    }
    return compacted
  }

  /** Short (TL;DR and chapter openings) or full -- asked only when the page
   * has a short version. Null if the question was dismissed. */
  async function chooseDeckLength(html: string): Promise<'short' | 'full' | null> {
    if (!hasShortVersion(html)) return 'full'
    if (!Capacitor.isNativePlatform()) {
      return window.confirm('Share the short version (TL;DR and chapter summaries)? Cancel shares the full presentation.')
        ? 'short'
        : 'full'
    }
    const { index } = await ActionSheet.showActions({
      title: 'Share presentation',
      options: [
        { title: 'Short version (TL;DR)' },
        { title: 'Full presentation' },
        { title: 'Cancel', style: ActionSheetButtonStyle.Cancel },
      ],
    })
    return index === 0 ? 'short' : index === 1 ? 'full' : null
  }

  async function viewDeck(id: string) {
    const session = sessions?.find((s) => s.id === id)
    if (!session?.deckPath) return
    try {
      // A new tab works in a browser, but the native app can't pass a blob:
      // URL to Safari -- show the page full-screen in-app there instead.
      if (Capacitor.isNativePlatform()) {
        setOpenDeck({ title: session.title, html: await loadDeckHtml(session, session.deckPath) })
        return
      }
      const url = await db.resolveDeckUrl(session.deckPath)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      setHomeError(err instanceof Error ? err.message : 'Failed to open presentation')
    }
  }

  async function shareDeck(id: string) {
    const session = sessions?.find((s) => s.id === id)
    if (!session?.deckPath) return
    try {
      const fullHtml = await loadDeckHtml(session, session.deckPath)
      const length = await chooseDeckLength(fullHtml)
      if (!length) return
      const html = length === 'short' ? shortDeckHtml(fullHtml) : fullHtml
      const baseName = session.title.replace(/[^\w\- ]+/g, '').trim() || 'presentation'
      const fileName = `${baseName}${length === 'short' ? ' - TLDR' : ''}.html`
      // The native app hands the page to the iOS share sheet as a file, from
      // which it can be saved to Files, AirDropped, mailed, etc.
      if (Capacitor.isNativePlatform()) {
        const { uri } = await Filesystem.writeFile({
          path: fileName,
          data: html,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        })
        await Share.share({ title: session.title, files: [uri] })
        return
      }
      const file = new File([html], fileName, { type: 'text/html' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: session.title, files: [file] })
        return
      }
      // No share sheet (most desktop browsers) -- download it instead.
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      // Closing the share sheet without picking anything isn't an error.
      const message = err instanceof Error ? err.message : ''
      if (/cancel|abort/i.test(message) || (err as { name?: string })?.name === 'AbortError') return
      setHomeError(message || 'Failed to share presentation')
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
        focusItemId={route.focusItemId}
        onUpdateLocal={(updater) => updateSessionLocally(session.id, updater)}
        onBack={() => setRoute({ screen: 'home' })}
      />
    )
  }

  /** A citation in a cross-session answer: open that session at the item
   * nearest the cited time. */
  function openCitation(sessionId: string, elapsedSeconds: number | null) {
    const session = sessions?.find((s) => s.id === sessionId)
    if (!session) return
    let itemId: string | undefined
    if (elapsedSeconds !== null && session.items.length > 0) {
      const at = session.startedAt + elapsedSeconds * 1000
      itemId = session.items.reduce((best, item) =>
        Math.abs(item.timestamp - at) < Math.abs(best.timestamp - at) ? item : best,
      ).id
    }
    openSession(sessionId, itemId)
  }

  if (openDeck) {
    return <DeckViewer title={openDeck.title} html={openDeck.html} onClose={() => setOpenDeck(null)} />
  }

  return (
    <>
    <HomeScreen
      sessions={sessions}
      onOpenSession={openSession}
      onNewSession={startNewSession}
      onSignOut={() => supabase.auth.signOut()}
      onGenerateDeck={generateDeckForSession}
      onViewDeck={viewDeck}
      onShareDeck={shareDeck}
      onDeleteSession={deleteSession}
      onRefresh={refreshSessions}
      error={homeError}
      onDismissError={() => setHomeError(null)}
      onAskAll={(question) => setAskAll({ question, turns: [] })}
    />
    {askAll && (
      <AskSheet
        kicker="Ask across"
        title="All sessions"
        hint="Answers come from every session’s transcript, notes and slides."
        ask={db.askAllSessions}
        turns={askAll.turns}
        onTurnsChange={(turns) => setAskAll((prev) => (prev ? { ...prev, turns } : prev))}
        initialQuestion={askAll.question}
        sessionTitles={new Map(sessions.map((s) => [s.id, s.title]))}
        onOpenCitation={openCitation}
        onClose={() => setAskAll(null)}
      />
    )}
    </>
  )
}
