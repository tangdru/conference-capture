import { useEffect, useSyncExternalStore } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import * as db from './db'
import { getSessionOptions } from './sessionOptions'
import type { NativeVideoClip } from './native/nativeCamera'
import type { VideoItem } from './types'

// Video clips: recorded by holding the camera's shutter (VideoClips.swift),
// kept on the phone that recorded them, where they can be played, trimmed
// and saved to Photos. The clip's id is its timeline entry's id.
// See design/plans/2026-11-15-video-clips-plan.md.

/** Bridge to ios/App/App/VideoClipsPlugin.swift -- only in the native build. */
interface VideoClipsPlugin {
  info(options: { id: string }): Promise<{ clip?: NativeVideoClip }>
  exportTrimmed(options: { id: string; startMs: number; endMs: number }): Promise<{ path: string }>
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
  return db.addVideoClip(sessionId, userId, clip)
}

export async function setVideoTrim(sessionId: string, item: VideoItem): Promise<void> {
  await db.updateVideoClip(sessionId, item)
}

export async function removeVideoClip(id: string): Promise<void> {
  local.delete(id)
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
      await db.updateVideoClip(sessionId, next)
    } catch {
      // Left as it was; tried again next time the session is left.
    }
  }
}
