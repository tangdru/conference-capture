// Presentations written by Claude through the connector (prepare_presentation
// / save_presentation), built to Sparkle's own instructions and finished the
// way Sparkle finishes them, so the result is the same kind of page in the
// app. The prompt and finishing helpers below are copied from
// supabase/functions/generate-deck/index.ts -- keep them in step with it
// (presentationRequirements, formatEnrichment, formatSlideText,
// formatQrLinks, formatHighlights, readMinutes, stripCodeFence).
//
// Differences from Sparkle, because Claude here works in a chat rather than
// one API call:
//  - placeholders name the entry (PHOTO_d8ac6434, AUDIO_1f2e3d4c) rather than
//    counting (PHOTO_1), so saving finds the right file even if the session
//    changed in between;
//  - Claude looks at photos itself with get_photos, and leaves out repeat
//    shots of one slide itself, instead of separate calls doing it;
//  - an unnamed session's title comes with the save;
//  - the summary, action items etc. aren't saved back into the session as
//    entries (Sparkle's organizeSession).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DECKS_BUCKET = 'cc-decks'
const PHOTOS_BUCKET = 'cc-photos'
const VIDEOS_BUCKET = 'cc-videos'
// As Sparkle: the phone swaps these links for embedded photos the first time
// the page is opened or shared.
const PHOTO_LINK_SECONDS = 365 * 24 * 60 * 60
// Sparkle's "still building" window: a build quiet for longer has stopped.
const BUILD_SILENCE_MS = 6 * 60 * 1000
// What the app titles a session until it's renamed. Keep in step with
// src/sessionTitle.ts.
const DEFAULT_TITLE = /^Session(?: \d+ : \d{2}\/\d{2})?$/

export class DeckError extends Error {}

/** The account's Presentation options. Keep in step with
 * src/presentationOptions.ts and generate-deck. */
interface PresentationOptions {
  tldr: boolean
  quotes: boolean
  actionItems: boolean
  references: boolean
  chapterBar: boolean
  speakerBio: boolean
  chapterTimes: boolean
  motion: 'still' | 'scrolly'
  charts: 'interactive' | 'photo'
  theme: 'auto' | 'light' | 'dark'
  accent: string
  length: 'full' | 'short'
  photos: 'all' | 'starred' | 'none'
  skipRepeatSlides: boolean
  voice: 'neutral' | 'first_person' | 'brief'
  language: string
}

const DEFAULT_OPTIONS: PresentationOptions = {
  tldr: true,
  quotes: true,
  actionItems: true,
  references: true,
  chapterBar: true,
  speakerBio: true,
  chapterTimes: true,
  motion: 'still',
  charts: 'interactive',
  theme: 'auto',
  accent: 'auto',
  length: 'full',
  photos: 'all',
  skipRepeatSlides: true,
  voice: 'neutral',
  language: 'auto',
}

interface Row {
  id: string
  type: string
  subtype: string | null
  payload: Record<string, unknown> | null
  text: string | null
  caption: string | null
  photo_path: string | null
  duration_ms: number | null
  item_timestamp: string
  starred: boolean | null
}

interface Session {
  id: string
  title: string
  started_at: string
  deck_status: string
  deck_heartbeat_at: string | null
}

interface Material {
  session: Session
  options: PresentationOptions
  notes: Row[]
  transcript: Row[]
  photos: Row[]
  allPhotos: Row[]
  enrichment: Row[]
  highlights: Row[]
  clips: Row[]
}

const photoToken = (row: Row) => `PHOTO_${row.id.slice(0, 8)}`
const clipToken = (row: Row) => `AUDIO_${row.id.slice(0, 8)}`

