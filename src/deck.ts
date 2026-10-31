import type { Session } from './types'

/** Whether anything was captured (notes, photos, transcript, enrichment)
 * after the session's presentation was last generated. */
export function hasContentSinceDeck(session: Session): boolean {
  const generatedAt = session.deckGeneratedAt
  if (generatedAt === null) return true
  return session.items.some((item) => item.timestamp > generatedAt)
}
