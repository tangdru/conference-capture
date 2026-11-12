import type { Session } from './types'

/** How long a paused session stays in the home screen's active slot after
 * its last real activity (a capture, or a status change) before it drops
 * back into the regular list. There's no explicit "end" action -- a session
 * just fades out of the spotlight once nothing's happening. */
const INACTIVITY_MS = 3 * 60 * 1000

export function lastActivityAt(session: Session): number {
  const itemTimes = session.items.map((i) => i.timestamp)
  return Math.max(session.updatedAt, session.startedAt, ...itemTimes)
}

/** Whether a session should be treated as "in progress" for display
 * purposes -- actively recording, or paused recently enough that it's
 * still probably the thing the user is mid-session with. */
export function isSessionActive(session: Session, now: number): boolean {
  if (session.status === 'recording') return true
  if (session.status === 'suspended') {
    // A presentation built since the last capture means the talk is done:
    // the session joins the list (where a tap opens the presentation).
    const last = lastActivityAt(session)
    if (session.deckStatus === 'ready' && session.deckGeneratedAt !== null && session.deckGeneratedAt >= last) return false
    return now - last < INACTIVITY_MS
  }
  return false
}

/** Time recorded so far: earlier spans plus the one running now. */
export function elapsedFor(session: Session, now: number): number {
  const live = session.status === 'recording' && session.liveSpanStartedAt
    ? now - session.liveSpanStartedAt
    : 0
  return session.accumulatedMs + live
}