async function loadMaterial(admin: SupabaseClient, userId: string, sessionId: string): Promise<Material> {
  const { data: session, error } = await admin
    .from('cc_sessions')
    .select('id, title, started_at, deck_status, deck_heartbeat_at')
    .eq('owner_id', userId)
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw error
  if (!session) throw new DeckError(`No session with id ${sessionId}. list_sessions shows them all.`)

  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error: itemsError } = await admin
      .from('cc_timeline_items')
      .select('id, type, subtype, payload, text, caption, photo_path, duration_ms, item_timestamp, starred')
      .eq('owner_id', userId)
      .eq('session_id', sessionId)
      .eq('excluded', false)
      .order('item_timestamp', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (itemsError) throw itemsError
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < 1000) break
  }

  const { data: settings } = await admin.from('cc_user_settings').select('presentation').eq('user_id', userId).maybeSingle()
  const options = { ...DEFAULT_OPTIONS, ...((settings?.presentation as Partial<PresentationOptions>) ?? {}) }

  const allPhotos = rows.filter((r) => r.type === 'photo' && r.photo_path)
  return {
    session: session as Session,
    options,
    notes: rows.filter((r) => r.type === 'note' && r.text),
    transcript: rows.filter((r) => r.type === 'transcript' && r.text),
    allPhotos,
    photos: options.photos === 'none' ? [] : options.photos === 'starred' ? allPhotos.filter((r) => r.starred) : allPhotos,
    enrichment: rows.filter((r) => r.type === 'enrichment' && r.payload),
    highlights: rows.filter((r) => r.type === 'highlight'),
    clips: rows.filter((r) => r.type === 'audio' && typeof r.payload?.path === 'string'),
  }
}

/** Sparkle's instructions for this session, for Claude to follow in the chat. */
export async function preparePresentation(admin: SupabaseClient, userId: string, sessionId: string): Promise<string> {
  const m = await loadMaterial(admin, userId, sessionId)
  const { session, options: o } = m
  if (m.notes.length === 0 && m.transcript.length === 0 && m.allPhotos.length === 0) {
    throw new DeckError(`"${session.title}" has nothing captured yet, so there's nothing to build a presentation from.`)
  }
  const startedAt = session.started_at
  const unnamed = !session.title.trim() || DEFAULT_TITLE.test(session.title.trim())

  const notesText = m.notes.length > 0
    ? m.notes.map((n) => `- [${formatElapsed(startedAt, n.item_timestamp)}]${n.starred ? ' ★' : ''} ${n.text}`).join('\n')
    : '(No written notes were captured -- build the piece from the transcript and photos alone.)'
  const transcriptText = m.transcript.length > 0
    ? m.transcript.map((t) => `- [${formatElapsed(startedAt, t.item_timestamp)}]${t.starred ? ' ★' : ''} ${t.text}`).join('\n')
    : '(No ambient transcript was captured for this talk.)'
  const photosText = m.photos.length > 0
    ? m.photos.map((p) => `- ${photoToken(p)} [${formatElapsed(startedAt, p.item_timestamp)}]${p.starred ? ' ★' : ''} (photo id ${p.id})${p.caption && p.caption !== 'Untitled photo' ? ` -- caption: "${p.caption}"` : ''}${formatSlideText(p.text ?? '')}`).join('\n')
    : o.photos === 'all'
      ? '(No photos were captured for this talk.)'
      : '(Photos are left out of this presentation -- use no images or photo placeholders.)'
  const clipsText = m.clips.length > 0
    ? m.clips.map((c) => {
      const { elapsed, length, said } = describeClip(startedAt, c, m.transcript)
      return `- ${clipToken(c)} [${elapsed}] (${length})${c.starred ? ' ★' : ''}${said ? ` -- said in it: "${said}"` : ''}`
    }).join('\n')
    : '(None recorded.)'

  const instructions = `You are building a web page someone can keep as a personal resource, or share with friends and colleagues, as a record of a conference talk they attended titled "${unnamed ? '(not named yet)' : session.title}". This is NOT a slide deck -- there is no click/arrow-key/swipe navigation of any kind. It reads like a well-edited article: the takeaways first, then the detail for anyone who wants it.

You are given the attendee's raw notes (taken live, so they may be fragmentary or out of order), an ambient audio transcript of the speaker (auto-transcribed on-device, so it may contain mistranscribed words or awkward phrasing -- use it for content and quotes, but don't assume every word is verbatim), photos they took during the talk (mostly slides, usually straightened square-on; where text was found on a photo it's listed with it, read on-device -- use it to quote slide titles, figures and terms accurately, allowing for the odd misread character), and enrichment already extracted from this session (summary, action items, references, speaker bio, acronyms -- already vetted, safe to use directly). Every note, transcript line, and photo below is tagged with its elapsed time into the talk (MM:SS, or H:MM:SS past the hour) -- this is real data about how the talk actually unfolded, not filler.

Raw notes:
${notesText}

Ambient transcript (chronological):
${transcriptText}

Extracted enrichment:
${formatEnrichment(m.enrichment)}

Photos available (look at them with the get_photos tool, ${'up to 6 per call'}, by their photo ids -- at least the starred ones, those near the key moments, and any whose slide text suggests a chart or diagram; place the rest by their elapsed time and text; use every photo all the same):
${photosText}

Moments the attendee marked "Remember this" (tapped live, as it happened):
${formatHighlights(startedAt, m.highlights, m.transcript, m.notes)}

Audio clips the attendee recorded of the speaker (their own voice, about a minute each; what was said in each is from the transcript):
${clipsText}

Links from QR codes on the attendee's photos (decoded on the phone, so exact):
${formatQrLinks(startedAt, m.allPhotos)}

Requirements:
${presentationRequirements(o)}`

  const extra: string[] = [
    `Photo and audio placeholders here name their entry (like ${m.photos[0] ? photoToken(m.photos[0]) : 'PHOTO_1a2b3c4d'}): use them exactly as listed wherever the requirements mention placeholders like PHOTO_1 or AUDIO_1.`,
  ]
  if (o.photos !== 'none' && o.skipRepeatSlides && m.photos.length > 1) {
    extra.push('A slide that builds up step by step is often photographed at every step, and a slide is sometimes photographed twice. Leave a photo out only when another photo of the SAME slide shows everything it does (a later, fuller step, or a clearer shot); keep any photo that shows something the others don\'t, and always keep ★ photos. When unsure, keep it.')
  }
  if (unnamed) extra.push('This session has no name yet. Give the talk a short, specific title (its real title if the slides or transcript show it), use it on the page, and pass it as title to save_presentation.')
  extra.push(
    `When the page is finished, call save_presentation with session_id ${session.id} and the complete HTML document as html. That puts it on the session in the Conference Capture app, as if Sparkle had made it, replacing any earlier presentation. Write the whole page before saving: don't show it to the user first unless they asked to review it.`,
  )

  const existing = session.deck_status === 'ready' ? '\n\nThis session already has a presentation; saving replaces it.' : ''
  return `${instructions}\n\nWorking in this chat:\n${extra.map((e) => `- ${e}`).join('\n')}${existing}`
}

