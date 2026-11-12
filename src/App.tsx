import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { ActionSheet, ActionSheetButtonStyle } from '@capacitor/action-sheet'
import type { Session as AuthSession } from '@supabase/supabase-js'
import type { PhotoItem, Session, TimelineItemData } from './types'
import * as db from './db'
import { clearCachedSessions, readCachedSessions, saveCachedSessions } from './sessionCache'
import { cachedDeckKeys, clearCachedDecks, deckKey, readCachedDeck, saveCachedDeck } from './deckCache'
import { cleanDeckHtml, compactDeckPhotos, viewingHtml, hasPhotoLinks, hasShortVersion, shortDeckHtml, withoutClips } from './deck'
import { AuthGate, signOut } from './auth/AuthGate'
import { AddEmailSheet } from './auth/AddEmailSheet'
import { HomeScreen } from './screens/HomeScreen'
import { CaptureScreen } from './screens/CaptureScreen'
import { DeckViewer } from './components/DeckViewer'
import { AskSheet, type AskTurn } from './components/AskSheet'
import { AppMenu } from './components/AppMenu'
import { PresentationOptionsSheet } from './components/PresentationOptionsSheet'
import { SessionOptionsSheet } from './components/SessionOptionsSheet'
import { DeleteAccountSheet } from './components/DeleteAccountSheet'
import { shouldAutoStartHomeTour, startHomeTour } from './tour'
import { onPhotoUploaded, pendingPhotos, syncPhotoUploadAuth } from './photoUploads'
import { onOutboxProblem, startOutbox } from './itemOutbox'
import { startDeckUploads, uploadDeckLater } from './deckUploads'
import { startClipUploads } from './audioClips'
import { nextSessionTitle } from './sessionTitle'
import { listSavedShares, lookupShared, openSavedShare, removeSavedShare, saveShare, prepareShareLink, publishShare, stopSharing, tokenFromLink, sharedWithClips, noteSharedWithClips, type SavedShare } from './sharing'
import { getSessionOptions } from './sessionOptions'
import { App as CapApp } from '@capacitor/app'
import { MESSAGES, OFFLINE_MESSAGE, errorMessage } from './networkError'

/** How many ready presentations to keep on the phone ahead of being opened. */
const PREFETCH_DECKS = 12

type Route = { screen: 'home' } | { screen: 'capture'; sessionId: string; focusItemId?: string }

export default function App() {
  return <AuthGate>{(authSession) => <AuthedApp authSession={authSession} />}</AuthGate>
}

