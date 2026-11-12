import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '../networkError'
import { onOutboxProblem } from '../itemOutbox'
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Keyboard } from '@capacitor/keyboard'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import { maybeStartSessionTour } from '../tour'
import { PHOTOS_DENIED_MESSAGE, saveToPhotoLibrary } from '../native/photoLibrary'
import type { AudioItem, PhotoItem, Session, TimelineItemData, VideoItem } from '../types'
import { formatShortElapsed, formatSessionSubtitle, formatDurationCompact } from '../format'
import { Timeline } from '../components/Timeline'
import { CheckIcon, StarIcon, WarningIcon } from '../components/InlineIcons'
import { CameraViewfinder } from '../components/CameraViewfinder'
import { PhotoViewer } from '../components/PhotoViewer'
import { VideoViewer } from '../components/VideoViewer'
import { AskSheet, type AskTurn } from '../components/AskSheet'
import { useAmbientTranscription } from '../hooks/useAmbientTranscription'
import { useWakeLock } from '../hooks/useWakeLock'
import { useRecordingActivity } from '../hooks/useRecordingActivity'
import * as db from '../db'
import { forgetCachedDeck } from '../deckCache'
import { SlideScanner, blobToBase64 } from '../native/slideScanner'
import { backgroundUploads, queuePhoto } from '../photoUploads'
import { canRecordClips, recordClip, setClipTrim, stopClip, useActiveClip } from '../audioClips'
import { ClipButton } from '../components/ClipButton'
import './CaptureScreen.css'

interface CaptureScreenProps {
  session: Session
  userId: string
  /** Scroll to and flash this item on opening (from a search hit). */
  focusItemId?: string
  onUpdateLocal: (updater: (session: Session) => Session) => void
  onBack: () => void
}

function elapsedFor(session: Session, now: number): number {
  const live = session.status === 'recording' && session.liveSpanStartedAt
    ? now - session.liveSpanStartedAt
    : 0
  return session.accumulatedMs + live
}

