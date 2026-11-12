import { useEffect, useSyncExternalStore } from 'react'
import { Capacitor } from '@capacitor/core'
import { Clips, type ClipInfo } from './native/clips'

// Audio clips, saved on the phone keyed by their entry's id: the clip button's
// (whose kept part also uploads -- see audioClips.ts) and, from builds before
// 65, the ones "Remember this" saved, which stay on the phone.

const native = Capacitor.isNativePlatform()

export type ClipState = ClipInfo | 'saving' | null
export interface Playback {
  id: string | null
  playing: boolean
  fraction: number
}

const clips = new Map<string, ClipState>()
let playback: Playback = { id: null, playing: false, fraction: 0 }
const listeners = new Set<() => void>()

function changed() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setClip(id: string, state: ClipState) {
  clips.set(id, state)
  changed()
}

function setPlayback(next: Playback) {
  playback = next
  changed()
}

if (native) {
  void Clips.addListener('progress', ({ id, fraction }) => {
    if (playback.id === id) setPlayback({ ...playback, fraction })
  })
  void Clips.addListener('ended', ({ id }) => {
    if (playback.id === id) setPlayback({ id: null, playing: false, fraction: 0 })
  })
}

/** Keeps what's in the audio buffer as this highlight's clip. */
export async function saveClip(id: string, sessionId: string): Promise<void> {
  if (!native) return
  setClip(id, 'saving')
  const { clip } = await Clips.capture({ id, sessionId }).catch(() => ({ clip: undefined }))
  setClip(id, clip ?? null)
}

export function useClip(id: string): ClipState {
  useEffect(() => {
    if (!native || clips.has(id)) return
    void Clips.info({ id })
      .then(({ clip }) => setClip(id, clip ?? null))
      .catch(() => setClip(id, null))
  }, [id])
  return useSyncExternalStore(subscribe, () => clips.get(id) ?? null)
}

export function usePlayback(): Playback {
  return useSyncExternalStore(subscribe, () => playback)
}

/** Rejects while the session is listening. `range` (ms): play only that part. */
export async function togglePlay(id: string, range?: { startMs: number; endMs: number }): Promise<void> {
  if (playback.id === id && playback.playing) {
    await Clips.pause()
    setPlayback({ ...playback, playing: false })
    return
  }
  await Clips.play({ id, ...range })
  setPlayback({ id, playing: true, fraction: playback.id === id ? playback.fraction : 0 })
}

export function seekClip(id: string, fraction: number): void {
  if (playback.id === id) void Clips.seek({ id, fraction })
}

/** A clip just saved on this phone (the clip button's). */
export function noteClipSaved(clip: ClipInfo): void {
  setClip(clip.id, clip)
}

/** Notes a new trim on the phone, so the waveform shows it next time too. */
export function trimClip(id: string, startMs: number, endMs: number): void {
  const clip = clips.get(id)
  if (clip && clip !== 'saving') setClip(id, { ...clip, trimStartMs: startMs, trimEndMs: endMs })
  if (native) void Clips.setTrim({ id, startMs, endMs }).catch(() => {})
}

// Clips whose kept part still has to upload (audioClips.ts does it), kept
// across restarts. Here so deleting an entry can drop it without a loop of
// imports.
const UPLOADS_KEY = 'cc-clip-uploads'

export interface ClipUpload {
  itemId: string
  sessionId: string
  userId: string
}

export function pendingClipUploads(): ClipUpload[] {
  try {
    return JSON.parse(localStorage.getItem(UPLOADS_KEY) ?? '[]') as ClipUpload[]
  } catch {
    return []
  }
}

export function setPendingClipUploads(list: ClipUpload[]): void {
  try {
    localStorage.setItem(UPLOADS_KEY, JSON.stringify(list))
  } catch {
    // Storage full: it uploads on the next trim or restart instead.
  }
}

export function forgetClipUpload(itemId: string): void {
  setPendingClipUploads(pendingClipUploads().filter((u) => u.itemId !== itemId))
}

export async function removeClip(id: string): Promise<void> {
  clips.delete(id)
  changed()
  if (native) await Clips.remove({ id }).catch(() => {})
}

export async function removeSessionClips(sessionId: string): Promise<void> {
  if (native) await Clips.removeSession({ sessionId }).catch(() => {})
}
