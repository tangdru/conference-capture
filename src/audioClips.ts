import { useSyncExternalStore } from 'react'
import { Capacitor } from '@capacitor/core'
import { supabase, VIDEOS_BUCKET } from './supabaseClient'
import * as db from './db'
import { Clips } from './native/clips'
import { forgetClipUpload, noteClipSaved, pendingClipUploads, setPendingClipUploads, trimClip, type ClipUpload } from './clips'
import { feel } from './haptics'
import { getSessionOptions } from './sessionOptions'
import type { AudioItem } from './types'

// The clip button. A tap keeps the seconds already heard and records on for
// a set time (both set in Session options → Chui's audio; 5 and 44 by
// default), with 15 seconds spare either side so the trim handles can also
// reach out. The kept part is cut to its own file on the phone and uploaded
// (again after each trim); the presentation plays that file.

const CLIP_MARGIN_S = 15
/** A clip set to 0 before and 0 after still keeps this much. */
const CLIP_MIN_AFTER_S = 1

const native = Capacitor.isNativePlatform()
/** Only the phone can record (it holds the listening mic). */
export const canRecordClips = native

// The clip being recorded, for the button's countdown -- kept here so it
// survives leaving the session screen and coming back.
export interface ActiveClip {
  id: string
  /** When the kept part ends (the spare margin records on after it). */
  endsAt: number
}
let active: ActiveClip | null = null
const listeners = new Set<() => void>()

function setActive(next: ActiveClip | null) {
  active = next
  listeners.forEach((l) => l())
}

export function useActiveClip(): ActiveClip | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => active,
  )
}

/** Starts a clip: its entry right away (via `onChange`), then the saved
 * audio once recording ends. The entry is dropped if nothing was recorded
 * (the session wasn't listening). */
export async function recordClip(
  sessionId: string,
  userId: string,
  onChange: (item: AudioItem | null, id: string) => void,
): Promise<string> {
  const options = getSessionOptions()
  const before = options.clipBeforeS
  const after = before + options.clipAfterS < CLIP_MIN_AFTER_S ? CLIP_MIN_AFTER_S : options.clipAfterS
  const item = await db.addAudioClip(sessionId, userId)
  onChange(item, item.id)
  setActive({ id: item.id, endsAt: Date.now() + after * 1000 })
  void Clips.record({
    id: item.id,
    sessionId,
    before,
    after,
    margin: CLIP_MARGIN_S,
    snap: options.snapToSentences,
    boost: options.voiceBoost,
  })
    .catch(() => ({ clip: undefined }))
    .then(async ({ clip }) => {
      // Still counting down when it ended: it finished by itself (a tap on
      // stop clears it first, and has its own haptic).
      const ranOut = active?.id === item.id
      if (ranOut) setActive(null)
      if (ranOut && clip) feel.soft()
      if (!clip) {
        onChange(null, item.id)
        await db.deleteTimelineItem(sessionId, item).catch(() => {})
        return
      }
      noteClipSaved(clip)
      const saved: AudioItem = {
        ...item,
        recording: undefined,
        startedAt: clip.startedAt,
        durationMs: clip.durationMs,
        trimStartMs: clip.trimStartMs ?? 0,
        trimEndMs: clip.trimEndMs ?? clip.durationMs,
        peaks: clip.peaks,
      }
      onChange(saved, item.id)
      await db.updateAudioClip(sessionId, saved).catch(() => {})
      queueClipUpload({ itemId: item.id, sessionId, userId })
    })
  return item.id
}

/** Ends the clip being recorded now. */
export function stopClip(): void {
  setActive(null)
  if (native) void Clips.stopRecording().catch(() => {})
}

/** Keep only the trimmed part (Session options): on leaving a session, each
 * trimmed clip's audio outside its trim is deleted from the phone. The
 * uploaded cut doesn't change, so nothing uploads again. */
export async function commitClipTrims(
  sessionId: string,
  items: AudioItem[],
  onChange: (item: AudioItem) => void,
): Promise<void> {
  if (!native || !getSessionOptions().keepTrimmedOnly) return
  for (const item of items) {
    if (item.recording || active?.id === item.id) continue
    if (item.trimStartMs <= 0 && item.trimEndMs >= item.durationMs) continue
    try {
      const { clip } = await Clips.commitTrim({ id: item.id })
      if (!clip) continue
      noteClipSaved(clip)
      const next: AudioItem = {
        ...item,
        startedAt: clip.startedAt,
        durationMs: clip.durationMs,
        trimStartMs: 0,
        trimEndMs: clip.durationMs,
        peaks: clip.peaks,
      }
      onChange(next)
      await db.updateAudioClip(sessionId, next)
    } catch {
      // Left as it was; tried again next time the session is left.
    }
  }
}

