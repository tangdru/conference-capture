// Supabase Edge Function: generate-deck
//
// Given a session id, reads that session's notes and photos (scoped by the
// caller's own JWT, so Postgres RLS enforces ownership end-to-end -- this
// function never uses a service-role key), asks Claude for a themed,
// self-contained HTML page (a TL;DR, then chapters behind a sticky chapter
// bar; interactive only where the talk showed data), substitutes
// photo links in place of the placeholders Claude is asked to emit (the
// phone embeds the photos later), and uploads the result to the private
// cc-decks bucket.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const ANTHROPIC_MODEL = 'claude-opus-5-5'
// Naming is a one-line answer; a faster model keeps it from delaying the deck.
const NAMING_MODEL = 'claude-sonnet-5-5'
// What createSession titles every new session until the user renames it.
const DEFAULT_TITLE = 'Session'
const DECKS_BUCKET = 'cc-decks'
const PHOTOS_BUCKET = 'cc-photos'
// How long one round may write before handing off to the next (the free
// plan stops a function at 150s; this leaves room to save and hand off).
const ROUND_BUDGET_MS = 115_000
const MAX_ROUNDS = 8
// Past 20 images in one request the API applies a stricter size limit than
// our photos meet, so Claude sees this many; the rest go by time and slide text.
const MAX_PHOTOS_SHOWN = 20
// How long the links in a new page last. The phone swaps them for embedded
// photos the first time the page is opened or shared.
const PHOTO_LINK_SECONDS = 365 * 24 * 60 * 60

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

/** The account's Presentation options (cc_user_settings.presentation). Keep
 * in step with src/presentationOptions.ts in the app. */
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
  voice: 'neutral',
  language: 'auto',
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const invokedAt = Date.now()
  let supabase: ReturnType<typeof createClient>
  let authHeader: string
  let sessionId: string
  let part: number
  let photoLinks: Record<string, string>
  let options: PresentationOptions | null
  try {
    authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) throw new Error('Missing Authorization header')

    supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const body = await req.json()
    sessionId = body.sessionId
    if (!sessionId) throw new Error('Missing sessionId')
    part = Number.isInteger(body.part) ? body.part : 0
    photoLinks = body.photoLinks ?? {}
    // Later rounds carry the options the first round read, so a change made
    // mid-build can't split one page between two sets of options.
    options = body.options ?? null
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Bad request' }, 400)
  }

  const recordError = async (err: unknown) => {
    const message = err instanceof Error ? err.message : 'Deck generation failed'
    await supabase
      .from('cc_sessions')
      .update({ deck_status: 'error', deck_error: message })
      .eq('id', sessionId)
    return message
  }

  // The first call checks there's something to build from and marks the
  // session 'generating' before answering, so the app's next read sees it.
  if (part === 0) {
    try {
      await markGenerating(supabase, sessionId)
    } catch (err) {
      return jsonResponse({ error: await recordError(err) }, 500)
    }
  }

  // The writing runs after the response, in rounds: the app polls the
  // session row for the outcome rather than waiting on this request.
  EdgeRuntime.waitUntil(
    generateDeckPart(supabase, authHeader, sessionId, part, photoLinks, options, invokedAt).catch(recordError),
  )
  return jsonResponse({ started: true }, 202)
})

