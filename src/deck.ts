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

// The edge function can't hold or re-encode photos, so a new presentation
// links to them. The phone embeds them the first time the page is opened or
// shared, scaled down, and saves that page back: it then works offline and
// outlasts the links. Older presentations embed full-size photos; those get
// scaled down the same way.
const PHOTO_MAX_SIDE = 1600
const PHOTO_QUALITY = 0.78
const PHOTO_LINK = /https:\/\/[^"'\s)]+\/storage\/v1\/object\/sign\/cc-photos\/[^"'\s)]+/g

/** Whether the page still links to photos rather than embedding them. */
export function hasPhotoLinks(html: string): boolean {
  return html.search(PHOTO_LINK) !== -1
}

/** The page with its photos embedded and scaled down to at most
 * PHOTO_MAX_SIDE. A photo that can't be fetched keeps its link. */
export async function compactDeckPhotos(html: string): Promise<string> {
  const sources = [...new Set(html.match(/data:image\/jpe?g;base64,[A-Za-z0-9+/=]+/g) ?? [])]
  let result = html
  for (const src of sources) {
    const smaller = await shrinkJpeg(src).catch(() => null)
    if (smaller && smaller.length < src.length) result = result.split(src).join(smaller)
  }
  for (const link of new Set(html.match(PHOTO_LINK) ?? [])) {
    const embedded = await embedPhoto(link).catch(() => null)
    if (embedded) result = result.split(link).join(embedded)
  }
  return result
}

async function embedPhoto(link: string): Promise<string> {
  const response = await fetch(link)
  if (!response.ok) throw new Error(`Photo fetch failed (${response.status})`)
  const url = URL.createObjectURL(await response.blob())
  try {
    return await shrinkJpeg(url)
  } finally {
    URL.revokeObjectURL(url)
  }
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
