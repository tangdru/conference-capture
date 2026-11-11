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

/** The page without anything around the HTML document: Claude sometimes
 * wraps it in a markdown fence ("```html" ... "```"), which a browser shows
 * as text at the top. Keep in step with cleanPage in generate-deck. */
export function cleanDeckHtml(html: string): string {
  let page = html.trim()
  page = page.replace(/^```[a-z]*[ \t]*\r?\n/i, '').replace(/\r?\n?```\s*$/, '')
  const start = page.search(/<!doctype html|<html[\s>]/i)
  if (start > 0) page = page.slice(start)
  const end = page.toLowerCase().lastIndexOf('</html>')
  if (end !== -1) page = page.slice(0, end + '</html>'.length)
  return page === html.trim() ? html : page
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
 * PHOTO_MAX_SIDE. A photo that can't be fetched right now (no signal) keeps
 * its link; one that was deleted from the session since the page was built
 * is taken out, with its caption, rather than left as a broken image. */
export async function compactDeckPhotos(html: string): Promise<string> {
  const links = [...new Set(html.match(PHOTO_LINK) ?? [])]
  // Done before: every photo is in the page and already scaled down.
  if (!links.length && html.includes(COMPACT_MARK)) return html
  const sources = [...new Set(html.match(/data:image\/jpe?g;base64,[A-Za-z0-9+/=]+/g) ?? [])]
  let result = html
  const smaller = await inParallel(sources, (src) => shrinkJpeg(src).catch(() => null))
  sources.forEach((src, i) => {
    const small = smaller[i]
    if (small && small.length < src.length) result = result.split(src).join(small)
  })
  // All at once rather than one by one: on a phone network each fetch is
  // mostly waiting.
  const gone: string[] = []
  let failed = false
  const embedded = await inParallel(links, (link) =>
    embedPhoto(link).catch((err) => {
      if (err instanceof PhotoGone) gone.push(link)
      else failed = true
      return null
    }),
  )
  links.forEach((link, i) => {
    const data = embedded[i]
    if (data) result = result.split(link).join(data)
  })
  if (gone.length) result = withoutPhotos(result, gone)
  return failed ? result : markCompact(result)
}

const COMPACT_MARK = '<meta name="cc-photos-embedded" content="1">'

function markCompact(html: string): string {
  if (html.includes(COMPACT_MARK)) return html
  const head = /<head[^>]*>/i.exec(html)
  return head ? html.replace(head[0], `${head[0]}${COMPACT_MARK}`) : html
}

/** Runs `work` on every item, a few at a time, results in order. */
async function inParallel<T, R>(items: T[], work: (item: T) => Promise<R>, limit = 6): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await work(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

class PhotoGone extends Error {}

async function embedPhoto(link: string): Promise<string> {
  const response = await fetch(link)
  if (!response.ok) {
    // Storage answers a link to a deleted file with "not found" (as a 400 or
    // 404); anything else -- an expired link, a server hiccup -- may work later.
    const body = await response.text().catch(() => '')
    if (response.status === 404 || /not.?found/i.test(body)) throw new PhotoGone(link)
    throw new Error(`Photo fetch failed (${response.status})`)
  }
  const url = URL.createObjectURL(await response.blob())
  try {
    return await shrinkJpeg(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** The page without the photos at these links: each <img>, and the figure
 * (with its caption) it sits in, if any. */
function withoutPhotos(html: string, links: string[]): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const wanted = new Set(links)
  doc.querySelectorAll('img').forEach((img) => {
    if (!wanted.has(img.getAttribute('src') ?? '')) return
    const figure = img.closest('figure')
    ;(figure ?? img).remove()
  })
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html)?.[0] ?? '<!DOCTYPE html>'
  return `${doctype}\n${doc.documentElement.outerHTML}`
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

// Added only for viewing (never to the saved or shared file). In the app a
// presentation shows in a sealed frame, where a tap on a chapter link
// (href="#...") tries to load a new page and leaves the frame blank; this
// turns those taps into scrolls. And a page Claude wrote with no side margins
// gets some, so text doesn't touch the screen edge.
const VIEWING_FIXES = `<script>(function(){
document.addEventListener('click',function(e){
  var a=e.target&&e.target.closest?e.target.closest('a[href^="#"]'):null;
  if(!a)return;
  e.preventDefault();
  var id=decodeURIComponent(a.getAttribute('href').slice(1));
  var t=id?(document.getElementById(id)||document.getElementsByName(id)[0]):null;
  if(!t&&id)return;
  var y=window.scrollY;
  if(t)t.scrollIntoView({behavior:'smooth',block:'start'});else window.scrollTo({top:0,behavior:'smooth'});
  setTimeout(function(){if(window.scrollY===y){if(t)t.scrollIntoView({block:'start'});else window.scrollTo(0,0);}},400);
},true);
function margins(){
  var els=document.querySelectorAll('h1,h2,h3,p,li');
  for(var i=0;i<els.length&&i<40;i++){
    var r=els[i].getBoundingClientRect();
    if(r.width>0&&(r.left<8||window.innerWidth-r.right<8)){
      var s=document.createElement('style');
      s.textContent='html,body{box-sizing:border-box}body{padding-left:max(20px,env(safe-area-inset-left))!important;padding-right:max(20px,env(safe-area-inset-right))!important}';
      document.head.appendChild(s);
      return;
    }
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',margins);else margins();
})()</script>`

/** The page as shown in the app's viewer or a browser tab: with the viewing
 * fixes above. Not for saving or sharing. */
export function viewingHtml(html: string): string {
  const close = html.toLowerCase().lastIndexOf('</body>')
  return close === -1 ? html + VIEWING_FIXES : html.slice(0, close) + VIEWING_FIXES + html.slice(close)
}
