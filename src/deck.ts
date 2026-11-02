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

// Presentations embed their photos at full camera size (a dozen photos make
// a 7 MB page, heavy to mail or send in Messages). The edge function can't
// afford to re-encode them, so the phone does it the first time the page is
// opened or shared, and saves the smaller page back.
const PHOTO_MAX_SIDE = 1600
const PHOTO_QUALITY = 0.78

/** The page with its JPEG photos scaled down to at most PHOTO_MAX_SIDE. */
export async function compactDeckPhotos(html: string): Promise<string> {
  const sources = [...new Set(html.match(/data:image\/jpe?g;base64,[A-Za-z0-9+/=]+/g) ?? [])]
  let result = html
  for (const src of sources) {
    const smaller = await shrinkJpeg(src).catch(() => null)
    if (smaller && smaller.length < src.length) result = result.split(src).join(smaller)
  }
  return result
}

async function shrinkJpeg(src: string): Promise<string> {
  const img = new Image()
  img.src = src
  await img.decode()
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', PHOTO_QUALITY)
}

/** Whether the page marks its detail (generate-deck wraps everything after
 * each chapter's opening paragraph in .cc-more), so a short version exists. */
export function hasShortVersion(html: string): boolean {
  return html.includes('cc-more')
}

/** The quick-share version: the TL;DR and each chapter's opening paragraph. */
export function shortDeckHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('.cc-more').forEach((el) => el.remove())
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
}
