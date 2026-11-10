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
// Photos taken this close together whose slide text mostly matches may be
// one slide building up step by step (see groupSlideRuns).
const SAME_SLIDE_GAP_MS = 3 * 60 * 1000
const SAME_SLIDE_OVERLAP = 0.5
// Choosing between them runs beside the first round's other work; past this,
// every photo goes in rather than hold up the presentation.
const PICK_PHOTOS_MS = 75_000
// A build that hasn't said it's still going for this long has stopped (the
// app uses the same window): it no longer holds up the queue.
const BUILD_SILENCE_MS = 6 * 60 * 1000
// Claude's "too many requests" (and "overloaded"): wait and try again this
// many times before giving up.
const RATE_LIMIT_RETRIES = 4

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
  skipRepeatSlides: boolean
  voice: 'neutral' | 'first_person' | 'brief'
  language: string
  saveSummary: boolean
  saveActionItems: boolean
  saveSpeakerBio: boolean
  saveAcronyms: boolean
  saveReferences: boolean
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
  saveSummary: true,
  saveActionItems: true,
  saveSpeakerBio: true,
  saveAcronyms: true,
  saveReferences: true,
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
  let skippedPhotos: string[] | null
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
    // And the photos it left out as repeats of the same slide, so every round
    // numbers the photos the same way.
    skippedPhotos = Array.isArray(body.skippedPhotos) ? body.skippedPhotos : null
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
  // session 'generating' before answering, so the app's next read sees it --
  // or 'queued', when another presentation on this account is still being
  // built: they're built one at a time, which keeps within Claude's limits.
  if (part === 0) {
    try {
      const start = await markGenerating(supabase, sessionId)
      if (start !== 'started') return jsonResponse({ [start]: true }, 202)
    } catch (err) {
      const message = await recordError(err)
      await startNextQueued(supabase, authHeader)
      return jsonResponse({ error: message }, 500)
    }
  }

  // The writing runs after the response, in rounds: the app polls the
  // session row for the outcome rather than waiting on this request.
  EdgeRuntime.waitUntil(
    generateDeckPart(supabase, authHeader, sessionId, part, photoLinks, options, skippedPhotos, invokedAt).catch(async (err) => {
      await recordError(err)
      // A failed build doesn't hold up the ones waiting behind it.
      await startNextQueued(supabase, authHeader)
    }),
  )
  return jsonResponse({ started: true }, 202)
})

/** Starts this session's build ('started'), or queues it behind another one
 * still being built on the account ('queued'). A session already being built
 * is left alone ('already'): the app may ask again for one the server has
 * just taken from the queue. */