function AuthedApp({ authSession }: { authSession: AuthSession }) {
  const userId = authSession.user.id
  const [addingEmail, setAddingEmail] = useState(false)
  const [menu, setMenu] = useState<'menu' | 'session' | 'presentation' | 'delete-account' | null>(null)
  // Coming back to the menu from a screen it opened: no opening animation.
  const [menuReturning, setMenuReturning] = useState(false)
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
  useEffect(() => onOutboxProblem(setHomeError), [])
  useEffect(() => startDeckUploads(), [])
  // Clip uploads left from before (no signal, app closed) carry on; each
  // one's entry learns where its cut went.
  useEffect(
    () =>
      startClipUploads((sessionId, itemId, path) =>
        setSessions((prev) =>
          prev?.map((s) =>
            s.id === sessionId
              ? { ...s, items: s.items.map((i) => (i.id === itemId && i.type === 'audio' ? { ...i, audioPath: path } : i)) }
              : s,
          ) ?? prev,
        ),
      ),
    [],
  )

  // Presentations others shared that were added to this account's sessions.
  const [savedShares, setSavedShares] = useState<SavedShare[]>([])
  const reloadSavedShares = useCallback(
    () => listSavedShares().then(setSavedShares).catch(() => {}),
    [],
  )
  useEffect(() => {
    void reloadSavedShares()
  }, [reloadSavedShares, userId])

  // A shared page's "Open in app" (conferencecapture://shared/<token>) adds
  // it to the sessions and opens it.
  const addSharedRef = useRef<(token: string) => void>(() => {})
  addSharedRef.current = (token: string) => {
    void (async () => {
      try {
        // A link that's no longer shared adds nothing.
        if (!(await lookupShared([token])).has(token)) {
          setHomeError(MESSAGES.notShared)
          return
        }
        await saveShare(userId, token)
        const list = await listSavedShares()
        setSavedShares(list)
        const share = list.find((s) => s.token === token)
        if (share) await openShared(share)
      } catch (err) {
        setHomeError(errorMessage(err))
      }
    })()
  }
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const onUrl = (url: string | undefined) => {
      const token = url ? tokenFromLink(url) : null
      if (token) addSharedRef.current(token)
    }
    void CapApp.getLaunchUrl().then((launch) => onUrl(launch?.url)).catch(() => {})
    const listener = CapApp.addListener('appUrlOpen', (event) => onUrl(event.url))
    return () => {
      void listener.then((l) => l.remove())
    }
  }, [])

  async function openShared(share: SavedShare) {
    try {
      const { title, html } = await openSavedShare(userId, share)
      setOpenDeck({ title, html: viewingHtml(html) })
    } catch (err) {
      setHomeError(err instanceof Error && err.message === MESSAGES.notShared ? MESSAGES.notShared : errorMessage(err))
    }
  }

  async function removeShared(token: string) {
    const share = savedShares.find((s) => s.token === token)
    setSavedShares((prev) => prev.filter((s) => s.token !== token))
    await removeSavedShare(share ?? { token, copyPath: null }).catch((err) => setHomeError(errorMessage(err)))
  }

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

  // What the last load from Supabase (or the copy saved on the phone) held,
  // and where it left off: the next load asks only for what changed since.
  const loadedRef = useRef<db.LoadedSessions | null>(null)

  // The copy saved on the phone shows at once; a load of what changed since
  // then follows.
  useEffect(() => {
    let cancelled = false
    let fresh = false
    let showingSaved = false
    loadedRef.current = null
    const saved = readCachedSessions(userId)
    void saved.then(async (copy) => {
      if (!copy || cancelled || fresh) return
      const shown = await withPending(copy.sessions)
      if (cancelled || fresh) return
      showingSaved = true
      setSessions(shown)
    })
    async function load(attempt: number) {
      try {
        const loaded = await db.loadSessions(userId, loadedRef.current ?? (await saved))
        const shown = await withPending(loaded.sessions)
        if (cancelled) return
        fresh = true
        loadedRef.current = loaded
        setSessions(shown)
        void saveCachedSessions(userId, loaded)
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
        // With the saved copy showing, say it couldn't refresh rather than
        // replace the sessions with an error.
        if (showingSaved) {
          setHomeError(errorMessage(err))
        } else setLoadError(errorMessage(err))
      }
    }
    void load(1)
    return () => {
      cancelled = true
    }
  }, [userId])

  // Keep the saved copy up to date with changes made since the last load,
  // whenever the app goes to the background.
  const sessionsRef = useRef<Session[] | null>(null)
  sessionsRef.current = sessions
  useEffect(() => {
    function onHide() {
      if (document.visibilityState === 'hidden' && sessionsRef.current && loadedRef.current) {
        void saveCachedSessions(userId, { sessions: sessionsRef.current, cursor: loadedRef.current.cursor })
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [userId])

  // Ready presentations not yet on the phone are fetched in the background,
  // newest first, one at a time, so a tap opens them at once. Pinned ones and
  // the most recent few; older ones are saved the first time they're opened.
  const readyDecks =
    sessions
      ?.filter((s) => s.deckStatus === 'ready' && s.deckPath && s.deckGeneratedAt !== null)
      .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0) || (b.deckGeneratedAt ?? 0) - (a.deckGeneratedAt ?? 0))
      .slice(0, PREFETCH_DECKS) ?? []
  const readyDeckKey = readyDecks.map((s) => deckKey(s.id, s.deckGeneratedAt!)).join(',')
  const readyDecksRef = useRef(readyDecks)
  readyDecksRef.current = readyDecks
  useEffect(() => {
    if (!readyDeckKey || !Capacitor.isNativePlatform()) return
    let cancelled = false
    void (async () => {
      const have = await cachedDeckKeys()
      for (const session of readyDecksRef.current) {
        if (cancelled) return
        if (have.has(deckKey(session.id, session.deckGeneratedAt!))) continue
        await loadDeckHtml(session, session.deckPath!).catch(() => {})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [readyDeckKey])

  // A "no connection" message clears itself: once the phone is back online
  // (or the app comes back to the front, or every 20 seconds), reload quietly,
  // and drop the message when that works.
  const offline = homeError === OFFLINE_MESSAGE
  useEffect(() => {
    if (!offline) return
    let busy = false
    async function retry() {
      if (busy || document.visibilityState !== 'visible') return
      busy = true
      try {
        setSessions(await fetchSessionsWithPending())
        setHomeError((current) => (current === OFFLINE_MESSAGE ? null : current))
      } catch {
        // Still offline: try again later.
      } finally {
        busy = false
      }
    }
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', retry)
    const interval = window.setInterval(retry, 20_000)
    return () => {
      window.removeEventListener('online', retry)
      document.removeEventListener('visibilitychange', retry)
      window.clearInterval(interval)
    }
  }, [offline])

  // Generation runs server-side for minutes, and the request that started it
  // doesn't survive the phone switching apps -- so while any deck is
  // building, read its state from the database instead of waiting on that
  // request: every few seconds, and right away when the app comes back.
  const generatingIds = sessions?.filter((s) => s.deckStatus === 'generating' || s.deckStatus === 'queued').map((s) => s.id).join(',') ?? ''
  useEffect(() => {
    if (!generatingIds) return
    const ids = generatingIds.split(',')
    function refresh() {
      ids.forEach((id) => {
        db.fetchSessionDeckState(id)
          .then(async (state) => {
            // A finished build also saved entries into the session (the
            // speaker's bio among them, which the card shows): read them too.
            const items = state.deckStatus === 'ready' ? await db.fetchSessionItems(id).catch(() => null) : null
            updateSessionLocally(id, (s) => {
              if (!items) return { ...s, ...state }
              // Photos still uploading from this phone aren't on the server yet.
              const fetched = new Set(items.map((i) => i.id))
              const uploading = s.items.filter((i) => i.type === 'photo' && i.uploading && !fetched.has(i.id))
              return { ...s, ...state, items: [...items, ...uploading].sort((a, b) => a.timestamp - b.timestamp) }
            })
          })
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

  // Presentations build one at a time; the server starts the next queued one
  // when a build ends. If it couldn't (its sign-in had run out, or a build
  // stopped without finishing), start the one that's waited longest from
  // here -- once it's clear nothing is building.
  // When Claude's credits run out, the presentation it was building goes back
  // to the front of the queue (saying so) and the rest keep their places;
  // it's tried again every 15 minutes -- a refused try costs nothing -- and
  // the queue carries on by itself once there's credit.
  const queued = sessions?.filter((s) => s.deckStatus === 'queued') ?? []
  const waitingForCredit = queued.find((s) => s.deckError === MESSAGES.credits)?.id ?? null
  const queuedIds = queued.map((s) => s.id)
  const anyBuilding = sessions?.some((s) => s.deckStatus === 'generating') ?? false
  const nextQueued = !anyBuilding ? waitingForCredit ?? queuedIds[queuedIds.length - 1] ?? null : null
  const retryAfter = waitingForCredit ? 15 * 60_000 : 60_000
  const kickedAt = useRef(new Map<string, number>())
  useEffect(() => {
    if (!nextQueued) return
    const tryNext = () => {
      const last = kickedAt.current.get(nextQueued) ?? 0
      if (Date.now() - last < retryAfter) return
      kickedAt.current.set(nextQueued, Date.now())
      void generateDeckForSession(nextQueued)
    }
    const timer = window.setTimeout(tryNext, 8000)
    const interval = window.setInterval(tryNext, 60_000)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(interval)
    }
  }, [nextQueued, retryAfter])

  /** Sessions as stored, plus what's still on the phone waiting to be sent. */
  async function fetchSessionsWithPending(): Promise<Session[]> {
    const loaded = await db.loadSessions(userId, loadedRef.current)
    loadedRef.current = loaded
    void saveCachedSessions(userId, loaded)
    return withPending(loaded.sessions)
  }

  /** Sessions plus what's still on the phone waiting to be sent. */
  async function withPending(loaded: Session[]): Promise<Session[]> {
    const [photos, queued] = await Promise.all([
      pendingPhotos().catch(() => new Map<string, PhotoItem[]>()),
      db.withQueued(loaded),
    ])
    return queued.map((s) => {
      const ids = new Set(s.items.map((i) => i.id))
      const waiting = (photos.get(s.id) ?? []).filter((p) => !ids.has(p.id))
      return waiting.length ? { ...s, items: [...s.items, ...waiting].sort(
        (a, b) => positionOf(a) - positionOf(b) || a.timestamp - b.timestamp,
      ) } : s
    })
  }

  async function refreshSessions() {
    try {
      setSessions(await fetchSessionsWithPending())
    } catch (err) {
      setHomeError(errorMessage(err))
    }
  }

  function updateSessionLocally(id: string, updater: (session: Session) => Session) {
    setSessions((prev) => (prev ? prev.map((s) => (s.id === id ? updater(s) : s)) : prev))
  }

  async function startNewSession() {
    const session = await db.createSession(userId, nextSessionTitle(sessions ?? []))
    setSessions((prev) => (prev ? [session, ...prev] : [session]))
    setRoute({ screen: 'capture', sessionId: session.id })
  }

  /** Pins a presentation to the top of the Presentations view, or unpins it;
   * put back if the save fails. */
  async function togglePin(id: string) {
    const before = sessions?.find((s) => s.id === id)?.pinnedAt ?? null
    const after = before ? null : Date.now()
    updateSessionLocally(id, (s) => ({ ...s, pinnedAt: after }))
    try {
      await db.setSessionPinned(id, after)
    } catch (err) {
      updateSessionLocally(id, (s) => ({ ...s, pinnedAt: before }))
      setHomeError(errorMessage(err))
    }
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
        deckError: errorMessage(err),
      }))
    }
  }

  /** The presentation's page, photos embedded and shrunk: from the copy on
   * the phone if there is one, else downloaded (and saved back the first
   * time, so later opens and shares elsewhere download the small one). */
  async function loadDeckHtml(session: Session, deckPath: string): Promise<string> {
    const saved = await readCachedDeck(session.id, session.deckGeneratedAt)
    if (saved) {
      const clean = cleanDeckHtml(saved)
      if (clean !== saved) void saveCachedDeck(session.id, session.deckGeneratedAt, clean)
      return clean
    }
    const fetched = await db.fetchDeckHtml(deckPath)
    // Older pages may have a stray "```html" at the top; tidied and saved back.
    const html = cleanDeckHtml(fetched)
    const compacted = await compactDeckPhotos(html)
    // Saved on the phone first: the upload back reads it from there.
    if (!hasPhotoLinks(compacted)) await saveCachedDeck(session.id, session.deckGeneratedAt, compacted)
    if (compacted !== fetched) void uploadDeckLater(session, deckPath, compacted)
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
        setOpenDeck({ title: session.title, html: viewingHtml(await loadDeckHtml(session, session.deckPath)) })
        return
      }
      // The tab opens now, while this still counts as the user's tap (a popup
      // blocker would stop it after the wait), and gets the page once loaded.
      // The page goes in as UTF-8 HTML from here: storage hands it back as
      // plain text, which showed the page's source with garbled dashes.
      const tab = window.open('', '_blank')
      if (tab) tab.opener = null
      const html = await loadDeckHtml(session, session.deckPath)
      const url = URL.createObjectURL(new Blob([viewingHtml(html)], { type: 'text/html;charset=utf-8' }))
      if (tab) tab.location.href = url
      else window.open(url, '_blank', 'noopener')
    } catch (err) {
      setHomeError(errorMessage(err))
    }
  }

  /** A link anyone can open in a browser, or the page itself as a file. */
  async function chooseShareKind(): Promise<'link' | 'download' | null> {
    if (!Capacitor.isNativePlatform()) {
      return window.confirm('Share a link anyone can open in a browser? Cancel downloads the file instead.') ? 'link' : 'download'
    }
    const { index } = await ActionSheet.showActions({
      title: 'Share presentation',
      options: [
        { title: 'Share link' },
        { title: 'Download' },
        { title: 'Cancel', style: ActionSheetButtonStyle.Cancel },
      ],
    })
    return index === 0 ? 'link' : index === 1 ? 'download' : null
  }

  async function shareDeck(id: string) {
    const session = sessions?.find((s) => s.id === id)
    if (!session?.deckPath) return
    try {
      const kind = await chooseShareKind()
      if (!kind) return
      if (kind === 'link') {
        // The link opens the share sheet straight away; the page uploads
        // behind it (and only if the presentation changed since last shared).
        const prepared = await prepareShareLink(session.id, session.deckGeneratedAt)
        // Clips in shared presentations (Session options): when that changed
        // since this link was last uploaded, upload the page again.
        const withClips = getSessionOptions().clipsInShared
        const link = { ...prepared, upToDate: prepared.upToDate && sharedWithClips(session.id) === withClips }
        const deckPath = session.deckPath
        void publishShare(userId, session.id, session.title, link, async () => {
          const html = await loadDeckHtml(session, deckPath)
          return withClips ? html : withoutClips(html)
        })
          .then(() => noteSharedWithClips(session.id, withClips))
          .catch((err) => setHomeError(errorMessage(err)))
        const url = link.url
        if (Capacitor.isNativePlatform()) {
          await Share.share({ title: session.title, url })
        } else if (navigator.share) {
          await navigator.share({ title: session.title, url })
        } else {
          await navigator.clipboard?.writeText(url).catch(() => {})
          window.prompt('Link copied. Anyone with it can open the presentation:', url)
        }
        return
      }
      const fullHtml = await loadDeckHtml(session, session.deckPath)
      const length = await chooseDeckLength(fullHtml)
      if (!length) return
      const chosen = length === 'short' ? shortDeckHtml(fullHtml) : fullHtml
      const html = getSessionOptions().clipsInShared ? chosen : withoutClips(chosen)
      const baseName = session.title.replace(/[^\w\- ]+/g, '').trim() || 'presentation'
      const fileName = `${baseName}${length === 'short' ? ' - TLDR' : ''}.html`
      // Download: the page itself as a file, through the share sheet -- save
      // it to Files, text it, email it, AirDrop it.
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
      // No share sheet (most desktop browsers): a plain download.
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
      setHomeError(errorMessage(err))
    }
  }

  async function deleteSession(id: string) {
    const session = sessions?.find((s) => s.id === id)
    if (!session) return
    // Deleting removes the notes, photos and transcript for good -- confirm
    // first. (The native app shows this as a standard iOS alert.)
    if (!window.confirm(`Delete "${session.title}"? Its notes, photos and transcript will be permanently removed.`)) return
    setSessions((prev) => prev?.filter((s) => s.id !== id) ?? prev)
    // Its shared link stops opening too (best effort; needs signal).
    void stopSharing(userId, id).catch(() => {})
    try {
      await db.deleteSession(session)
    } catch (err) {
      setSessions((prev) => (prev ? [...prev, session] : prev))
      setHomeError(errorMessage(err))
    }
  }

  // A brand-new account with nothing yet gets the home tour once.
  const homeTourChecked = useRef(false)
  useEffect(() => {
    if (sessions === null || homeTourChecked.current || route.screen !== 'home') return
    homeTourChecked.current = true
    if (shouldAutoStartHomeTour(sessions.length)) window.setTimeout(startHomeTour, 700)
  }, [sessions, route.screen])

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
    {menu === 'menu' && (
      <AppMenu
        email={authSession.user.is_anonymous ? null : authSession.user.email ?? null}
        instant={menuReturning}
        onClose={() => setMenu(null)}
        onSessionOptions={() => setMenu('session')}
        onPresentationOptions={() => setMenu('presentation')}
        onDeleteAccount={() => setMenu('delete-account')}
        onTutorial={() => {
          setMenu(null)
          window.setTimeout(startHomeTour, 300)
        }}
        onAddEmail={() => setAddingEmail(true)}
        onSignOut={() => {
          setMenu(null)
          void clearCachedSessions(userId)
          void clearCachedDecks()
          signOut()
        }}
      />
    )}
    {menu === 'delete-account' && (
      <DeleteAccountSheet
        email={authSession.user.is_anonymous ? null : authSession.user.email ?? null}
        sessionCount={sessions.length}
        onBack={() => {
          setMenuReturning(true)
          setMenu('menu')
        }}
        onDelete={async () => {
          await db.deleteAccount(sessions.map((s) => s.id))
          await clearCachedSessions(userId)
          await clearCachedDecks()
          setMenu(null)
        }}
      />
    )}
    {menu === 'session' && (
      <SessionOptionsSheet
        userId={authSession.user.id}
        onBack={() => {
          setMenuReturning(true)
          setMenu('menu')
        }}
      />
    )}
    {menu === 'presentation' && (
      <PresentationOptionsSheet
        userId={authSession.user.id}
        onBack={() => {
          setMenuReturning(true)
          setMenu('menu')
        }}
      />
    )}
    {addingEmail && <AddEmailSheet sessionCount={sessions.length} onClose={() => setAddingEmail(false)} />}
    <HomeScreen
      sessions={sessions}
      onOpenSession={openSession}
      onNewSession={startNewSession}
      onOpenMenu={() => {
        setMenuReturning(false)
        setMenu('menu')
      }}
      onGenerateDeck={generateDeckForSession}
      onViewDeck={viewDeck}
      onTogglePin={togglePin}
      onShareDeck={shareDeck}
      onDeleteSession={deleteSession}
      savedShares={savedShares}
      onOpenShared={(share) => void openShared(share)}
      onRemoveShared={(token) => void removeShared(token)}
      onRefresh={async () => {
        await Promise.all([refreshSessions(), reloadSavedShares()])
      }}
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

/** Where an older build placed an entry; entries with none go after. */
function positionOf(item: TimelineItemData): number {
  return 'position' in item && item.position !== undefined ? item.position : Infinity
}
