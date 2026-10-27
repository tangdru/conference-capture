import { useEffect, useRef } from 'react'

/** Keeps the screen awake while `active` is true, via the Wake Lock API.
 * Without this, the OS dims/locks the screen during normal "just sitting and
 * listening" use, which on iOS Safari suspends the tab and silently kills
 * ambient transcription mid-session. Best-effort only: does nothing (no
 * error surfaced) on browsers without Wake Lock support, or if the OS
 * refuses the lock (e.g. Low Power Mode). */
export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let released = false

    async function acquire() {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (released) {
          lock.release().catch(() => {})
          return
        }
        lockRef.current = lock
      } catch {
        // Ignored -- the visibilitychange listener below gets another
        // chance once the page is next visible/foregrounded.
      }
    }

    acquire()

    // The lock is auto-released by the browser whenever the document loses
    // visibility (tab/app switch) and is NOT automatically reacquired when
    // it becomes visible again -- do that ourselves.
    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && !lockRef.current) acquire()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      lockRef.current?.release().catch(() => {})
      lockRef.current = null
    }
  }, [active])
}