async function markGenerating(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
): Promise<'started' | 'queued' | 'already'> {
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

  // Only this account's sessions are visible here (RLS).
  const recent = new Date(Date.now() - BUILD_SILENCE_MS).toISOString()
  const { data: building, error: buildingError } = await supabase
    .from('cc_sessions')
    .select('id')
    .eq('deck_status', 'generating')
    .gt('deck_heartbeat_at', recent)
  if (buildingError) throw buildingError
  if ((building ?? []).some((r) => r.id === sessionId)) return 'already'
  const now = new Date().toISOString()
  if ((building ?? []).length > 0) {
    // deck_heartbeat_at holds when it was queued, so the queue keeps order.
    const { error: queueError } = await supabase
      .from('cc_sessions')
      .update({ deck_status: 'queued', deck_error: null, deck_heartbeat_at: now })
      .eq('id', sessionId)
    if (queueError) throw queueError
    console.log(`generate-deck: ${sessionId} queued behind ${building!.map((r) => r.id).join(', ')}`)
    return 'queued'
  }

  const { error: updateError } = await supabase
    .from('cc_sessions')
    .update({ deck_status: 'generating', deck_error: null, deck_heartbeat_at: now })
    .eq('id', sessionId)
  if (updateError) throw updateError

  // Two asked for at the same moment both find nothing building above. Each
  // has now marked itself, so look again: only the earliest goes ahead, and
  // the other waits its turn.
  const { data: racing, error: racingError } = await supabase
    .from('cc_sessions')
    .select('id')
    .eq('deck_status', 'generating')
    .gt('deck_heartbeat_at', recent)
    .order('deck_heartbeat_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
  if (racingError) throw racingError
  const first = racing?.[0]?.id
  if (first && first !== sessionId) {
    const { error: queueError } = await supabase
      .from('cc_sessions')
      .update({ deck_status: 'queued' })
      .eq('id', sessionId)
    if (queueError) throw queueError
    console.log(`generate-deck: ${sessionId} queued behind ${first} (asked for at the same time)`)
    return 'queued'
  }
  return 'started'
}

/** Starts the presentation that has waited longest in this account's queue,
 * if any. Best effort: the app also starts it when it sees a queue with
 * nothing building (e.g. this request's sign-in had run out). */
async function startNextQueued(supabase: ReturnType<typeof createClient>, authHeader: string): Promise<void> {
  try {
    const { data: next } = await supabase
      .from('cc_sessions')
      .select('id')
      .eq('deck_status', 'queued')
      .order('deck_heartbeat_at', { ascending: true })
      .limit(1)
    const id = next?.[0]?.id
    if (!id) return
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-deck`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
      },
      body: JSON.stringify({ sessionId: id }),
    })
    console.log(`generate-deck: started queued ${id} (${res.status})`)
  } catch (err) {
    console.error('startNextQueued failed:', err)
  }
}

/** A Claude request, sent again after a wait when Claude says it's getting
 * too many (429) or is overloaded (529). */
async function claudeFetch(body: Record<string, unknown>): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })
    if ((response.status !== 429 && response.status !== 529) || attempt >= RATE_LIMIT_RETRIES) return response
    const after = Number(response.headers.get('retry-after'))
    const waitMs = Math.min(30_000, Number.isFinite(after) && after > 0 ? after * 1000 : 10_000 * (attempt + 1))
    console.log(`Claude ${response.status}; trying again in ${waitMs / 1000}s`)
    await response.body?.cancel().catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }
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
  givenSkipped: string[] | null,
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

  // A page at a time: Supabase returns at most 1000 rows per request, and a
  // long workshop passes that.
  const loadItems = async () => {
    // deno-lint-ignore no-explicit-any -- rows as the untyped client returns them
    const rows: any[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('cc_timeline_items')
        .select('id, type, subtype, payload, text, caption, photo_path, item_timestamp, excluded, starred, position, placement_locked')
        .eq('session_id', sessionId)
        .order('item_timestamp', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + 999)
      if (error) throw error
      rows.push(...(data ?? []))
      if (!data || data.length < 1000) return rows
    }
  }
  let allItemRows = await loadItems()

  const options: PresentationOptions = givenOptions ?? await loadOptions(supabase, session.owner_id)

  // A session the user never named gets one from its content, first, so the
  // card shows it while the deck builds and the deck itself uses it. Side by
  // side with it: the entries saved into the session, and moving notes and
  // photos the user hasn't placed to the moment they're about.
  let title: string = session.title
  let skipped: string[] = givenSkipped ?? []
  if (part === 0) {
    const live = allItemRows.filter((r) => !r.excluded)
    const needsName = !title.trim() || title.trim() === DEFAULT_TITLE
    // A slide that builds up step by step, photographed at each step, goes in
    // once: Claude keeps the photos that show something the others don't.
    const candidates = choosePhotos(live.filter((r) => r.type === 'photo' && r.photo_path), options)
    const picking = options.skipRepeatSlides && candidates.length > 1
    if (picking) await linkPhotos(supabase, candidates, photoLinks)
    const [named, changed, picked] = await Promise.all([
      needsName
        ? nameSession(
          live.filter((r) => r.type === 'note' && r.text),
          live.filter((r) => r.type === 'transcript' && r.text),
          live.filter((r) => r.type === 'photo' && r.photo_path),
          live.filter((r) => r.type === 'enrichment' && r.payload),
        ).catch((err) => {
          console.error('nameSession failed:', err)
          return null
        })
        : Promise.resolve(null),
      organizeSession(supabase, session, allItemRows, options).catch((err) => {
        // The presentation still gets built without it.
        console.error('organizeSession failed:', err)
        return false
      }),
      picking
        ? withTimeout(
          pickSlidePhotos(candidates.map((r) => ({ ...r, url: photoLinks[r.photo_path] })), session.started_at),
          PICK_PHOTOS_MS,
        ).catch((err) => {
          // Every photo goes in, as before.
          console.error('pickSlidePhotos failed:', err)
          return [] as string[]
        })
        : Promise.resolve([] as string[]),
    ])
    skipped = picked
    if (named) {
      title = named
      await supabase.from('cc_sessions').update({ title }).eq('id', sessionId)
    }
    if (changed) allItemRows = await loadItems()
  }

  const itemRows = allItemRows.filter((r) => !r.excluded)
  const notes = itemRows.filter((r) => r.type === 'note' && r.text)
  const transcriptSegments = itemRows.filter((r) => r.type === 'transcript' && r.text)
  const photoRows = itemRows.filter((r) => r.type === 'photo' && r.photo_path)
  const enrichmentRows = itemRows.filter((r) => r.type === 'enrichment' && r.payload)
  const highlightRows = itemRows.filter((r) => r.type === 'highlight')

  // Links, not the photos themselves: a function has too little memory to
  // hold a session's worth of photos. Claude fetches them from the link, and
  // every round reuses the same links so the prompt stays cached.
  const chosenPhotoRows = choosePhotos(photoRows, options)
  await linkPhotos(supabase, chosenPhotoRows, photoLinks)
  const skippedSet = new Set(skipped)
  const deckPhotoRows = chosenPhotoRows.filter((r) => !skippedSet.has(r.id))
  const allPhotos: DeckPhoto[] = deckPhotoRows.map((row, i) => ({
    id: row.id,
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
  // From every photo, shown in the page or not (a repeat slide, or photos
  // left out): a QR code's link belongs in the references either way.
  const qrLinksText = formatQrLinks(session.started_at, photoRows)
  const { text, finished } = await callClaude(
    title, session.started_at, notes, transcriptSegments, enrichmentRows, photos, highlightsText, qrLinksText,
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
      body: JSON.stringify({ sessionId, part: part + 1, photoLinks, options, skippedPhotos: skipped }),
    })
    if (!next.ok) throw new Error(`Couldn't continue the presentation (${next.status})`)
    return
  }

  if (!written.trim()) throw new Error('Claude returned no presentation content')
  const page = stripCodeFence(written.trim())
  // The slide Claude named as the talk's most telling image, for the card.
  const coverPlaceholder = /<meta\s+name=["']cc-cover["']\s+content=["'](PHOTO_\d+)["']/i.exec(page)?.[1]
  const coverPhotoId = photos.find((p) => p.placeholder === coverPlaceholder)?.id ?? null
  const finalHtml = substitutePhotos(page, photos)

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
      deck_cover_photo_id: coverPhotoId,
      deck_read_minutes: readMinutes(page),
    })
    .eq('id', sessionId)

  if (part > 0) await supabase.storage.from(DECKS_BUCKET).remove([partialPath])
  await startNextQueued(supabase, authHeader)
}