async function markGenerating(supabase: ReturnType<typeof createClient>, sessionId: string): Promise<void> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured')
  const { data: rows, error } = await supabase
    .from('cc_timeline_items')
    .select('type, text, photo_path, excluded')
    .eq('session_id', sessionId)
  if (error) throw error
  const usable = (rows ?? []).some((r) =>
    !r.excluded && (((r.type === 'note' || r.type === 'transcript') && r.text) || (r.type === 'photo' && r.photo_path)))
  if (!usable) {
    throw new Error('This session has no notes, transcript, or photos to build a presentation from')
  }
  const { error: updateError } = await supabase
    .from('cc_sessions')
    .update({ deck_status: 'generating', deck_error: null, deck_heartbeat_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (updateError) throw updateError
}

/** One round of writing the page. Supabase stops a function after 150s on
 * the free plan, and writing a whole page takes longer than that, so each
 * round writes for at most ROUND_BUDGET_MS, saves what it has, and calls
 * this function again to continue from there. */
async function generateDeckPart(
  supabase: ReturnType<typeof createClient>,
  authHeader: string,
  sessionId: string,
  part: number,
  photoLinks: Record<string, string>,
  givenOptions: PresentationOptions | null,
  invokedAt: number,
): Promise<void> {
  // The app takes silence as a crash, so each round says it's still going.
  if (part > 0) {
    await supabase.from('cc_sessions').update({ deck_heartbeat_at: new Date().toISOString() }).eq('id', sessionId)
  }

  const { data: session, error: sessionError } = await supabase
    .from('cc_sessions')
    .select('id, title, owner_id, started_at')
    .eq('id', sessionId)
    .single()
  if (sessionError) throw sessionError

  const { data: allItemRows, error: itemsError } = await supabase
    .from('cc_timeline_items')
    .select('type, subtype, payload, text, caption, photo_path, item_timestamp, excluded, starred')
    .eq('session_id', sessionId)
    .order('position', { ascending: true, nullsFirst: false })
    .order('item_timestamp', { ascending: true })
  if (itemsError) throw itemsError

  const itemRows = (allItemRows ?? []).filter((r) => !r.excluded)

  const options: PresentationOptions = givenOptions ?? await loadOptions(supabase, session.owner_id)

  const notes = itemRows.filter((r) => r.type === 'note' && r.text)
  const transcriptSegments = itemRows.filter((r) => r.type === 'transcript' && r.text)
  const photoRows = itemRows.filter((r) => r.type === 'photo' && r.photo_path)
  const enrichmentRows = itemRows.filter((r) => r.type === 'enrichment' && r.payload)
  const highlightRows = itemRows.filter((r) => r.type === 'highlight')

  // A session the user never named gets one from its content, first, so the
  // card shows it while the deck builds and the deck itself uses it.
  let title: string = session.title
  if (part === 0 && (!title.trim() || title.trim() === DEFAULT_TITLE)) {
    const named = await nameSession(notes, transcriptSegments, photoRows, enrichmentRows).catch((err) => {
      console.error('nameSession failed:', err)
      return null
    })
    if (named) {
      title = named
      await supabase.from('cc_sessions').update({ title }).eq('id', sessionId)
    }
  }

  // Links, not the photos themselves: a function has too little memory to
  // hold a session's worth of photos. Claude fetches them from the link, and
  // every round reuses the same links so the prompt stays cached.
  const missing = (options.photos === 'none' ? [] : photoRows)
    .filter((r) => options.photos !== 'starred' || r.starred)
    .map((r) => r.photo_path)
    .filter((path) => !photoLinks[path])
  if (missing.length > 0) {
    const { data: signed, error: signError } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrls(missing, PHOTO_LINK_SECONDS)
    if (signError) throw signError
    for (const link of signed ?? []) {
      if (link.error || !link.path || !link.signedUrl) throw new Error(link.error ?? "Couldn't link a photo")
      photoLinks[link.path] = link.signedUrl
    }
  }
  const deckPhotoRows = options.photos === 'none'
    ? []
    : options.photos === 'starred' ? photoRows.filter((r) => r.starred) : photoRows
  const allPhotos: DeckPhoto[] = deckPhotoRows.map((row, i) => ({
    placeholder: `PHOTO_${i + 1}`,
    url: photoLinks[row.photo_path],
    caption: row.caption ?? '',
    // Read off the photo on the phone (SlideScanner); empty if none.
    slideText: row.text ?? '',
    elapsed: formatElapsed(session.started_at, row.item_timestamp),
    starred: !!row.starred,
    shown: false,
  }))
  const photos = markPhotosShown(allPhotos)

  const partialPath = `${session.owner_id}/${sessionId}/deck.partial.html`
  let written = ''
  if (part > 0) {
    const { data: partialBlob, error: partialError } = await supabase.storage.from(DECKS_BUCKET).download(partialPath)
    if (partialError) throw partialError
    written = await partialBlob.text()
  }

  const highlightsText = formatHighlights(session.started_at, highlightRows, transcriptSegments, notes)
  const { text, finished } = await callClaude(
    title, session.started_at, notes, transcriptSegments, enrichmentRows, photos, highlightsText,
    written, invokedAt + ROUND_BUDGET_MS, options,
  )
  written += text

  if (!finished) {
    if (part + 1 >= MAX_ROUNDS) throw new Error('The presentation took too long to write')
    const { error: saveError } = await supabase.storage
      .from(DECKS_BUCKET)
      .upload(partialPath, new Blob([written], { type: 'text/plain' }), { contentType: 'text/plain', upsert: true })
    if (saveError) throw saveError
    const next = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-deck`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
      },
      body: JSON.stringify({ sessionId, part: part + 1, photoLinks, options }),
    })
    if (!next.ok) throw new Error(`Couldn't continue the presentation (${next.status})`)
    return
  }

  if (!written.trim()) throw new Error('Claude returned no presentation content')
  const finalHtml = substitutePhotos(stripCodeFence(written.trim()), photos)

  const deckPath = `${session.owner_id}/${sessionId}/deck.html`
  const { error: uploadError } = await supabase.storage
    .from(DECKS_BUCKET)
    .upload(deckPath, new Blob([finalHtml], { type: 'text/html' }), {
      contentType: 'text/html',
      upsert: true,
    })
  if (uploadError) throw uploadError

  await supabase
    .from('cc_sessions')
    .update({
      deck_status: 'ready',
      deck_path: deckPath,
      deck_generated_at: new Date().toISOString(),
      deck_error: null,
    })
    .eq('id', sessionId)

  if (part > 0) await supabase.storage.from(DECKS_BUCKET).remove([partialPath])
}

/** The account's Presentation options, with defaults for anything unset. */
async function loadOptions(supabase: ReturnType<typeof createClient>, ownerId: string): Promise<PresentationOptions> {
  const { data: settings } = await supabase
    .from('cc_user_settings')
    .select('presentation')
    .eq('user_id', ownerId)
    .maybeSingle()
  return { ...DEFAULT_OPTIONS, ...((settings?.presentation as Partial<PresentationOptions>) ?? {}) }
}

interface DeckPhoto {
  placeholder: string
  url: string
  caption: string
  slideText: string
  elapsed: string
  starred: boolean
  /** Whether Claude is sent the image, not just its details. */
  shown: boolean
}

/** Picks which photos Claude sees: starred ones first, the rest spread
 * evenly through the talk. */
function markPhotosShown(photos: DeckPhoto[]): DeckPhoto[] {
  const shown = new Set(photos.filter((p) => p.starred).slice(0, MAX_PHOTOS_SHOWN))
  const others = photos.filter((p) => !shown.has(p))
  const room = Math.min(MAX_PHOTOS_SHOWN - shown.size, others.length)
  for (let i = 0; i < room; i++) shown.add(others[Math.floor((i * others.length) / room)])
  return photos.map((p) => ({ ...p, shown: shown.has(p) }))
}

function formatElapsed(startedAtIso: string, itemIso: string): string {
  const totalSec = Math.max(0, Math.round((new Date(itemIso).getTime() - new Date(startedAtIso).getTime()) / 1000))
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = (totalSec % 60).toString().padStart(2, '0')
  // H:MM:SS past the hour (workshops, long sessions), else MM:SS.
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

/** A photo's on-device text as one line for the prompt, capped so a dense
 * slide can't crowd out the rest of the session. */
function formatSlideText(text: string): string {
  const flat = text.split('\n').map((l) => l.trim()).filter(Boolean).join(' / ')
  if (!flat) return ''
  return ` -- text on it: "${flat.length > 600 ? `${flat.slice(0, 600)}…` : flat}"`
}

async function callClaude(
  title: string,
  startedAt: string,
  notes: { text: string | null; item_timestamp: string; starred?: boolean }[],
  transcriptSegments: { text: string | null; item_timestamp: string; starred?: boolean }[],
  enrichmentRows: { subtype: string | null; payload: Record<string, unknown> | null }[],
  photos: DeckPhoto[],
  highlightsText: string,
  writtenSoFar: string,
  deadline: number,
  o: PresentationOptions,
): Promise<{ text: string; finished: boolean }> {
  const notesText = notes.length > 0
    ? notes.map((n) => `- [${formatElapsed(startedAt, n.item_timestamp)}]${n.starred ? ' ★' : ''} ${n.text}`).join('\n')
    : '(No written notes were captured -- build the piece from the transcript and photos alone.)'

  const transcriptText = transcriptSegments.length > 0
    ? transcriptSegments.map((t) => `- [${formatElapsed(startedAt, t.item_timestamp)}]${t.starred ? ' ★' : ''} ${t.text}`).join('\n')
    : '(No ambient transcript was captured for this talk.)'

  const photosText = photos.length > 0
    ? photos.map((p) => `- ${p.placeholder} [${p.elapsed}]${p.starred ? ' ★' : ''}${p.shown ? '' : ' (not shown)'}${p.caption ? ` -- caption: "${p.caption}"` : ''}${formatSlideText(p.slideText)}`).join('\n')
    : o.photos === 'all'
      ? '(No photos were captured for this talk.)'
      : '(Photos are left out of this presentation -- use no images or photo placeholders.)'

  const enrichmentText = formatEnrichment(enrichmentRows)

  const instructions = `You are building a web page someone can keep as a personal resource, or share with friends and colleagues, as a record of a conference talk they attended titled "${title}". This is NOT a slide deck -- there is no click/arrow-key/swipe navigation of any kind. It reads like a well-edited article: the takeaways first, then the detail for anyone who wants it.

You are given the attendee's raw notes (taken live, so they may be fragmentary or out of order), an ambient audio transcript of the speaker (auto-transcribed on-device, so it may contain mistranscribed words or awkward phrasing -- use it for content and quotes, but don't assume every word is verbatim), photos they took during the talk (mostly slides, usually straightened square-on; where text was found on a photo it's listed with it, read on-device -- use it to quote slide titles, figures and terms accurately, allowing for the odd misread character), and enrichment already extracted from this session (summary, action items, references, speaker bio, acronyms -- already vetted, safe to use directly). Every note, transcript line, and photo below is tagged with its elapsed time into the talk (MM:SS, or H:MM:SS past the hour) -- this is real data about how the talk actually unfolded, not filler.

Raw notes:
${notesText}

Ambient transcript (chronological):
${transcriptText}

Extracted enrichment:
${enrichmentText}

Photos available (shown to you below, in this order, except those marked "not shown" -- there were too many to send them all, so place those by their elapsed time and text; use every photo all the same):
${photosText}

Moments the attendee marked "Remember this" (tapped live, as it happened):
${highlightsText}

Requirements:
${presentationRequirements(o)}`

  const content: Record<string, unknown>[] = [{ type: 'text', text: instructions }]
  for (const photo of photos.filter((p) => p.shown)) {
    content.push({ type: 'text', text: `Here is ${photo.placeholder}:` })
    content.push({ type: 'image', source: { type: 'url', url: photo.url } })
  }
  // Every round re-sends this same prompt; caching it keeps later rounds cheap.
  content[content.length - 1].cache_control = { type: 'ephemeral' }

  // A later round shows Claude the page so far and asks for the rest.
  const messages: Record<string, unknown>[] = [{ role: 'user', content }]
  if (writtenSoFar) {
    messages.push(
      { role: 'assistant', content: writtenSoFar },
      {
        role: 'user',
        content: 'Your reply was cut off there. Continue the HTML document exactly from the last character above. Output only what comes next -- repeat nothing already written, and add no commentary or code fence.',
      },
    )
  }

  // Streamed, not one blocking request: writing a whole page takes minutes,
  // and a connection that sits silent that long gets dropped upstream (seen
  // as a Cloudflare 520 from api.anthropic.com). Streaming keeps bytes moving.
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 48000,
      stream: true,
      messages,
    }),
  })

  if (!response.ok || !response.body) {
    const errText = await response.text()
    throw new Error(`Claude API error (${response.status}): ${errText.slice(0, 500)}`)
  }

  const { text, stopReason, cutOff } = await readMessageStream(response.body, deadline)
  if (stopReason === 'refusal') {
    throw new Error('Claude declined to generate this presentation')
  }

  return { text, finished: !cutOff && stopReason !== 'max_tokens' }
}