export function CaptureScreen({ session, userId, focusItemId, onUpdateLocal, onBack }: CaptureScreenProps) {
  const [now, setNow] = useState(Date.now())
  const [cameraOpen, setCameraOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  // Kept while the session is open, so closing Ask and reopening it picks up
  // the same conversation.
  const [askTurns, setAskTurns] = useState<AskTurn[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  useEffect(() => onOutboxProblem(setSaveError), [])
  const [savedPhotoNotice, setSavedPhotoNotice] = useState(false)
  const [viewingPhotoId, setViewingPhotoId] = useState<string | null>(null)
  const [viewingVideoId, setViewingVideoId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | 'new' | null>(null)
  // Briefly true after "Remember this", as its confirmation.
  const [remembered, setRemembered] = useState(false)
  // Words heard so far in the transcript segment that's still in progress.
  const [liveText, setLiveText] = useState('')
  // Photos that failed to save -- kept in memory (not just dropped) so a bad
  // connection doesn't lose the actual capture. Retried on demand and
  // automatically once the browser reports it's back online.
  const [pendingPhotos, setPendingPhotos] = useState<{ id: string; blob: Blob }[]>([])
  // Photos being straightened and read on-device (native only).
  const [processingPhotoIds, setProcessingPhotoIds] = useState<ReadonlySet<string>>(new Set())
  const savingNoteRef = useRef(false)

  useEffect(() => {
    if (session.status !== 'recording') return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [session.status])

  useWakeLock(session.status === 'recording')

  useEffect(() => {
    if (session.status !== 'recording') setLiveText('')
  }, [session.status])

  const elapsedMs = elapsedFor(session, now)
  const viewingPhoto = session.items.find(
    (i): i is Extract<typeof i, { type: 'photo' }> => i.type === 'photo' && i.id === viewingPhotoId,
  )
  const viewingVideo = session.items.find(
    (i): i is VideoItem => i.type === 'video' && i.id === viewingVideoId,
  )
  const isLive = session.status === 'recording' || session.status === 'suspended'

  async function commitNewNote(text: string) {
    // The editor stays mounted until the save returns, so a blur (keyboard
    // dismissing, a tap elsewhere) after the checkmark would commit again and
    // add the note twice. One save at a time.
    if (savingNoteRef.current) return
    savingNoteRef.current = true
    // Stay open on failure instead of clearing immediately -- losing the
    // save on bad wifi shouldn't also lose what was typed. The editor
    // keeps its text and the user can tap away again to retry.
    try {
      const item = await db.addNote(session.id, userId, text)
      onUpdateLocal((s) => ({ ...s, items: [...s.items, item] }))
      setActiveId(null)
    } catch (err) {
      setSaveError(errorMessage(err))
    } finally {
      savingNoteRef.current = false
    }
  }

  /** Marks right now as a moment that mattered. */
  async function rememberThis() {
    if (Capacitor.isNativePlatform()) void Haptics.impact({ style: ImpactStyle.Medium })
    setRemembered(true)
    window.setTimeout(() => setRemembered(false), 1600)
    const item = await db.addHighlight(session.id, userId)
    onUpdateLocal((s) => ({ ...s, items: [...s.items, item] }))
  }

  const activeClip = useActiveClip()
  /** The clip button: starts a clip, or stops the one counting down. */
  async function tapClip() {
    if (Capacitor.isNativePlatform()) void Haptics.impact({ style: ImpactStyle.Medium })
    if (activeClip && activeClip.endsAt > Date.now()) {
      stopClip()
      return
    }
    try {
      await recordClip(session.id, userId, (item, id) =>
        onUpdateLocal((s) => ({
          ...s,
          items: item
            ? s.items.some((i) => i.id === id)
              ? s.items.map((i) => (i.id === id ? item : i))
              : [...s.items, item]
            : s.items.filter((i) => i.id !== id),
        })),
      )
    } catch (err) {
      setSaveError(errorMessage(err))
    }
  }

  function trimClip(item: AudioItem) {
    onUpdateLocal((s) => ({ ...s, items: s.items.map((i) => (i.id === item.id ? item : i)) }))
    setClipTrim(session.id, userId, item).catch((err: unknown) => setSaveError(errorMessage(err)))
  }

  async function commitNoteEdit(id: string, text: string) {
    setActiveId(null)
    onUpdateLocal((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === id && i.type === 'note' ? { ...i, text } : i)),
    }))
    try {
      await db.updateNoteText(session.id, id, text)
    } catch (err) {
      setSaveError(errorMessage(err))
    }
  }

  async function deleteItem(item: TimelineItemData) {
    if (activeId === item.id) setActiveId(null)
    onUpdateLocal((s) => ({ ...s, items: s.items.filter((i) => i.id !== item.id) }))
    // The presentation saved on the phone may show this photo: download it
    // again next time, without it.
    if (item.type === 'photo') void forgetCachedDeck(session.id)
    try {
      await db.deleteTimelineItem(session.id, item)
    } catch (err) {
      setSaveError(errorMessage(err))
    }
  }

  async function saveToAlbum(item: PhotoItem) {
    try {
      await saveToPhotoLibrary(item.dataUrl ?? (await db.resolvePhotoUrl(item.photoPath)))
      setSavedPhotoNotice(true)
      void Haptics.notification({ type: NotificationType.Success })
    } catch (err) {
      setSaveError((err as { code?: string }).code === 'denied' ? PHOTOS_DENIED_MESSAGE : "Couldn't save this photo")
    }
  }

  useEffect(() => {
    if (!savedPhotoNotice) return
    const timer = setTimeout(() => setSavedPhotoNotice(false), 3000)
    return () => clearTimeout(timer)
  }, [savedPhotoNotice])

  async function toggleExcluded(item: TimelineItemData) {
    const excluded = !item.excluded
    onUpdateLocal((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === item.id ? { ...i, excluded } : i)),
    }))
    try {
      await db.setItemExcluded(session.id, item.id, excluded)
    } catch (err) {
      setSaveError(errorMessage(err))
    }
  }

  async function toggleStarred(item: TimelineItemData) {
    const starred = !item.starred
    if (starred && Capacitor.isNativePlatform()) void Haptics.impact({ style: ImpactStyle.Light })
    onUpdateLocal((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === item.id ? { ...i, starred } : i)),
    }))
    try {
      await db.setItemStarred(session.id, item.id, starred)
    } catch (err) {
      setSaveError(errorMessage(err))
    }
  }

  /** A dragged entry takes the moment between its new neighbours. */
  async function placeItem(orderedIds: string[], movedId: string) {
    const byId = new Map(session.items.map((i) => [i.id, i]))
    // Arranged by an older build (a position on every entry): first give the
    // entries times that keep the order shown, nudging only those out of step.
    const converting = session.items.some((i) => 'position' in i && i.position !== undefined)
    const time = new Map(session.items.map((i) => [i.id, i.timestamp]))
    const nudged = new Map<string, number>()
    if (converting) {
      let prev: number | undefined
      for (const id of orderedIds) {
        if (id === movedId) continue
        let t = time.get(id)!
        if (prev !== undefined && t <= prev) {
          t = prev + 10
          nudged.set(id, t)
          time.set(id, t)
        }
        prev = t
      }
    }
    const index = orderedIds.indexOf(movedId)
    const before = time.get(orderedIds[index - 1])
    const after = time.get(orderedIds[index + 1])
    const own = byId.get(movedId)?.timestamp
    const timestamp = Math.round(
      before !== undefined && after !== undefined ? before + (after - before) / 2
      : before !== undefined ? before + 1000
      : after !== undefined ? after - 1000
      : own ?? 0,
    )
    if (own === undefined || (!converting && timestamp === own)) return
    time.set(movedId, timestamp)
    onUpdateLocal((s) => ({
      ...s,
      items: s.items
        .map((i) => {
          const t = time.get(i.id) ?? i.timestamp
          return converting ? { ...i, timestamp: t, ...('position' in i ? { position: undefined } : {}) } : i.id === movedId ? { ...i, timestamp: t } : i
        })
        .sort((a, b) => a.timestamp - b.timestamp),
    }))
    try {
      if (converting) await db.convertToTimeOrder(session.id, nudged)
      await db.placeItem(session.id, movedId, timestamp)
    } catch (err) {
      setSaveError(errorMessage(err))
    }
  }

  async function commitTitle(title: string) {
    onUpdateLocal((s) => ({ ...s, title }))
    try {
      await db.updateSession(session.id, { title })
    } catch (err) {
      setSaveError(errorMessage(err))
    }
  }

  async function savePhoto(pendingId: string, blob: Blob) {
    try {
      const item = await db.addPhoto(session.id, userId, blob)
      onUpdateLocal((s) => ({ ...s, items: [...s.items, item] }))
      setPendingPhotos((p) => p.filter((x) => x.id !== pendingId))
      if (Capacitor.isNativePlatform()) void processPhoto(item, blob)
    } catch (err) {
      setSaveError(errorMessage(err))
    }
  }

  /** Straightens the slide in a just-saved photo and reads its text, on the
   * phone. The photo is already safe in storage, so a failure here just
   * leaves it as taken. */
  async function processPhoto(item: PhotoItem, blob: Blob) {
    setProcessingPhotoIds((ids) => new Set(ids).add(item.id))
    try {
      const result = await SlideScanner.process({ data: await blobToBase64(blob) })
      const flattened = result.data
        ? await fetch(`data:image/jpeg;base64,${result.data}`).then((r) => r.blob())
        : undefined
      const processed = await db.saveProcessedPhoto(item, session.id, userId, { flattened, text: result.text })
      onUpdateLocal((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === item.id && i.type === 'photo' ? { ...i, ...processed } : i)),
      }))
    } catch {
      // Left unprocessed; it still goes into the deck as taken.
    } finally {
      setProcessingPhotoIds((ids) => {
        const next = new Set(ids)
        next.delete(item.id)
        return next
      })
    }
  }

  /** Native: the photo shows at once and goes to the background upload
   * queue, which straightens and reads it first. */
  async function queueNativePhoto(blob: Blob) {
    const { item, processed } = queuePhoto(session.id, userId, blob)
    onUpdateLocal((s) => ({ ...s, items: [...s.items, item] }))
    setProcessingPhotoIds((ids) => new Set(ids).add(item.id))
    try {
      const update = await processed
      onUpdateLocal((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === item.id && i.type === 'photo' ? { ...i, ...update } : i)),
      }))
    } catch {
      // Couldn't even save it to the phone -- upload it directly instead.
      onUpdateLocal((s) => ({ ...s, items: s.items.filter((i) => i.id !== item.id) }))
      uploadPhoto(blob)
    } finally {
      setProcessingPhotoIds((ids) => {
        const next = new Set(ids)
        next.delete(item.id)
        return next
      })
    }
  }

  function commitPhoto(blob: Blob) {
    if (backgroundUploads) {
      void queueNativePhoto(blob)
      return
    }
    uploadPhoto(blob)
  }

  function uploadPhoto(blob: Blob) {
    const pendingId = `${Date.now()}-${Math.random()}`
    setPendingPhotos((p) => [...p, { id: pendingId, blob }])
    void savePhoto(pendingId, blob)
  }

  function retryPendingPhotos() {
    setPendingPhotos((current) => {
      current.forEach((p) => void savePhoto(p.id, p.blob))
      return current
    })
  }
  const retryPendingPhotosRef = useRef(retryPendingPhotos)
  useEffect(() => {
    retryPendingPhotosRef.current = retryPendingPhotos
  })

  // A photo that failed to save stays queued, not lost -- retry it the
  // moment the browser reports a connection again, since conference wifi
  // dropouts are usually brief. (Also retriable by hand, see the save-error
  // banner below.)
  useEffect(() => {
    function handleOnline() {
      retryPendingPhotosRef.current()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  // The session tour, if finishing the home tour queued it.
  useEffect(() => {
    const t = window.setTimeout(maybeStartSessionTour, 700)
    return () => window.clearTimeout(t)
  }, [])

  // Hide the bottom action row while typing (a note or the title) so the
  // keyboard has the room.
  const [typing, setTyping] = useState(false)
  const keyboardHeight = useKeyboardHeight()
  useEffect(() => {
    // In the app, follow the keyboard itself: a note editor can unmount while
    // focused, which fires no focusout.
    if (Capacitor.isNativePlatform()) {
      const show = Keyboard.addListener('keyboardWillShow', () => setTyping(true))
      const hide = Keyboard.addListener('keyboardWillHide', () => setTyping(false))
      return () => {
        show.then((h) => h.remove())
        hide.then((h) => h.remove())
      }
    }
    const isField = (el: Element | null) =>
      el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
    const check = () => setTimeout(() => setTyping(isField(document.activeElement)), 0)
    document.addEventListener('focusin', check)
    document.addEventListener('focusout', check)
    document.addEventListener('click', check)
    return () => {
      document.removeEventListener('focusin', check)
      document.removeEventListener('focusout', check)
      document.removeEventListener('click', check)
    }
  }, [])

  async function commitTranscriptSegment(text: string, startedAt: number, durationMs: number) {
    // duration_ms is an integer column -- round in case a capture source
    // reports fractional milliseconds.
    const item = await db.addTranscriptSegment(session.id, userId, text, startedAt, Math.round(durationMs))
    onUpdateLocal((s) => ({ ...s, items: [...s.items, item] }))
    setLiveText('')
  }

  useAmbientTranscription({
    active: session.status === 'recording',
    onSegment: commitTranscriptSegment,
    onPartial: setLiveText,
    onError: setSaveError,
  })

  async function stop() {
    const accumulatedMs = elapsedFor(session, Date.now())
    // Bump updatedAt locally too, matching what the server sets -- otherwise
    // the in-memory session (reused across navigation until the next full
    // fetchSessions) still looks stale to isSessionActive even though the
    // user just interacted with it.
    onUpdateLocal((s) => ({ ...s, status: 'suspended', accumulatedMs, liveSpanStartedAt: null, updatedAt: Date.now() }))
    try {
      await db.updateSession(session.id, { status: 'suspended', accumulatedMs, liveSpanStartedAt: null })
    } catch (err) {
      setSaveError(errorMessage(err))
    }
  }

  async function resume() {
    const liveSpanStartedAt = Date.now()
    onUpdateLocal((s) => ({ ...s, status: 'recording', liveSpanStartedAt, updatedAt: Date.now() }))
    try {
      await db.updateSession(session.id, { status: 'recording', liveSpanStartedAt })
    } catch (err) {
      setSaveError(errorMessage(err))
    }
  }

  // Lock Screen / Dynamic Island. Its buttons can arrive late (the app was
  // asleep), so ignore one that no longer applies.
  useRecordingActivity(
    session,
    () => { if (session.status === 'recording') void stop() },
    () => { if (session.status === 'suspended') void resume() },
  )

  return (
    <div className="capture-screen" style={{ height: `calc(100dvh - ${keyboardHeight}px)` }}>
      <header className="capture-header">
        <div className="capture-header__row1">
          <button className="capture-header__back" onClick={onBack} aria-label="Back to home">
            ‹
          </button>
          <EditableTitle title={session.title} onCommit={commitTitle} />
        </div>

        {!isLive && (
        <div className="capture-header__row2">
          {!isLive && (
            <div className="capture-header__primary">
              <span className="rec-dot rec-dot--done" aria-hidden="true" />
              <span className="capture-header__subtitle">
                {formatSessionSubtitle(session.startedAt)}
                {session.accumulatedMs > 0 && ` · ${formatDurationCompact(session.accumulatedMs)}`}
              </span>
            </div>
          )}

          <div className="capture-header__controls">
            {!isLive && (
              session.deckStatus === 'ready' && session.deckGeneratedAt && (
                session.updatedAt > session.deckGeneratedAt ? (
                  <span className="capture-header__deck-warn">
                    <WarningIcon /> Edited since deck
                  </span>
                ) : (
                  <span className="capture-header__deck-ok">
                    <CheckIcon /> Deck up to date
                  </span>
                )
              )
            )}
          </div>
        </div>
        )}
      </header>

      {saveError && (
        <div className="save-error" role="alert">
          {saveError}{' '}
          {pendingPhotos.length > 0 && (
            <button onClick={retryPendingPhotos}>
              Retry {pendingPhotos.length > 1 ? `${pendingPhotos.length} photos` : 'photo'}
            </button>
          )}{' '}
          <button onClick={() => setSaveError(null)}>Dismiss</button>
        </div>
      )}

      <Timeline
        items={session.items}
        onPhotoTap={setViewingPhotoId}
        onVideoTap={setViewingVideoId}
        activeId={activeId}
        onStartNewNote={() => setActiveId('new')}
        onStartEditNote={setActiveId}
        onCommitNewNote={commitNewNote}
        onCommitNoteEdit={commitNoteEdit}
        onCancelActive={() => setActiveId(null)}
        onDeleteItem={deleteItem}
        onToggleExcluded={toggleExcluded}
        onToggleStarred={toggleStarred}
        onSavePhoto={Capacitor.isNativePlatform() ? saveToAlbum : undefined}
        onReorder={placeItem}
        liveTranscript={session.status === 'recording' ? liveText : null}
        processingPhotoIds={processingPhotoIds}
        focusId={focusItemId}
        onTrimClip={canRecordClips ? trimClip : undefined}
      />

      <div className="save-notice" role="status">
        {savedPhotoNotice && <span>Saved to Photos</span>}
      </div>

      {/* Camera sits in the middle, where the viewfinder's shutter is, so a
          thumb doesn't move between opening the camera and taking the shot. */}
      <div className="capture-actions" hidden={typing}>
        <div className="capture-actions__start">
          {isLive && (
            // Record/pause and the running time in one pill: a blinking dot
            // while recording, a pause glyph while paused.
            <button
              className={`rec-pill${session.status === 'recording' ? ' rec-pill--live' : ''}`}
              onClick={session.status === 'recording' ? stop : resume}
              aria-label={
                session.status === 'recording'
                  ? `Pause recording, ${formatShortElapsed(elapsedMs)} elapsed`
                  : `Resume recording, ${formatShortElapsed(elapsedMs)} recorded`
              }
            >
              {session.status === 'recording' ? (
                <span className="rec-dot rec-dot--live" aria-hidden="true" />
              ) : (
                <span className="rec-toggle__pause" aria-hidden="true" />
              )}
              <span className="rec-pill__time mono-timestamp" aria-hidden="true">
                {formatShortElapsed(elapsedMs)}
              </span>
            </button>
          )}
        </div>

        <button
          className="camera-trigger"
          onClick={() => setCameraOpen(true)}
          aria-label="Capture photo"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 8.5A1.5 1.5 0 015.5 7H8l1-2h6l1 2h2.5A1.5 1.5 0 0120 8.5v9A1.5 1.5 0 0118.5 19h-13A1.5 1.5 0 014 17.5v-9z"
              stroke="var(--accent)"
              strokeWidth="1.6"
            />
            <circle cx="12" cy="13" r="3.2" stroke="var(--accent)" strokeWidth="1.6" />
          </svg>
        </button>

        <div className="capture-actions__end">
          {session.status === 'recording' && (
            <button
              className={`remember-btn${remembered ? ' remember-btn--done' : ''}`}
              onClick={rememberThis}
              aria-label={remembered ? 'Remembered' : 'Remember this moment'}
            >
              <StarIcon filled={remembered} />
            </button>
          )}
          {session.status === 'recording' && canRecordClips && <ClipButton className="clip-btn" onTap={tapClip} />}
          {/* Ask is always available — live, paused or ended — even before the
              first transcript line has been saved as an item. */}
          <button className="ask-btn" onClick={() => setAskOpen(true)} aria-label="Ask about this session">
            <svg className="inline-icon" viewBox="2.2 2.7 19.6 18.6" fill="none" aria-hidden="true">
              <path
                d="M4 5.5A2 2 0 016 3.5h12a2 2 0 012 2v9a2 2 0 01-2 2h-7l-4.5 4v-4H6a2 2 0 01-2-2v-9z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {viewingPhoto && (
        <PhotoViewer item={viewingPhoto} onClose={() => setViewingPhotoId(null)} />
      )}

      {viewingVideo && (
        <VideoViewer item={viewingVideo} onClose={() => setViewingVideoId(null)} />
      )}

      {askOpen && (
        <AskSheet
          kicker="Ask about"
          title={session.title}
          hint="Answers come from this session’s transcript, notes and slides."
          suggestions={['What were the main points?', 'What did the speaker recommend?', 'What should I follow up on?']}
          ask={async (question, history) => ({ answer: await db.askSession(session.id, question, history) })}
          turns={askTurns}
          onTurnsChange={setAskTurns}
          onClose={() => setAskOpen(false)}
        />
      )}

      {cameraOpen && (
        <CameraViewfinder
          onCapture={commitPhoto}
          onClose={() => setCameraOpen(false)}
          onRemember={session.status === 'recording' ? rememberThis : undefined}
          remembered={remembered}
          onClip={session.status === 'recording' && canRecordClips ? tapClip : undefined}
        />
      )}
    </div>
  )
}