/** The photos the options put in the presentation: all, starred, or none. */
function choosePhotos<T extends { starred: boolean | null }>(rows: T[], options: PresentationOptions): T[] {
  if (options.photos === 'none') return []
  return options.photos === 'starred' ? rows.filter((r) => r.starred) : rows
}

/** Adds a link to `photoLinks` for each photo that doesn't have one yet. */
async function linkPhotos(
  supabase: ReturnType<typeof createClient>,
  rows: { photo_path: string }[],
  photoLinks: Record<string, string>,
): Promise<void> {
  const missing = [...new Set(rows.map((r) => r.photo_path).filter((path) => !photoLinks[path]))]
  if (missing.length === 0) return
  const { data: signed, error } = await supabase.storage.from(PHOTOS_BUCKET).createSignedUrls(missing, PHOTO_LINK_SECONDS)
  if (error) throw error
  for (const link of signed ?? []) {
    if (link.error || !link.path || !link.signedUrl) throw new Error(link.error ?? "Couldn't link a photo")
    photoLinks[link.path] = link.signedUrl
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: number | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Gave up after ${ms / 1000}s`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
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
  /** The photo's timeline item. */
  id: string
  placeholder: string
  url: string
  caption: string
  slideText: string
  elapsed: string
  starred: boolean
  /** Whether Claude is sent the image, not just its details. */
  shown: boolean
}

/** Runs of photos taken one after another that may be the same slide: close
 * in time, and mostly the same slide text (or, with no text to go on, a few
 * seconds apart). Returns runs of indexes into `photos`, in order. */
function groupSlideRuns(photos: { text: string | null; item_timestamp: string }[]): number[][] {
  const words = photos.map((p) =>
    new Set((p.text ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3)))
  // Words on many photos are the screen around the slide (a meeting app's
  // "Talking: ...", the speaker's name, a footer), not the slide itself. A
  // slide built up in a few steps repeats its own words a few times, so only
  // words on at least 6 photos count.
  const seen = new Map<string, number>()
  for (const set of words) for (const w of set) seen.set(w, (seen.get(w) ?? 0) + 1)
  const common = new Set([...seen].filter(([, n]) => n >= 6 && n > photos.length * 0.3).map(([w]) => w))
  const slideWords = words.map((set) => new Set([...set].filter((w) => !common.has(w))))

  const runs: number[][] = []
  photos.forEach((p, i) => {
    const run = runs[runs.length - 1]
    if (run) {
      const gap = new Date(p.item_timestamp).getTime() - new Date(photos[i - 1].item_timestamp).getTime()
      const a = slideWords[i - 1]
      const b = slideWords[i]
      const shared = [...a].filter((w) => b.has(w)).length
      const smaller = Math.min(a.size, b.size)
      const sameText = smaller >= 3 && shared / smaller >= SAME_SLIDE_OVERLAP
      const bothBlank = a.size < 3 && b.size < 3 && gap <= 30_000
      if (gap <= SAME_SLIDE_GAP_MS && (sameText || bothBlank)) {
        run.push(i)
        return
      }
    }
    runs.push([i])
  })
  return runs
}

/** Ids of photos to leave out of the presentation because another photo of
 * the same slide shows everything they do (a later step of a slide that
 * builds up, or a repeat). Claude looks at each run of likely repeats;
 * starred photos are always kept, and anything unclear is kept. */
async function pickSlidePhotos(
  photos: { id: string; url: string; text: string | null; caption: string | null; item_timestamp: string; starred: boolean | null }[],
  startedAt: string,
): Promise<string[]> {
  const runs = groupSlideRuns(photos).filter((run) => run.length > 1)
  if (runs.length === 0) return []
  // Past 20 images the API's size limit is stricter than our photos meet, so
  // each request holds at most 20; a longer run is looked at in parts.
  const pieces = runs.flatMap((run) => {
    const parts: number[][] = []
    for (let i = 0; i < run.length; i += MAX_PHOTOS_SHOWN) parts.push(run.slice(i, i + MAX_PHOTOS_SHOWN))
    return parts.filter((part) => part.length > 1)
  })
  const batches: number[][][] = []
  for (const piece of pieces) {
    const batch = batches[batches.length - 1]
    if (batch && batch.flat().length + piece.length <= MAX_PHOTOS_SHOWN) batch.push(piece)
    else batches.push([piece])
  }

  const dropped: string[] = []
  // A few requests at a time.
  for (let i = 0; i < batches.length; i += 6) {
    const results = await Promise.all(batches.slice(i, i + 6).map((batch) => pickInBatch(batch)))
    dropped.push(...results.flat())
  }
  const starred = new Set(photos.filter((p) => p.starred).map((p) => p.id))
  const skipped = dropped.filter((id) => !starred.has(id))
  console.log(`pickSlidePhotos: ${runs.length} runs, leaving out ${skipped.length} of ${photos.length} photos`)
  return skipped

  async function pickInBatch(batch: number[][]): Promise<string[]> {
    const labels = new Map<string, string>()
    const content: Record<string, unknown>[] = [{
      type: 'text',
      text: `An attendee photographed slides during a conference talk. Below are groups of photos taken one after another that may show the same slide. A slide that builds up (bullets or parts appearing one step at a time) is often photographed at every step, and a slide is sometimes photographed twice.

For each group, decide which photos the attendee's write-up doesn't need: a photo is redundant only when another photo in the SAME group shows the same slide with everything it shows (a later, fuller step of the build, or a clearer shot of the same thing). Keep any photo that shows something no other photo in its group shows: a different slide, a step whose content is replaced rather than added to, or a different part of a page. When unsure, keep it. Ignore the video-call window, cursor and room around the slide.`,
    }]
    batch.forEach((piece, g) => {
      content.push({ type: 'text', text: `Group ${g + 1}:` })
      piece.forEach((index, n) => {
        const photo = photos[index]
        const label = `G${g + 1}P${n + 1}`
        labels.set(label, photo.id)
        content.push({ type: 'text', text: `${label} (taken at ${formatElapsed(startedAt, photo.item_timestamp)}):` })
        content.push({ type: 'image', source: { type: 'url', url: photo.url } })
      })
    })
    content.push({
      type: 'text',
      text: 'Return ONLY a JSON object {"redundant": [labels]}, e.g. {"redundant": ["G1P1", "G1P2"]}, or {"redundant": []}. No markdown fences, no commentary.',
    })

    const response = await claudeFetch({
      model: NAMING_MODEL,
      thinking: { type: 'between_tools' },
      max_tokens: 2000,
      messages: [{ role: 'user', content }],
    })
    if (!response.ok) throw new Error(`Claude API ${response.status}: ${(await response.text()).slice(0, 300)}`)
    const data: { content?: { type: string; text?: string }[] } = await response.json()
    const raw = data.content?.find((b) => b.type === 'text')?.text?.trim() ?? ''
    const result = JSON.parse(raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')) as { redundant?: unknown }
    const redundant = Array.isArray(result.redundant) ? result.redundant : []
    const ids = redundant.map((label) => labels.get(String(label))).filter((id): id is string => !!id)
    // Never every photo of a group: one always stays.
    return batch.flatMap((piece) => {
      const groupIds = piece.map((index) => photos[index].id)
      const out = ids.filter((id) => groupIds.includes(id))
      return out.length >= groupIds.length ? out.slice(0, -1) : out
    })
  }
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

/** Every link decoded from a QR code on the session's photos, with when it
 * was shown -- each once. */
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

/** A photo's on-device text as one line for the prompt, capped so a dense
 * slide can't crowd out the rest of the session. QR codes the phone decoded
 * ("QR code: <link>" lines) are kept whole and listed on their own. */
function formatSlideText(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const codes = lines.filter((l) => l.startsWith('QR code: ')).map((l) => l.slice('QR code: '.length))
  const flat = lines.filter((l) => !l.startsWith('QR code: ')).join(' / ')
  const qr = codes.length ? ` -- QR code on it links to: ${codes.join(', ')}` : ''
  if (!flat) return qr
  return ` -- text on it: "${flat.length > 600 ? `${flat.slice(0, 600)}…` : flat}"${qr}`
}

async function callClaude(
  title: string,
  startedAt: string,
  notes: { text: string | null; item_timestamp: string; starred?: boolean }[],
  transcriptSegments: { text: string | null; item_timestamp: string; starred?: boolean }[],
  enrichmentRows: { subtype: string | null; payload: Record<string, unknown> | null }[],
  photos: DeckPhoto[],
  highlightsText: string,
  qrLinksText: string,
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

Links from QR codes on the attendee's photos (decoded on the phone, so exact):
${qrLinksText}

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
  const response = await claudeFetch({
    model: ANTHROPIC_MODEL,
    max_tokens: 48000,
    stream: true,
    messages,
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
    'Work acronym expansions into the text where each term first appears, not as a list.',
    'In the <head>, add <meta name="cc-cover" content="PHOTO_n"> naming the ONE photo that best shows what this talk was about -- a key chart, diagram, result or core idea -- never the title slide, an agenda, a photo of the speaker or audience, or a thank-you/questions slide. The app shows it as the talk\'s thumbnail. Leave the tag out if there are no photos.',
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

type EntryKind = 'summary' | 'action_items' | 'speaker_bio' | 'acronyms' | 'references'

interface SessionRow {
  id: string
  type: string
  subtype: string | null
  text: string | null
  caption: string | null
  item_timestamp: string
  excluded: boolean
  position: number | null
  placement_locked: boolean
}

/** One quick Claude call that, while the presentation is built:
 *  - saves the summary, action items, speaker bio, acronyms and references
 *    into the session as entries (each kind the options ask for; one the
 *    user left out is kept as it is, otherwise it replaces the last build's);
 *  - moves each note and photo the user hasn't placed to just after the
 *    spoken line it's about (a note is often typed a little after). Entries
 *    the user dragged (placement_locked, or a position from an older app)
 *    and the transcript never move.
 * Returns whether the session changed. */
async function organizeSession(
  supabase: ReturnType<typeof createClient>,
  session: { id: string; owner_id: string; started_at: string },
  allRows: SessionRow[],
  options: PresentationOptions,
): Promise<boolean> {
  const wanted: Record<EntryKind, boolean> = {
    summary: options.saveSummary,
    action_items: options.saveActionItems,
    speaker_bio: options.saveSpeakerBio,
    acronyms: options.saveAcronyms,
    references: options.saveReferences,
  }
  const existing = allRows.filter((r) => r.type === 'enrichment')
  const kinds = (Object.keys(wanted) as EntryKind[]).filter((kind) =>
    wanted[kind] && !existing.some((r) => r.subtype === kind && r.excluded))

  const rows = allRows.filter((r) => !r.excluded)
  const spoken = rows.filter((r) => r.type === 'transcript' && r.text)
  const movable = rows.filter((r) =>
    (r.type === 'note' ? !!r.text : r.type === 'photo' && !!(r.text || r.caption)) &&
    !r.placement_locked && r.position === null)
  if (kinds.length === 0 && (movable.length === 0 || spoken.length === 0)) return false

  // Every line tagged with its elapsed time; spoken lines numbered (L1, L2...)
  // so a placement can name one, and movable notes and photos carry an id.
  const lineNumber = new Map(spoken.map((r, i) => [r.id, i + 1]))
  const movableIds = new Set(movable.map((r) => r.id))
  const lines = rows
    .filter((r) => (r.type === 'note' && r.text) || (r.type === 'transcript' && r.text) || (r.type === 'photo' && (r.text || r.caption)))
    .map((r) => {
      const at = `[${formatElapsed(session.started_at, r.item_timestamp)}]`
      const tag = movableIds.has(r.id) ? ` id=${r.id}` : ''
      if (r.type === 'transcript') return `${at} L${lineNumber.get(r.id)} SPEAKER: ${r.text}`
      if (r.type === 'note') return `${at} NOTE${tag}: ${r.text}`
      return `${at} SLIDE PHOTO${tag}${r.caption ? ` (caption: ${r.caption})` : ''}${formatSlideText(r.text ?? '')}`
    })
  if (lines.length === 0) return false
  // About 40k tokens; past that, the start of the talk matters most.
  const material = lines.join('\n').slice(0, 160_000)

  const asks: Record<EntryKind, string> = {
    summary: 'summary: 2 or 3 plain sentences on what the talk was actually about.',
    action_items: 'actionItems: commitments or follow-ups the SPEAKER made (e.g. "I\'ll share the slides", "it ships in Q2"), not things the attendee should do. Each {text, context}: the commitment and brief surrounding context. [] if none.',
    speaker_bio: 'speakerBio: only if the content shows who the speaker is (a self-introduction, or a title or intro slide): {name, role, org, description} with a one-line description; empty string for any part not stated. null if the speaker\'s identity isn\'t established -- never guess.',
    acronyms: 'acronyms: acronyms or jargon used but not explained by the speaker (skip ones they define). Each {term, expansion}. [] if none.',
    references: 'references: papers, books, tools, products or URLs the speaker or slides explicitly named. Each {title, source, description, url}: source is the author, publisher or site; description one line; url only if one was actually given, else null. A link from a QR code on a slide photo counts as given: list each one with that exact url, titled by what the slide says it\'s for. [] if none.',
  }
  const keyFor: Record<EntryKind, string> = {
    summary: 'summary', action_items: 'actionItems', speaker_bio: 'speakerBio', acronyms: 'acronyms', references: 'references',
  }
  const tasks = kinds.map((k) => asks[k])
  const keys = kinds.map((k) => keyFor[k])
  const placing = movable.length > 0 && spoken.length > 0
  if (placing) {
    tasks.push('placements: for EVERY note and slide photo that has an id=, the spoken line (L number) it is about. A note is often typed, and a photo taken, a little after the moment it refers to, so look for the line whose subject matches rather than trusting its time. Each {id, after}: after is that line\'s number (e.g. 12), or null if no line is a better match than where it already is.')
    keys.push('placements')
  }

  const response = await claudeFetch({
    model: NAMING_MODEL,
    thinking: { type: 'between_tools' },
    max_tokens: 6000,
    messages: [{
      role: 'user',
      content: `Below is what an attendee captured during one conference talk, in order, each line tagged with its elapsed time: their NOTEs, the SPEAKER's words (transcribed on the phone, so some words may be wrong; numbered L1, L2...), and text read off SLIDE PHOTOs.

${material}

Do the following, grounded strictly in what's above -- never invent, and never pad a list from filler or small talk:
${tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Return ONLY one JSON object with exactly these keys: ${keys.join(', ')}. No markdown fences, no commentary.`,
    }],
  })
  if (!response.ok) throw new Error(`Claude API ${response.status}: ${(await response.text()).slice(0, 300)}`)
  const data: { content?: { type: string; text?: string }[] } = await response.json()
  const raw = data.content?.find((b) => b.type === 'text')?.text?.trim() ?? ''
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  const result = JSON.parse(json) as Record<string, unknown>
  let changed = false

  // Placements: just after the named line, a millisecond apart when several
  // land on the same line, in the order they were captured.
  if (placing && Array.isArray(result.placements)) {
    const spokenByNumber = new Map(spoken.map((r, i) => [i + 1, r]))
    const nextSpoken = new Map(spoken.map((r, i) => [r.id, spoken[i + 1]]))
    const perLine = new Map<number, SessionRow[]>()
    for (const p of result.placements as { id?: unknown; after?: unknown }[]) {
      const row = movable.find((r) => r.id === p.id)
      const line = typeof p.after === 'number' ? spokenByNumber.get(p.after) : undefined
      if (!row || !line) continue
      const list = perLine.get(p.after as number) ?? []
      list.push(row)
      perLine.set(p.after as number, list)
    }
    const updates: { id: string; at: string }[] = []
    for (const [n, list] of perLine) {
      const line = spokenByNumber.get(n)!
      const base = new Date(line.item_timestamp).getTime()
      const next = nextSpoken.get(line.id)
      const room = next ? new Date(next.item_timestamp).getTime() - base : Infinity
      list.sort((a, b) => a.item_timestamp.localeCompare(b.item_timestamp))
      list.forEach((row, i) => {
        // Inside the gap before the next spoken line, so it reads right after.
        const offset = Math.min(1 + i, Math.max(0, room - 1) * ((i + 1) / (list.length + 1)))
        const at = new Date(base + Math.max(offset, 0.001)).toISOString()
        if (at !== new Date(row.item_timestamp).toISOString()) updates.push({ id: row.id, at })
      })
    }
    for (const u of updates) {
      const { error } = await supabase.from('cc_timeline_items').update({ item_timestamp: u.at }).eq('id', u.id)
      if (error) throw error
    }
    if (updates.length) changed = true
    console.log(`organizeSession: ${session.id} moved ${updates.length} of ${movable.length} notes/photos`)
  }

  if (kinds.length === 0) return changed

  const list = (key: string) => (Array.isArray(result[key]) ? (result[key] as Record<string, unknown>[]) : [])
  const payloads: Partial<Record<EntryKind, Record<string, unknown> | null>> = {}
  if (kinds.includes('summary')) {
    payloads.summary = typeof result.summary === 'string' && result.summary.trim() ? { text: result.summary.trim() } : null
  }
  if (kinds.includes('action_items')) {
    const items = list('actionItems').filter((i) => typeof i.text === 'string' && i.text)
      .map((i) => ({ text: String(i.text), context: String(i.context ?? '') }))
    payloads.action_items = items.length ? { items } : null
  }
  if (kinds.includes('speaker_bio')) {
    const bio = result.speakerBio as Record<string, unknown> | null
    payloads.speaker_bio = bio && typeof bio === 'object' && typeof bio.name === 'string' && bio.name.trim()
      ? { name: String(bio.name), role: String(bio.role ?? ''), org: String(bio.org ?? ''), description: String(bio.description ?? '') }
      : null
  }
  if (kinds.includes('acronyms')) {
    const items = list('acronyms').filter((i) => typeof i.term === 'string' && typeof i.expansion === 'string')
      .map((i) => ({ term: String(i.term), expansion: String(i.expansion) }))
    payloads.acronyms = items.length ? { items } : null
  }
  if (kinds.includes('references')) {
    const items = list('references').filter((i) => typeof i.title === 'string' && i.title)
      .map((i) => ({
        title: String(i.title),
        source: String(i.source ?? ''),
        description: String(i.description ?? ''),
        url: typeof i.url === 'string' && i.url ? i.url : null,
      }))
    payloads.references = items.length ? { items } : null
  }

  // Replace what a previous build saved for these kinds.
  const replaced = existing.filter((r) => kinds.includes(r.subtype as EntryKind)).map((r) => r.id)
  if (replaced.length > 0) {
    const { error } = await supabase.from('cc_timeline_items').delete().in('id', replaced)
    if (error) throw error
  }

  // The summary sits just before the talk's first moment; the rest go at the
  // end, a beat apart so they keep this order.
  const end = Date.now()
  const order: EntryKind[] = ['action_items', 'speaker_bio', 'acronyms', 'references']
  const newRows = (Object.entries(payloads) as [EntryKind, Record<string, unknown> | null][])
    .filter(([, payload]) => payload)
    .map(([kind, payload]) => ({
      session_id: session.id,
      owner_id: session.owner_id,
      type: 'enrichment',
      subtype: kind,
      payload,
      item_timestamp: kind === 'summary'
        ? new Date(new Date(session.started_at).getTime() - 1000).toISOString()
        : new Date(end + order.indexOf(kind) * 10).toISOString(),
    }))
  if (newRows.length > 0) {
    const { error } = await supabase.from('cc_timeline_items').insert(newRows)
    if (error) throw error
  }
  console.log(`organizeSession: ${session.id} saved ${newRows.map((r) => r.subtype).join(', ') || 'nothing'}`)
  return changed || replaced.length > 0 || newRows.length > 0
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

  const response = await claudeFetch({
    model: NAMING_MODEL,
    // Sonnet 5.5 thinks before answering unless told not to, and the
    // thinking alone used up a small token cap, leaving no title.
    thinking: { type: 'between_tools' },
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Here is what an attendee captured during one conference talk. Give the talk a title for their list of sessions: what it was about, 2 to 7 words, Title Case, no quotes or trailing punctuation. Use the talk's own title if a slide shows it. If there isn't enough here to tell what it was about, reply with exactly NONE.\n\n${material}`,
    }],
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

/** About how long the page takes to read, at 230 words a minute. */
function readMinutes(html: string): number {
  const text = html
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
  return Math.max(1, Math.round(words / 230))
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
