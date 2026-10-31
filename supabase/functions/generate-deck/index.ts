// Supabase Edge Function: generate-deck
//
// Given a session id, reads that session's notes and photos (scoped by the
// caller's own JWT, so Postgres RLS enforces ownership end-to-end -- this
// function never uses a service-role key), asks Claude for a themed,
// scroll-driven, self-contained HTML page (no slide navigation -- one
// continuous scrolling narrative with real data visualization), substitutes
// real photo data in place of the placeholders Claude is asked to emit, and
// uploads the result to the private cc-decks bucket.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const ANTHROPIC_MODEL = 'claude-opus-5-5'
const DECKS_BUCKET = 'cc-decks'
const PHOTOS_BUCKET = 'cc-photos'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let supabase: ReturnType<typeof createClient>
  let sessionId: string
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const body = await req.json()
    sessionId = body.sessionId
    if (!sessionId) throw new Error('Missing sessionId')
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Bad request' }, 400)
  }

  try {
    const html = await generateDeck(supabase, sessionId)
    return jsonResponse({ deckPath: html.deckPath })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Deck generation failed'
    await supabase
      .from('cc_sessions')
      .update({ deck_status: 'error', deck_error: message })
      .eq('id', sessionId)
    return jsonResponse({ error: message }, 500)
  }
})

async function generateDeck(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
): Promise<{ deckPath: string }> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured')

  const { data: session, error: sessionError } = await supabase
    .from('cc_sessions')
    .select('id, title, owner_id, started_at')
    .eq('id', sessionId)
    .single()
  if (sessionError) throw sessionError

  const { data: allItemRows, error: itemsError } = await supabase
    .from('cc_timeline_items')
    .select('type, subtype, payload, text, caption, photo_path, item_timestamp, excluded')
    .eq('session_id', sessionId)
    .order('position', { ascending: true, nullsFirst: false })
    .order('item_timestamp', { ascending: true })
  if (itemsError) throw itemsError

  const itemRows = (allItemRows ?? []).filter((r) => !r.excluded)

  const notes = itemRows.filter((r) => r.type === 'note' && r.text)
  const transcriptSegments = itemRows.filter((r) => r.type === 'transcript' && r.text)
  const photoRows = itemRows.filter((r) => r.type === 'photo' && r.photo_path)
  const enrichmentRows = itemRows.filter((r) => r.type === 'enrichment' && r.payload)

  if (notes.length === 0 && transcriptSegments.length === 0 && photoRows.length === 0) {
    throw new Error('This session has no notes, transcript, or photos to build a presentation from')
  }

  await supabase.from('cc_sessions').update({ deck_status: 'generating', deck_error: null }).eq('id', sessionId)

  const photos: { placeholder: string; dataUrl: string; caption: string; elapsed: string }[] = []
  for (let i = 0; i < photoRows.length; i++) {
    const row = photoRows[i]
    const { data: blob, error: downloadError } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .download(row.photo_path)
    if (downloadError) throw downloadError
    const base64 = await blobToBase64(blob)
    photos.push({
      placeholder: `PHOTO_${i + 1}`,
      dataUrl: `data:${blob.type || 'image/jpeg'};base64,${base64}`,
      caption: row.caption ?? '',
      elapsed: formatElapsed(session.started_at, row.item_timestamp),
    })
  }

  const html = await callClaude(session.title, session.started_at, notes, transcriptSegments, enrichmentRows, photos)
  const finalHtml = substitutePhotos(html, photos)

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

  return { deckPath }
}

