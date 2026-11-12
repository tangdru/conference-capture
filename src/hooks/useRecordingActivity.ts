import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { RecordingActivity } from '../native/recordingActivity'
import type { Session } from '../types'

/** Mirrors the live session's recording state into a Live Activity (Lock
 * Screen and Dynamic Island) and hands its Pause / Resume button back. Up
 * while it records (on any screen) and through pauses; gone once `session`
 * is null. Native build only. */
export function useRecordingActivity(session: Session | null, onPause: () => void, onResume: () => void): void {
  const handlersRef = useRef({ onPause, onResume })
  useEffect(() => {
    handlersRef.current = { onPause, onResume }
  }, [onPause, onResume])

  const native = Capacitor.isNativePlatform()
  const shownRef = useRef(false)
  const recording = session?.status === 'recording'
  const paused = session?.status === 'suspended'

  useEffect(() => {
    if (!native) return
    if (session && (recording || (paused && shownRef.current))) {
      shownRef.current = true
      void RecordingActivity.update({
        sessionId: session.id,
        title: session.title.trim() || 'Session',
        paused: !recording,
        accumulatedMs: session.accumulatedMs,
        liveSince: recording ? (session.liveSpanStartedAt ?? Date.now()) : undefined,
      }).catch(() => {})
    } else if (shownRef.current) {
      shownRef.current = false
      void RecordingActivity.end().catch(() => {})
    }
  }, [native, recording, paused, session?.id, session?.title, session?.accumulatedMs, session?.liveSpanStartedAt])

  useEffect(() => {
    if (!native) return
    return () => {
      if (shownRef.current) void RecordingActivity.end().catch(() => {})
      shownRef.current = false
    }
  }, [native])

  useEffect(() => {
    if (!native) return
    const handle = RecordingActivity.addListener('action', ({ action }) => {
      if (action === 'pause') handlersRef.current.onPause()
      else handlersRef.current.onResume()
    })
    return () => {
      void handle.then((h) => h.remove())
    }
  }, [native])
}