/** A new trim: saved, and the kept part uploaded again. */
export async function setClipTrim(sessionId: string, userId: string, item: AudioItem): Promise<void> {
  trimClip(item.id, item.trimStartMs, item.trimEndMs)
  await db.updateAudioClip(sessionId, item)
  queueClipUpload({ itemId: item.id, sessionId, userId })
}

// ---- Uploading the kept part ----

type UploadedListener = (sessionId: string, itemId: string, path: string) => void
let onUploaded: UploadedListener | null = null
let running = false
/** Queued while a run was going: run again straight after. */
let queuedDuringRun = false
let timer: number | undefined

function queueClipUpload(upload: ClipUpload) {
  setPendingClipUploads([...pendingClipUploads().filter((u) => u.itemId !== upload.itemId), upload])
  if (running) queuedDuringRun = true
  void runUploads()
}

/** Keeps trying uploads left from before (no signal, app closed); tells
 * `listener` where each one went. Returns the stop function. */
export function startClipUploads(listener: UploadedListener): () => void {
  if (!native) return () => {}
  onUploaded = listener
  void runUploads()
  const retry = () => void runUploads()
  window.addEventListener('online', retry)
  return () => {
    onUploaded = null
    window.removeEventListener('online', retry)
    window.clearTimeout(timer)
  }
}

/** Upload on Wi-Fi only (Session options): false while on mobile data. */
async function mayUploadNow(): Promise<boolean> {
  if (!getSessionOptions().wifiOnlyUploads) return true
  try {
    return (await Clips.network()).unmetered
  } catch {
    return true
  }
}

async function runUploads(): Promise<void> {
  if (running || !native) return
  if (!(await mayUploadNow())) {
    window.clearTimeout(timer)
    if (pendingClipUploads().length) timer = window.setTimeout(() => void runUploads(), 2 * 60_000)
    return
  }
  running = true
  queuedDuringRun = false
  window.clearTimeout(timer)
  try {
    for (let pass = 0, again = true; again && pass < 5; pass++) {
      again = false
      for (const upload of pendingClipUploads()) {
        try {
          if (await uploadOne(upload)) again = true
        } catch {
          // No signal or a server hiccup: tried again shortly.
        }
      }
    }
  } finally {
    running = false
    if (queuedDuringRun) void runUploads()
    else if (pendingClipUploads().length) timer = window.setTimeout(() => void runUploads(), 2 * 60_000)
  }
}

const PATHS_KEY = 'cc-clip-paths'

function uploadedPaths(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PATHS_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

/** True when it has to go again (trimmed while uploading). */
async function uploadOne(upload: ClipUpload): Promise<boolean> {
  const { clip } = await Clips.info({ id: upload.itemId })
  if (!clip) {
    // Deleted, or never saved: nothing to send.
    forgetClipUpload(upload.itemId)
    return false
  }
  const startMs = clip.trimStartMs ?? 0
  const endMs = clip.trimEndMs ?? clip.durationMs
  const { path: fileUrl } = await Clips.exportTrimmed({ id: upload.itemId, startMs, endMs })
  const blob = await (await fetch(Capacitor.convertFileSrc(fileUrl))).blob()
  // Named by its trim, so a re-trimmed clip never shows a cached old cut.
  const path = `${upload.userId}/${upload.sessionId}/${upload.itemId}-${startMs}-${endMs}.m4a`
  const { error } = await supabase.storage
    .from(VIDEOS_BUCKET)
    .upload(path, new Blob([blob], { type: 'audio/mp4' }), { contentType: 'audio/mp4', upsert: true })
  if (error) throw error

  // Trimmed again meanwhile: this cut is out of date, so do the newer one.
  const { clip: now } = await Clips.info({ id: upload.itemId })
  if (!now || (now.trimStartMs ?? 0) !== startMs || (now.trimEndMs ?? now.durationMs) !== endMs) {
    void supabase.storage.from(VIDEOS_BUCKET).remove([path])
    return true
  }

  await db.updateAudioClip(upload.sessionId, {
    id: upload.itemId,
    type: 'audio',
    timestamp: 0,
    startedAt: clip.startedAt,
    durationMs: clip.durationMs,
    trimStartMs: startMs,
    trimEndMs: endMs,
    peaks: clip.peaks,
    audioPath: path,
  })
  const paths = uploadedPaths()
  const previous = paths[upload.itemId]
  paths[upload.itemId] = path
  try {
    localStorage.setItem(PATHS_KEY, JSON.stringify(paths))
  } catch {
    // Only means an old cut may be left in storage.
  }
  if (previous && previous !== path) void supabase.storage.from(VIDEOS_BUCKET).remove([previous])
  onUploaded?.(upload.sessionId, upload.itemId, path)
  forgetClipUpload(upload.itemId)
  return false
}

/** Plays a clip's uploaded cut (another device, or the web). */
export async function clipUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(VIDEOS_BUCKET).createSignedUrl(path, 60 * 60)
  if (error || !data) throw error ?? new Error('No link')
  return data.signedUrl
}