function EditableTitle({ title, onCommit }: { title: string; onCommit: (title: string) => void }) {
  const [editing, setEditing] = useState(false)

  if (!editing) {
    return (
      <h1 className="capture-header__title" onClick={() => setEditing(true)}>
        {title}
      </h1>
    )
  }

  return (
    <TitleInput
      initialTitle={title}
      onCommit={(text) => {
        setEditing(false)
        onCommit(text)
      }}
      onCancel={() => setEditing(false)}
    />
  )
}

function TitleInput({
  initialTitle,
  onCommit,
  onCancel,
}: {
  initialTitle: string
  onCommit: (title: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initialTitle)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)

    // Same iOS Safari keyboard-covers-the-field workaround as NoteRowEditor —
    // a custom scroll container doesn't get the browser's automatic
    // scroll-into-view when the keyboard opens.
    const bringIntoView = () => {
      requestAnimationFrame(() => el?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
    }
    bringIntoView()
    window.visualViewport?.addEventListener('resize', bringIntoView)
    return () => window.visualViewport?.removeEventListener('resize', bringIntoView)
  }, [])

  function commit() {
    const trimmed = text.trim()
    if (trimmed && trimmed !== initialTitle) {
      onCommit(trimmed)
    } else {
      onCancel()
    }
  }

  return (
    <input
      ref={inputRef}
      className="capture-header__title-input"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}