/** Finishes a page the way Sparkle does and puts it on the session. */
export async function savePresentation(
  admin: SupabaseClient,
  userId: string,
  sessionId: string,
  html: string,
  title: string,
): Promise<string> {
  const m = await loadMaterial(admin, userId, sessionId)
  const { session } = m
  const heartbeat = session.deck_heartbeat_at ? new Date(session.deck_heartbeat_at).getTime() : 0
  if (session.deck_status === 'generating' && Date.now() - heartbeat < BUILD_SILENCE_MS) {
    throw new DeckError(`Sparkle is building a presentation for "${session.title}" in the app right now. Try saving again once it's done; saving then replaces it.`)
  }

  const page = stripCodeFence(html)
  if (!/<html[\s>]/i.test(page) || !/<\/html>/i.test(page)) {
    throw new DeckError('That isn\'t a complete HTML document (from <!doctype html> to </html>). Send the whole page.')
  }

  // Link only the photos and clips the page uses.
  const usedPhotos = m.allPhotos.filter((p) => page.includes(photoToken(p)))
  const usedClips = m.clips.filter((c) => page.includes(clipToken(c)))
  const photoLinks = await signedLinks(admin, PHOTOS_BUCKET, usedPhotos.map((p) => p.photo_path!))
  const clipLinks = await signedLinks(admin, VIDEOS_BUCKET, usedClips.map((c) => String(c.payload!.path)))
  const replacements = [
    ...usedPhotos.filter((p) => photoLinks[p.photo_path!]).map((p) => ({ placeholder: photoToken(p), url: photoLinks[p.photo_path!] })),
    ...usedClips.filter((c) => clipLinks[String(c.payload!.path)]).map((c) => ({ placeholder: clipToken(c), url: clipLinks[String(c.payload!.path)] })),
  ]
  const unknown = [...new Set(page.match(/\b(?:PHOTO|AUDIO)_[0-9a-f]{8}\b/g) ?? [])].filter(
    (t) => !replacements.some((r) => r.placeholder === t),
  )

  const coverToken = /<meta\s+name=["']cc-cover["']\s+content=["'](PHOTO_[0-9a-f]{8})["']/i.exec(page)?.[1]
  const coverPhotoId = usedPhotos.find((p) => photoToken(p) === coverToken)?.id ?? null
  const finalHtml = substitutePhotos(page, replacements)

  const { data: owner } = await admin.from('cc_sessions').select('owner_id').eq('id', sessionId).single()
  const deckPath = `${owner!.owner_id}/${sessionId}/deck.html`
  const { error: uploadError } = await admin.storage
    .from(DECKS_BUCKET)
    .upload(deckPath, new Blob([finalHtml], { type: 'text/html' }), { contentType: 'text/html', upsert: true })
  if (uploadError) throw uploadError

  const unnamed = !session.title.trim() || DEFAULT_TITLE.test(session.title.trim())
  const newTitle = unnamed && title ? title.slice(0, 200) : null
  const minutes = readMinutes(page)
  const { error: updateError } = await admin
    .from('cc_sessions')
    .update({
      deck_status: 'ready',
      deck_path: deckPath,
      deck_generated_at: new Date().toISOString(),
      deck_error: null,
      deck_cover_photo_id: coverPhotoId,
      deck_read_minutes: minutes,
      ...(newTitle ? { title: newTitle } : {}),
    })
    .eq('id', sessionId)
    .eq('owner_id', userId)
  if (updateError) throw updateError

  const shownTitle = newTitle ?? session.title
  const notes = [
    `Saved. "${shownTitle}" now has this presentation in the Conference Capture app (about ${minutes} min to read, ${usedPhotos.length} photo${usedPhotos.length === 1 ? '' : 's'}${usedClips.length ? `, ${usedClips.length} audio clip${usedClips.length === 1 ? '' : 's'}` : ''}${coverPhotoId ? ', with a cover photo' : ''}).`,
  ]
  if (newTitle) notes.push(`The session was renamed "${newTitle}".`)
  if (unknown.length) notes.push(`These placeholders didn't match any photo or clip in the session and were left as they are: ${unknown.join(', ')}.`)
  return notes.join(' ')
}

async function signedLinks(admin: SupabaseClient, bucket: string, paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths)]
  if (unique.length === 0) return {}
  const { data, error } = await admin.storage.from(bucket).createSignedUrls(unique, PHOTO_LINK_SECONDS)
  if (error) throw error
  const links: Record<string, string> = {}
  for (const link of data ?? []) if (link.path && link.signedUrl && !link.error) links[link.path] = link.signedUrl
  return links
}