/** The prompt's requirements, shaped by the account's Presentation options.
 * With the defaults this is the original page: TL;DR, chapter bar, chapters,
 * references; still, with interactive charts only. */
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
  if (o.references) closing.push('the references (as links where there\'s a URL) and anything else worth following up on')
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
    'Work acronym expansions into the text where each term first appears, not as a list.',
    `${o.theme === 'auto' ? 'Pick a visual theme (color palette, type) that fits the subject matter of the talk.' : `Use a ${o.theme} theme (${o.theme === 'dark' ? 'dark background, light text' : 'light background, dark text'}), with type that fits the subject of the talk.`}${/^#[0-9a-fA-F]{6}$/.test(o.accent) ? ` Use ${o.accent} as the accent color (links, rules, highlights, chart emphasis), adjusted only if needed for readable contrast.` : ''} Keep it tasteful and readable: a comfortable text column (about 65 characters wide), generous spacing, legibility over spectacle.`,
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

/** Collects the text and stop reason from a streamed Messages API response
 * (server-sent events), stopping early (cutOff) once `deadline` passes. */
async function readMessageStream(
  body: ReadableStream<Uint8Array>,
  deadline: number,
): Promise<{ text: string; stopReason: string | null; cutOff: boolean }> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let text = ''
  let stopReason: string | null = null
  for (;;) {
    let timer: number | undefined
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), Math.max(0, deadline - Date.now()))
    })
    const result = await Promise.race([reader.read(), timeout])
    clearTimeout(timer)
    if (result === null) {
      // Keep only whole events: text from a half-read line is dropped.
      await reader.cancel().catch(() => {})
      return { text, stopReason, cutOff: true }
    }
    const { done, value } = result
    if (done) break
    buffer += value
    let newline: number
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (!line.startsWith('data:')) continue
      const event = JSON.parse(line.slice(5))
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        text += event.delta.text
      } else if (event.type === 'message_delta' && event.delta?.stop_reason) {
        stopReason = event.delta.stop_reason
      } else if (event.type === 'error') {
        throw new Error(`Claude API error: ${event.error?.message ?? 'stream failed'}`)
      }
    }
  }
  return { text, stopReason, cutOff: false }
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
        for (const item of (Array.isArray(p.items) ? p.items : []) as {
          title: string
          source: string
          description: string
          url: string | null
        }[]) {
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

/** A short title for the talk from what was captured, or null if there's too
 * little to tell what it was about. */
async function nameSession(
  notes: { text: string | null }[],
  transcriptSegments: { text: string | null }[],
  photoRows: { text: string | null; caption: string | null }[],
  enrichmentRows: { subtype: string | null; payload: Record<string, unknown> | null }[],
): Promise<string | null> {
  const summary = enrichmentRows.find((r) => r.subtype === 'summary')?.payload?.text
  const slideText = photoRows.map((p) => (p.text ?? '').split('\n').slice(0, 3).join(' / ')).filter(Boolean)
  // The opening minutes usually say what the talk is; the cap keeps this quick.
  const material = [
    summary ? `Summary: ${summary}` : '',
    slideText.length ? `Text on the slides photographed (first lines of each):\n${slideText.map((t) => `- ${t}`).join('\n')}` : '',
    notes.length ? `Attendee's notes:\n${notes.map((n) => `- ${n.text}`).join('\n')}` : '',
    transcriptSegments.length ? `Transcript:\n${transcriptSegments.map((t) => t.text).join(' ')}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 12000)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: NAMING_MODEL,
      // Sonnet 5.5 thinks before answering unless told not to, and the
      // thinking alone used up a small token cap, leaving no title.
      thinking: { type: 'between_tools' },
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Here is what an attendee captured during one conference talk. Give the talk a title for their list of sessions: what it was about, 2 to 7 words, Title Case, no quotes or trailing punctuation. Use the talk's own title if a slide shows it. If there isn't enough here to tell what it was about, reply with exactly NONE.\n\n${material}`,
      }],
    }),
  })
  if (!response.ok) {
    console.error(`nameSession: Claude API ${response.status}: ${(await response.text()).slice(0, 300)}`)
    return null
  }
  const data: { content?: { type: string; text?: string }[]; stop_reason?: string } = await response.json()
  const text = data.content?.find((b) => b.type === 'text')?.text?.trim().replace(/^["'“]|["'”.]$/g, '').trim()
  if (!text || text === 'NONE' || text.length > 80) {
    console.error(`nameSession: no title (stop_reason ${data.stop_reason}, reply ${JSON.stringify(text ?? null)})`)
    return null
  }
  return text
}

/** Each "Remember this" tap with what was said and noted around it --
 * mostly the 90 seconds before, since a tap follows what it marks. */
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

function stripCodeFence(text: string): string {
  const match = text.match(/^```(?:html)?\n([\s\S]*)\n```$/)
  return match ? match[1] : text
}

function substitutePhotos(html: string, photos: { placeholder: string; url: string }[]): string {
  let result = html
  for (const photo of photos) {
    result = result.split(`"${photo.placeholder}"`).join(`"${photo.url}"`)
    result = result.split(`'${photo.placeholder}'`).join(`'${photo.url}'`)
  }
  return result
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
