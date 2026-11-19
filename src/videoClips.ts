import { useEffect, useSyncExternalStore } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import * as db from './db'
import { supabase, VIDEOS_BUCKET } from './supabaseClient'
import { Clips } from './native/clips'
import { getSessionOptions } from './sessionOptions'
import type { NativeVideoClip } from './native/nativeCamera'
import type { VideoItem } from './types'

// Video clips: recorded by holding the camera's shutter (VideoClips.swift),
// kept on the phone that recorded them, where they can be played, trimmed
// and saved to Photos. The kept part uploads (again after each trim) with a
// few stills where the picture changes -- the first is its poster elsewhere,
// and Claude looks at them, since it can't watch video. The clip's id is its
// timeline entry's id.
// See design/plans/2026-11-15-video-clips-plan.md.

/** Bridge to ios/App/App/VideoClipsPlugin.swift -- only in the native build. */
interface VideoClipsPlugin {
  info(options: { id: string }): Promise<{ clip?: NativeVideoClip }>
  exportTrimmed(options: { id: string; startMs: number; endMs: number }): Promise<{ path: string }>
  keyFrames(options: { id: string; startMs: number; endMs: number }): Promise<{ frames: { path: string; atMs: number }[] }>
  commitTrim(options: { id: string; startMs: number; endMs: number; startedAt: number }): Promise<{ clip?: NativeVideoClip }>
  remove(options: { id: string }): Promise<void>
  /** Rejects with code 'denied' if Photos access is off. */
  saveToPhotos(options: { id: string; startMs: number; endMs: number }): Promise<void>
}

const VideoClips = registerPlugin<VideoClipsPlugin>('VideoClips')
const native = Capacitor.isNativePlatform()

/** A clip's files on this phone, as URLs the web view can show. */
export interface LocalVideo {
  src: string
  poster: string
  frames: string[]
  durationMs: number
}

// undefined: not looked up yet; null: not on this phone.
const local = new Map<string, LocalVideo | null>()
const listeners = new Set<() => void>()

function toLocal(clip: NativeVideoClip): LocalVideo {
  // A new trim keeps the same file names: the query makes the web view
  // load the new pictures rather than its cached ones.
  const bust = `?v=${clip.durationMs}`
  const url = (path: string) => Capacitor.convertFileSrc(path) + bust
  return { src: url(clip.path), poster: url(clip.posterPath), frames: (clip.frames ?? []).map(url), durationMs: clip.durationMs }
}

function setLocal(id: string, clip: NativeVideoClip | null | undefined) {
  local.set(id, clip ? toLocal(clip) : null)
  listeners.forEach((l) => l())
}

/** The clip's files when it was recorded on this phone, else null. */
export function useLocalVideo(id: string): LocalVideo | null {
  useEffect(() => {
    if (!native || local.has(id)) return
    void VideoClips.info({ id })
      .then(({ clip }) => setLocal(id, clip))
      .catch(() => setLocal(id, null))
  }, [id])
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => local.get(id) ?? null,
  )
}

/** A clip just recorded in the camera: its entry, at the moment it started. */
export async function addRecordedClip(sessionId: string, userId: string, clip: NativeVideoClip): Promise<VideoItem> {
  setLocal(clip.id, clip)
  const item = await db.addVideoClip(sessionId, userId, clip)
  queueUpload({ itemId: item.id, sessionId, userId, startMs: item.trimStartMs, endMs: item.trimEndMs })
  return item
}

/** A new trim: saved, and the kept part uploaded again. */
export async function setVideoTrim(sessionId: string, userId: string, item: VideoItem): Promise<void> {
  await db.updateVideoClip(sessionId, item)
  if (local.get(item.id)) queueUpload({ itemId: item.id, sessionId, userId, startMs: item.trimStartMs, endMs: item.trimEndMs })
}

export async function removeVideoClip(id: string): Promise<void> {
  local.delete(id)
  setPending(pending().filter((u) => u.itemId !== id))
  if (native) await VideoClips.remove({ id }).catch(() => {})
}

export async function saveVideoToPhotos(item: VideoItem): Promise<void> {
  await VideoClips.saveToPhotos({ id: item.id, startMs: item.trimStartMs, endMs: item.trimEndMs })
}

/** Keep only the trimmed part (Session options), on leaving the session --
 * as for audio clips. */
export async function commitVideoTrims(
  sessionId: string,
  items: VideoItem[],
  onChange: (item: VideoItem) => void,
): Promise<void> {
  if (!native || !getSessionOptions().keepTrimmedOnly) return
  for (const item of items) {
    if (item.trimStartMs <= 0 && item.trimEndMs >= item.durationMs) continue
    if (!local.get(item.id)) continue
    try {
      const startedAt = item.startedAt ?? item.timestamp
      const { clip } = await VideoClips.commitTrim({ id: item.id, startMs: item.trimStartMs, endMs: item.trimEndMs, startedAt })
      if (!clip) continue
      setLocal(item.id, clip)
      const next: VideoItem = {
        ...item,
        startedAt: startedAt + item.trimStartMs,
        durationMs: clip.durationMs,
        trimStartMs: 0,
        trimEndMs: clip.durationMs,
      }
      onChange(next)
      // The file is now the kept part, so a waiting upload's times move too.
      setPending(pending().map((u) => (u.itemId === item.id ? { ...u, startMs: 0, endMs: clip.durationMs } : u)))
      await db.updateVideoClip(sessionId, next)
    } catch {
      // Left as it was; tried again next time the session is left.
    }
  }
}