function describeClip(startedAt: string, r: Row, transcript: Row[]): { elapsed: string; length: string; said: string } {
  const p = r.payload ?? {}
  const clipStart = typeof p.startedAt === 'number' ? p.startedAt : new Date(r.item_timestamp).getTime()
  const trimStart = Number(p.trimStartMs ?? 0)
  const trimEnd = Number(p.trimEndMs ?? r.duration_ms ?? 0)
  const from = clipStart + trimStart
  const to = clipStart + trimEnd
  const said = transcript
    .filter((t) => {
      const at = new Date(t.item_timestamp).getTime()
      return at >= from - 5_000 && at <= to
    })
    .map((t) => t.text)
    .join(' ')
  const seconds = Math.max(0, Math.round((trimEnd - trimStart) / 1000))
  return {
    elapsed: formatElapsed(startedAt, new Date(from).toISOString()),
    length: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    said,
  }
}

// ---- Copied from generate-deck (keep in step) ------------------------------

function formatElapsed(startedAtIso: string, itemIso: string): string {
  const totalSec = Math.max(0, Math.round((new Date(itemIso).getTime() - new Date(startedAtIso).getTime()) / 1000))
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = (totalSec % 60).toString().padStart(2, '0')
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

function formatQrLinks(startedAt: string, photoRows: { text?: string | null; item_timestamp: string }[]): string {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const row of photoRows) {
    for (const line of (row.text ?? '').split('\n')) {
      if (!line.startsWith('QR code: ')) continue
      const link = line.slice('QR code: '.length).trim()
      if (!link || seen.has(link)) continue
      seen.add(link)
      lines.push(`- [${formatElapsed(startedAt, row.item_timestamp)}] ${link}`)
    }
  }
  return lines.length ? lines.join('\n') : '(None.)'
}

