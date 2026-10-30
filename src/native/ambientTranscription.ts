import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export interface NativeSegment {
  text: string
  /** Epoch ms when the segment's audio started. */
  startedAt: number
  durationMs: number
}

/** Bridge to ios/App/App/AmbientTranscriptionPlugin.swift -- only present in the native build. */
interface AmbientTranscriptionPlugin {
  start(): Promise<void>
  /** Resolves once the trailing segment has been transcribed (or a safety timeout elapses). */
  stop(): Promise<void>
  addListener(event: 'segment', listener: (segment: NativeSegment) => void): Promise<PluginListenerHandle>
  /** The current segment's words so far, while it's still being heard. */
  addListener(event: 'partial', listener: (partial: { text: string }) => void): Promise<PluginListenerHandle>
  addListener(event: 'error', listener: (error: { message: string }) => void): Promise<PluginListenerHandle>
}

export const AmbientTranscription = registerPlugin<AmbientTranscriptionPlugin>('AmbientTranscription')
