import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export interface ClipInfo {
  id: string
  sessionId: string
  /** Epoch ms when the clip's audio starts. */
  startedAt: number
  durationMs: number
  /** Loudness across the clip, 0-1, for drawing its waveform. */
  peaks: number[]
  /** The part to keep (clip-button clips have spare audio either side). */
  trimStartMs?: number
  trimEndMs?: number
}

/** Bridge to ios/App/App/ClipsPlugin.swift -- only present in the native build. */
interface ClipsPlugin {
  /** Settles when the clip is saved, once the speaker finishes the thought. No
   * clip: not listening, or this tap extended the one being recorded. */
  capture(options: { id: string; sessionId: string }): Promise<{ clip?: ClipInfo }>
  /** The clip button: `before` seconds already heard plus `after` more, with
   * `margin` spare either side. Settles when saved; no clip if not listening. */
  record(options: { id: string; sessionId: string; before: number; after: number; margin: number }): Promise<{ clip?: ClipInfo }>
  /** Ends the clip being recorded now. */
  stopRecording(): Promise<void>
  setTrim(options: { id: string; startMs: number; endMs: number }): Promise<void>
  /** The kept part as its own file, for uploading: a file:// URL. */
  exportTrimmed(options: { id: string; startMs: number; endMs: number }): Promise<{ path: string }>
  info(options: { id: string }): Promise<{ clip?: ClipInfo }>
  remove(options: { id: string }): Promise<void>
  removeSession(options: { sessionId: string }): Promise<void>
  /** Rejects while the session is listening. */
  play(options: { id: string; startMs?: number; endMs?: number }): Promise<void>
  pause(): Promise<void>
  seek(options: { id: string; fraction: number }): Promise<void>
  addListener(event: 'progress', listener: (e: { id: string; fraction: number }) => void): Promise<PluginListenerHandle>
  addListener(event: 'ended', listener: (e: { id: string }) => void): Promise<PluginListenerHandle>
}

export const Clips = registerPlugin<ClipsPlugin>('Clips')