function formatSlideText(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const codes = lines.filter((l) => l.startsWith('QR code: ')).map((l) => l.slice('QR code: '.length))
  const flat = lines.filter((l) => !l.startsWith('QR code: ')).join(' / ')
  const qr = codes.length ? ` -- QR code on it links to: ${codes.join(', ')}` : ''
  if (!flat) return qr
  return ` -- text on it: "${flat.length > 600 ? `${flat.slice(0, 600)}…` : flat}"${qr}`
}

function formatHighlights(
  startedAt: string,
  highlights: { item_timestamp: string }[],
  transcriptSegments: { text: string | null; item_timestamp: string }[],
  notes: { text: string | null; item_timestamp: string }[],
): string {
  if (highlights.length === 0) return '(None marked.)'
  return highlights.map((h) => {
    const at = new Date(h.item_timestamp).getTime()
    const near = (iso: string) => {
      const t = new Date(iso).getTime()
      return t >= at - 90_000 && t <= at + 20_000
    }
    const said = transcriptSegments.filter((t) => near(t.item_timestamp)).map((t) => t.text).join(' ')
    const noted = notes.filter((n) => near(n.item_timestamp)).map((n) => `"${n.text}"`).join('; ')
    return `- [${formatElapsed(startedAt, h.item_timestamp)}]${said ? ` -- being said around it: "${said}"` : ''}${noted ? ` -- noted around it: ${noted}` : ''}`
  }).join('\n')
}

function formatEnrichment(rows: { subtype: string | null; payload: Record<string, unknown> | null }[]): string {
  if (rows.length === 0) return '(No enrichment was extracted for this session.)'
  const lines: string[] = []
  for (const row of rows) {
    const p = row.payload ?? {}
    switch (row.subtype) {
      case 'summary':
        lines.push(`Summary: ${p.text}`)
        break
      case 'speaker_bio':
        lines.push(`Speaker: ${p.name} -- ${p.role} at ${p.org}. ${p.description}`)
        break
      case 'action_items':
        for (const item of (Array.isArray(p.items) ? p.items : []) as { text: string; context: string }[]) {
          lines.push(`Action item: ${item.text} (context: ${item.context})`)
        }
        break
      case 'references':
        for (const item of (Array.isArray(p.items) ? p.items : []) as { title: string; source: string; description: string; url: string | null }[]) {
          lines.push(`Reference: ${item.title} -- ${item.source}. ${item.description}${item.url ? ` (${item.url})` : ''}`)
        }
        break
      case 'acronyms':
        for (const item of (Array.isArray(p.items) ? p.items : []) as { term: string; expansion: string }[]) {
          lines.push(`Acronym: ${item.term} = ${item.expansion}`)
        }
        break
    }
  }
  return lines.map((l) => `- ${l}`).join('\n')
}