// ---- Uploading the kept part ----
// As audio clips (audioClips.ts): a queue kept in localStorage, tried again
// on the next launch or when the signal comes back. Named by the trim, so a
// re-trimmed clip never plays a cached old cut.

interface VideoUpload {
  itemId: string
  sessionId: string
  userId: string
  /** The trim to upload, in the phone's file. */
  startMs: number
  endMs: number
}

export interface UploadedVideo {
  videoPath: string
  posterPath: string | undefined
  frames: { path: string; atMs: number }[]
}

const QUEUE_KEY = 'cc-video-uploads'
const FILES_KEY = 'cc-video-files'

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T | null) ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or off: the upload still runs this time.
  }
}

function pending(): VideoUpload[] {
  return readJson<VideoUpload[]>(QUEUE_KEY, [])
}

function setPending(list: VideoUpload[]) {
  writeJson(QUEUE_KEY, list)
}

type UploadedListener = (sessionId: string, itemId: string, uploaded: UploadedVideo) => void
let onUploaded: UploadedListener | null = null
let running = false
let queuedDuringRun = false
let timer: number | undefined

function queueUpload(upload: VideoUpload) {
  if (!native) return
  setPending([...pending().filter((u) => u.itemId !== upload.itemId), upload])
  if (running) queuedDuringRun = true
  void runUploads()
}

/** Keeps trying uploads left from before; tells `listener` where each went.
 * Returns the stop function. */
export function startVideoUploads(listener: UploadedListener): () => void {
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

/** Session options › Video clips › Upload: off keeps them waiting on the
 * phone; Wi-Fi only holds them while on mobile data. */
async function mayUploadNow(): Promise<boolean> {
  const when = getSessionOptions().videoUploads
  if (when === 'off') return false
  if (when === 'always') return true
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
    if (pending().length) timer = window.setTimeout(() => void runUploads(), 2 * 60_000)
    return
  }
  running = true
  queuedDuringRun = false
  window.clearTimeout(timer)
  try {
    for (let pass = 0, again = true; again && pass < 5; pass++) {
      again = false
      for (const upload of pending()) {
        try {
          if (await uploadOne(upload)) again = true
        } catch (err) {
          // No signal or a server hiccup: tried again shortly.
          console.warn('Video clip upload failed', err)
        }
      }
    }
  } finally {
    running = false
    if (queuedDuringRun) void runUploads()
    else if (pending().length) timer = window.setTimeout(() => void runUploads(), 2 * 60_000)
  }
}

async function fileBlob(fileUrl: string): Promise<Blob> {
  return (await fetch(Capacitor.convertFileSrc(fileUrl))).blob()
}

async function put(path: string, blob: Blob, contentType: string) {
  const { error } = await supabase.storage
    .from(VIDEOS_BUCKET)
    .upload(path, new Blob([blob], { type: contentType }), { contentType, upsert: true })
  if (error) throw error
}

/** True when it has to go again (trimmed while uploading). */
async function uploadOne(upload: VideoUpload): Promise<boolean> {
  const forget = () => setPending(pending().filter((u) => u.itemId !== upload.itemId))
  const { clip } = await VideoClips.info({ id: upload.itemId })
  if (!clip) {
    // Deleted, or recorded on another phone: nothing to send.
    forget()
    return false
  }
  const { startMs, endMs } = upload
  const base = `${upload.userId}/${upload.sessionId}/${upload.itemId}-${startMs}-${endMs}`
  const [{ path: cut }, { frames: stills }] = await Promise.all([
    VideoClips.exportTrimmed({ id: upload.itemId, startMs, endMs }),
    VideoClips.keyFrames({ id: upload.itemId, startMs, endMs }),
  ])
  const frames: { path: string; atMs: number }[] = []
  for (const [i, still] of stills.entries()) {
    const path = `${base}-k${i}.jpg`
    await put(path, await fileBlob(still.path), 'image/jpeg')
    frames.push({ path, atMs: still.atMs })
  }
  const videoPath = `${base}.mp4`
  await put(videoPath, await fileBlob(cut), 'video/mp4')
  const files = [videoPath, ...frames.map((f) => f.path)]

  // Trimmed again (or deleted) meanwhile: this cut is out of date.
  const now = pending().find((u) => u.itemId === upload.itemId)
  if (!now || now.startMs !== startMs || now.endMs !== endMs) {
    void supabase.storage.from(VIDEOS_BUCKET).remove(files)
    return !!now
  }

  const uploaded: UploadedVideo = { videoPath, posterPath: frames[0]?.path, frames }
  await db.patchVideoUpload(upload.sessionId, upload.itemId, uploaded)
  const stored = readJson<Record<string, string[]>>(FILES_KEY, {})
  const previous = (stored[upload.itemId] ?? []).filter((p) => !files.includes(p))
  stored[upload.itemId] = files
  writeJson(FILES_KEY, stored)
  if (previous.length) void supabase.storage.from(VIDEOS_BUCKET).remove(previous)
  onUploaded?.(upload.sessionId, upload.itemId, uploaded)
  forget()
  return false
}