function formatElapsed(startedAtIso: string, itemIso: string): string {
  const totalSec = Math.max(0, Math.round((new Date(itemIso).getTime() - new Date(startedAtIso).getTime()) / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function callClaude(
  title: string,
  startedAt: string,
  notes: { text: string | null; item_timestamp: string }[],
  transcriptSegments: { text: string | null; item_timestamp: string }[],
  enrichmentRows: { subtype: string | null; payload: Record<string, unknown> | null }[],
  photos: { placeholder: string; dataUrl: string; caption: string; elapsed: string }[],
): Promise<string> {
  const notesText = notes.length > 0
    ? notes.map((n) => `- [${formatElapsed(startedAt, n.item_timestamp)}] ${n.text}`).join('\n')
    : '(No written notes were captured -- build the piece from the transcript and photos alone.)'

  const transcriptText = transcriptSegments.length > 0
    ? transcriptSegments.map((t) => `- [${formatElapsed(startedAt, t.item_timestamp)}] ${t.text}`).join('\n')
    : '(No ambient transcript was captured for this talk.)'

  const photosText = photos.length > 0
    ? photos.map((p) => `- ${p.placeholder} [${p.elapsed}]${p.caption ? ` -- caption: "${p.caption}"` : ''}`).join('\n')
    : '(No photos were captured for this talk.)'

  const enrichmentText = formatEnrichment(enrichmentRows)

  const instructions = `You are building a scrollytelling web page someone can keep as a personal resource, or share with friends and colleagues, as a record of a conference talk they attended titled "${title}". This is NOT a slide deck -- there is no click/arrow-key/swipe navigation of any kind. The reader scrolls continuously down one page and the page reacts to that scroll.

You are given the attendee's raw notes (taken live, so they may be fragmentary or out of order), an ambient audio transcript of the speaker (auto-transcribed on-device, so it may contain mistranscribed words or awkward phrasing -- use it for content and quotes, but don't assume every word is verbatim), photos they took during the talk (mostly slides), and enrichment already extracted from this session (summary, action items, references, speaker bio, acronyms -- already vetted, safe to use directly). Every note, transcript line, and photo below is tagged with its elapsed time into the talk (MM:SS) -- this is real data about how the talk actually unfolded, not filler.

Raw notes:
${notesText}

Ambient transcript (chronological):
${transcriptText}

Extracted enrichment:
${enrichmentText}

Photos available (shown to you below, in this order):
${photosText}

Requirements:
- Return ONLY a single complete HTML document -- no markdown fences, no commentary before or after.
- The document must be fully self-contained: all CSS and JavaScript inline in the file, no external resources except Google Fonts if you want them.
- Structure it as one continuously scrolling page synthesizing and organizing the notes and transcript into a clear narrative, in the order the talk actually unfolded -- don't just dump either source verbatim, and don't chop it into slide-like sections with hard edges. Use the transcript to fill gaps the notes left out and to surface direct quotes worth calling out, but let the notes drive what the attendee actually found important.
- Use scroll-driven motion deliberately: sticky/pinned photo or quote backgrounds that text scrolls past, a scroll progress indicator, and elements (quotes, stats, chart bars) that animate in via IntersectionObserver as they enter the viewport. Every animation should earn its place by clarifying content, not decorate for its own sake.
- Build at least one real, inline-SVG (or <canvas>) data visualization driven by the actual elapsed-time data above -- for example, a timeline/activity chart across the talk's duration showing when notes, quotes, and photos landed, or a simple chart of the action-item/reference/acronym counts. It must reflect this session's real numbers, not invented or placeholder data.
- Weave the photos into the page as first-class content at the point in the scroll that matches their elapsed time (not an appendix dumped at the end). Reference EACH photo using an <img> tag whose src is EXACTLY its placeholder token, e.g. <img src="PHOTO_1">. Do not invent placeholder names and do not attempt to embed real image data yourself.
- Pick a visual theme (color palette, type, motion style) that fits the subject matter of the talk.
- Open with a short title/hero section and close with a brief summary section. Use the extracted summary and speaker bio for these if present, rather than writing your own from scratch. Work action items, references, and acronym expansions into the page wherever they're contextually relevant -- not as a dumped appendix list.
- Keep it tasteful and readable: prioritize legibility over spectacle. Respect prefers-reduced-motion by disabling or softening scroll animations when it's set.
- The file gets shared and opened in many places -- Safari, Chrome, email attachments, and the iOS Files/Messages quick-look preview, which does NOT run JavaScript. The page must be fully readable and scrollable with JavaScript disabled: all text, photos and charts visible in their final state by default. Treat motion as an enhancement only -- the very first thing in <head> must be <script>document.documentElement.classList.add('js')</script>, and any "hidden until it animates in" starting state (opacity: 0, offset transforms, clipped bars, etc.) must be scoped under html.js so it never applies without scripts. Draw charts as static SVG markup in the HTML rather than building them with JavaScript.
- Let the page itself scroll: the document/window is the scroller. Don't put the content inside a fixed-height element with its own overflow scrolling, don't set overflow: hidden on html or body, and read scroll position from window.scrollY. Size full-screen sections with min-height using svh units (with a vh fallback) so they work in mobile browsers.`

  const content: Record<string, unknown>[] = [{ type: 'text', text: instructions }]
  for (const photo of photos) {
    content.push({ type: 'text', text: `Here is ${photo.placeholder}:` })
    const [, mediaType, base64] = photo.dataUrl.match(/^data:(.+);base64,(.+)$/) ?? []
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType ?? 'image/jpeg', data: base64 },
    })
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
      messages: [{ role: 'user', content }],
    }),
  })

  if (!response.ok || !response.body) {
    const errText = await response.text()
    throw new Error(`Claude API error (${response.status}): ${errText.slice(0, 500)}`)
  }

  const { text, stopReason } = await readMessageStream(response.body)
  if (stopReason === 'refusal') {
    throw new Error('Claude declined to generate this presentation')
  }
  if (!text) throw new Error('Claude returned no presentation content')

  return stripCodeFence(text.trim())
}

/** Collects the text and stop reason from a streamed Messages API response
 * (server-sent events). */
async function readMessageStream(body: ReadableStream<Uint8Array>): Promise<{ text: string; stopReason: string | null }> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let text = ''
  let stopReason: string | null = null
  for (;;) {
    const { done, value } = await reader.read()
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
  return { text, stopReason }
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

function stripCodeFence(text: string): string {
  const match = text.match(/^```(?:html)?\n([\s\S]*)\n```$/)
  return match ? match[1] : text
}

function substitutePhotos(html: string, photos: { placeholder: string; dataUrl: string }[]): string {
  let result = html
  for (const photo of photos) {
    result = result.split(`"${photo.placeholder}"`).join(`"${photo.dataUrl}"`)
    result = result.split(`'${photo.placeholder}'`).join(`'${photo.dataUrl}'`)
  }
  return result
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