function presentationRequirements(o: PresentationOptions): string {
  const times = o.chapterTimes
  const structure: string[] = []
  structure.push(`Title block: the talk title${o.speakerBio ? ', the speaker (from the speaker bio, if present)' : ''} and a one-sentence intro of what the talk was about. Compact -- not a full-screen hero.${o.speakerBio ? '' : ' Leave out who the speaker is and their bio.'}`)
  if (o.tldr) {
    structure.push(`TL;DR: the 3 to 6 takeaways someone should leave with, each one or two sentences, so a reader who stops here has the whole point. Build it from the extracted summary if present, and make sure the key moments (below) are in it.${o.quotes ? " Then 2 or 3 of the speaker's strongest lines from the transcript as quotes (no times), tidied only where the transcription garbled a word." : ''}${o.actionItems ? ' Put the action items here too, as a short list, if there are any.' : ''}`)
  }
  if (o.chapterBar) {
    structure.push(`Chapter bar: a header that sticks to the top of the screen once the reader scrolls past the ${o.tldr ? 'TL;DR' : 'title block'}, linking to each chapter by anchor (#id). One row: on a narrow screen it scrolls sideways rather than wrapping. Short chapter names${times ? ', and the chapter\'s elapsed time (e.g. "12:40") beside each' : ''}. With JavaScript, highlight the chapter currently being read; without it, the links still work. Give each chapter heading scroll-margin-top so the bar doesn't cover it after a jump.`)
  }
  const chapterBody = o.length === 'short'
    ? 'Keep it short: each chapter is its heading and one paragraph that sums the chapter up, plus at most one photo or chart if it is essential. No further detail.'
    : 'Open each chapter with its heading and one paragraph that sums the chapter up on its own; wrap everything after that paragraph (further paragraphs, photos, quotes, charts) in a single <div class="cc-more">. The app removes those divs to make a short version for quick sharing, so the page must read well without them, and nothing outside them may point into them.'
  structure.push(`Chapters: the talk divided into 3 to 8 chapters in the order it actually unfolded, each with a heading${times ? ' and its starting elapsed time' : ''}. Synthesize and organize the notes and transcript into clear prose -- don't dump either source verbatim. Use the transcript to fill gaps the notes left out${o.quotes ? ' and to surface direct quotes worth calling out' : ''}, but let the notes drive what the attendee found important. ${chapterBody}`)
  const closing: string[] = []
  if (o.actionItems && !o.tldr) closing.push('the action items, as a short list, if there are any')
  if (o.references) closing.push('the references (as links where there\'s a URL -- including every link from a QR code on a photo, titled by what the slide says it\'s for) and anything else worth following up on')
  if (closing.length) structure.push(`A short closing section with ${closing.join(', then ')}.`)

  const keyMomentsWhere = o.tldr ? 'belongs in the TL;DR and gets a callout in its chapter' : 'gets a callout in its chapter'
  const rules: string[] = [
    'Return ONLY a single complete HTML document -- no markdown fences, no commentary before or after.',
    'The document must be fully self-contained: all CSS and JavaScript inline in the file, no external resources except Google Fonts if you want them.',
    `Page structure, in this order:\n${structure.map((item, i) => `  ${i + 1}. ${item}`).join('\n')}`,
    'Text never overlaps a photo or chart: no text on top of images, no sticky or pinned backgrounds that text scrolls over, no full-bleed image with a caption laid across it. Every photo and chart sits in the flow of the page with its caption below it.',
    o.quotes
      ? `Quotes: set the speaker's own words apart wherever they appear -- ${o.tldr ? 'in the TL;DR and ' : ''}as pull quotes in the chapters -- with a distinct, consistent style that fits the theme (larger or contrasting type, an accent rule or oversized quotation mark${o.speakerBio ? ', the speaker\'s name beneath when known' : ''}). Never put a time on a quote. Keep each one short: a sentence or two.`
      : "No quote callouts: don't set the speaker's words apart as pull quotes; work their points into the prose.",
    o.motion === 'scrolly'
      ? 'Scrollytelling: as the reader scrolls, each chapter\'s heading, paragraphs, photos, quotes and charts ease into place (short, gentle fades and slides, each triggered once as it enters the screen, using IntersectionObserver). Charts may build as they come into view. The page must still be complete without JavaScript and with prefers-reduced-motion: reduce -- add the hidden starting state from script, never from CSS alone, so nothing is invisible if the script doesn\'t run. No parallax and no scroll-jacking: the page scrolls normally.'
      : 'No decorative motion: no fade-ins or slide-ins as things scroll into view, no parallax, no scroll progress bar. Everything is simply there when the reader arrives.',
    o.charts === 'interactive'
      ? 'Charts: when the talk presented a data visualization (a chart, graph or diagram of data on a slide, or one the speaker described), rebuild it in the page as an interactive inline-SVG chart using the real numbers shown -- hover or tap to read exact values, and toggles, filters or a short animated build where that helps explain what the speaker was showing. Put it next to the photo of that slide, and note under it that it\'s a recreation from the talk. Never invent numbers: if the values on the slide can\'t be read, show the photo alone. If the talk had no data visualizations, the page has no interactive charts.'
      : 'Charts: don\'t rebuild charts or make anything interactive; show the photo of the slide and describe what it showed in the text.',
    `The "Remember this" moments are the attendee's own signal of what mattered most. Each one ${keyMomentsWhere}, built from what was being said and shown at that point (a tap usually lands just after the thing it marks, so the transcript just before it is usually what it's about). Don't label them with the phrase "Remember this"; just let them read as the key moments. If there are none, ignore this.`,
    `Notes, transcript lines and photos marked ★ were starred by the attendee afterwards as entries that mattered most. Give them the same weight as the "Remember this" moments: ${o.tldr ? 'in the TL;DR and ' : ''}called out in their chapter. Don't show the ★ itself or call them "starred".`,
    'Place each photo in the chapter that matches its elapsed time (not an appendix dumped at the end), full width of the text column, never cropped so a slide\'s content is cut off. Reference EACH photo using an <img> tag whose src is EXACTLY its placeholder token, e.g. <img src="PHOTO_1">. Do not invent placeholder names and do not attempt to embed real image data yourself.',
    'Audio clips (if any are listed): place each one in the chapter that matches its elapsed time, at the point in the text where what\'s said in it fits, as <figure class="cc-audio"><audio controls preload="metadata" src="AUDIO_1"></audio><figcaption>...</figcaption></figure> -- the src EXACTLY its placeholder token. The caption is one line saying what the speaker says in the clip: a short quote of their strongest words in it, or a brief paraphrase if the transcript is garbled. No time in the caption. The clips are recordings the attendee chose to keep, so mark them clearly as the speaker\'s voice (e.g. a small "Listen" label or speaker icon) and style the player to fit the theme, the full width of the text column. Use every clip once; don\'t invent placeholders.',
    'Work acronym expansions into the text where each term first appears, not as a list.',
    'In the <head>, add <meta name="cc-cover" content="PHOTO_n"> naming the ONE photo that best shows what this talk was about -- a key chart, diagram, result or core idea -- never the title slide, an agenda, a photo of the speaker or audience, or a thank-you/questions slide. The app shows it as the talk\'s thumbnail. Leave the tag out if there are no photos.',
    `${o.theme === 'auto' ? 'Pick a visual theme (color palette, type) that fits the subject matter of the talk.' : `Use a ${o.theme} theme (${o.theme === 'dark' ? 'dark background, light text' : 'light background, dark text'}), with type that fits the subject of the talk.`}${/^#[0-9a-fA-F]{6}$/.test(o.accent) ? ` Use ${o.accent} as the accent color (links, rules, highlights, chart emphasis), adjusted only if needed for readable contrast.` : ''} Keep it tasteful and readable: a comfortable text column (about 65 characters wide), generous spacing, legibility over spectacle. On a narrow phone screen keep at least 20px between all text and the left and right edges of the screen (padding on the page or its main column), so nothing touches the edge.`,
  ]
  if (!times) rules.push("Don't show elapsed times (like 12:40) anywhere on the page.")
  if (o.voice === 'first_person') rules.push("Voice: write as the attendee's own notes, in the first person (\"I came away with...\", \"The speaker showed us...\").")
  if (o.voice === 'brief') rules.push('Voice: write for a busy reader -- short sentences, plain words, bullet points where they help, no flourishes.')
  rules.push(o.language === 'auto'
    ? 'Write in the language the talk was given in.'
    : `Write the whole page in ${o.language}, including headings, the chapter bar and captions. Translate quotes too, and note once near the top that quotes are translated.`)
  rules.push(
    `The file gets shared and opened in many places -- Safari, Chrome, email attachments, and the iOS Files/Messages quick-look preview, which does NOT run JavaScript. The page must be fully readable with JavaScript disabled: all text, photos, charts and chapter links visible and working.${o.charts === 'interactive' ? ' Draw every chart as static SVG markup in the HTML so it shows without scripts, and let script add the interaction on top.' : ''}`,
    "Let the page itself scroll: the document/window is the scroller. Don't put the content inside a fixed-height element with its own overflow scrolling, and don't set overflow: hidden on html or body.",
  )
  return rules.map((r) => `- ${r}`).join('\n')
}

function readMinutes(html: string): number {
  const text = html
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
  return Math.max(1, Math.round(words / 230))
}

function stripCodeFence(text: string): string {
  let page = text.trim()
  page = page.replace(/^```[a-z]*[ \t]*\r?\n/i, '').replace(/\r?\n?```\s*$/, '')
  const start = page.search(/<!doctype html|<html[\s>]/i)
  if (start > 0) page = page.slice(start)
  const end = page.toLowerCase().lastIndexOf('</html>')
  if (end !== -1) page = page.slice(0, end + '</html>'.length)
  return page
}

function substitutePhotos(html: string, photos: { placeholder: string; url: string }[]): string {
  let result = html
  for (const photo of photos) {
    result = result.split(`"${photo.placeholder}"`).join(`"${photo.url}"`)
    result = result.split(`'${photo.placeholder}'`).join(`'${photo.url}'`)
  }
  return result
}
