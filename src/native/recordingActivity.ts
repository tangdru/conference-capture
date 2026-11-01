import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

/** Bridge to ios/App/App/RecordingActivityPlugin.swift -- only present in the native build. */
interface RecordingActivityPlugin {
  /** Shows the Live Activity for this session, or updates it. Times are epoch ms. */
  update(options: {
    sessionId: string
    title: string
    paused: boolean
    accumulatedMs: number
    liveSince?: number
  }): Promise<void>
  end(): Promise<void>
  /** Its Pause / Resume button was tapped. */
  addListener(event: 'action', listener: (event: { action: 'pause' | 'resume' }) => void): Promise<PluginListenerHandle>
}

export const RecordingActivity = registerPlugin<RecordingActivityPlugin>('RecordingActivity')
