import { useEffect, useSyncExternalStore } from 'react'
import { Capacitor } from '@capacitor/core'
import { Clips, type ClipInfo } from './native/clips'

// "Remember this" audio clips. For now they live on the phone only, keyed by
// their highlight's id, while we find out how room audio really sounds.

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

/** Rejects while the session is listening. */
export async function togglePlay(id: string): Promise<void> {
  if (playback.id === id && playback.playing) {
    await Clips.pause()
    setPlayback({ ...playback, playing: false })
    return
  }
  await Clips.play({ id })
  setPlayback({ id, playing: true, fraction: playback.id === id ? playback.fraction : 0 })
}

export function seekClip(id: string, fraction: number): void {
  if (playback.id === id) void Clips.seek({ id, fraction })
}

export async function removeClip(id: string): Promise<void> {
  clips.delete(id)
  changed()
  if (native) await Clips.remove({ id }).catch(() => {})
}

export async function removeSessionClips(sessionId: string): Promise<void> {
  if (native) await Clips.removeSession({ sessionId }).catch(() => {})
}
