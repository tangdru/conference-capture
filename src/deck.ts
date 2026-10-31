import type { Session } from './types'

/** Whether anything was captured (notes, photos, transcript, enrichment)
 * after the session's presentation was last generated. */
export function hasContentSinceDeck(session: Session): boolean {
  const generatedAt = session.deckGeneratedAt
  if (generatedAt === null) return true
  return session.items.some((item) => item.timestamp > generatedAt)
}

/** Whether a presentation has never been made but could be -- the session
 * has notes, photos or transcript to build it from. */
export function isReadyToGenerate(session: Session): boolean {
  return (
    session.deckStatus === 'none' &&
    session.items.some((item) => item.type === 'note' || item.type === 'photo' || item.type === 'transcript')
  )
}
