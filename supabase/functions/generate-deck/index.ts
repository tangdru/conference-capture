// Supabase Edge Function: generate-deck
//
// Given a session id, reads that session's notes and photos (scoped by the
// caller's own JWT, so Postgres RLS enforces ownership end-to-end -- this
// function never uses a service-role key), asks Claude for a themed,
// animated, self-contained HTML presentation, substitutes real photo data in
// place of the placeholders Claude is asked to emit, and uploads the result
// to the private cc-decks bucket.
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

  const { data: itemRows, error: itemsError } = await supabase
    .from('cc_timeline_items')
    .select('type, text, caption, photo_path, item_timestamp')
    .eq('session_id', sessionId)
    .order('item_timestamp', { ascending: true })
  if (itemsError) throw itemsError

  const notes = (itemRows ?? []).filter((r) => r.type === 'note' && r.text)
  const photoRows = (itemRows ?? []).filter((r) => r.type === 'photo' && r.photo_path)

  if (notes.length === 0 && photoRows.length === 0) {
    throw new Error('This session has no notes or photos to build a presentation from')
  }

  await supabase.from('cc_sessions').update({ deck_status: 'generating', deck_error: null }).eq('id', sessionId)

  const photos: { placeholder: string; dataUrl: string; caption: string }[] = []
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
    })
  }

  const html = await callClaude(session.title, notes, photos)
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
  notes: { text: string | null; item_timestamp: string }[],
  photos: { placeholder: string; dataUrl: string; caption: string }[],
): Promise<string> {
  const notesText = notes.length > 0
    ? notes.map((n) => `- ${n.text}`).join('\n')
    : '(No written notes were captured -- build the presentation from the photos alone.)'

  const photosText = photos.length > 0
    ? photos.map((p) => `- ${p.placeholder}${p.caption ? ` -- caption: "${p.caption}"` : ''}`).join('\n')
    : '(No photos were captured for this talk.)'

  const instructions = `You are building a presentation someone can keep as a personal resource, or share with friends and colleagues, as a record of a conference talk they attended titled "${title}".

You are given the attendee's raw notes (taken live, so they may be fragmentary or out of order) and photos they took during the talk (mostly slides). Turn this into a polished, self-contained HTML presentation.

Raw notes:
${notesText}

Photos available (shown to you below, in this order):
${photosText}

Requirements:
- Return ONLY a single complete HTML document -- no markdown fences, no commentary before or after.
- The document must be fully self-contained: all CSS and JavaScript inline in the file, no external resources except Google Fonts if you want them.
- Structure it as a slide deck the viewer can step through (arrow keys / click / swipe), one topic or idea per slide, synthesizing and organizing the raw notes into a clear narrative -- don't just dump the notes verbatim.
- Weave the photos into the deck as first-class slide content (not an appendix), placed where they're most relevant to the narrative. Reference EACH photo using an <img> tag whose src is EXACTLY its placeholder token, e.g. <img src="PHOTO_1">. Do not invent placeholder names and do not attempt to embed real image data yourself.
- Pick a visual theme (color palette, type, motion style) that fits the subject matter of the talk, and use CSS transitions/animations and simple data visualization (inline SVG charts, etc.) where they genuinely help communicate an idea -- not decoration for its own sake.
- Include a title slide and a brief closing/summary slide.
- Keep it tasteful and readable: prioritize legibility over spectacle.`

  const content: Record<string, unknown>[] = [{ type: 'text', text: instructions }]
  for (const photo of photos) {
    content.push({ type: 'text', text: `Here is ${photo.placeholder}:` })
    const [, mediaType, base64] = photo.dataUrl.match(/^data:(.+);base64,(.+)$/) ?? []
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType ?? 'image/jpeg', data: base64 },
    })
  }

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
      messages: [{ role: 'user', content }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Claude API error (${response.status}): ${errText}`)
  }

  const data: { stop_reason?: string; content?: { type: string; text?: string }[] } = await response.json()
  if (data.stop_reason === 'refusal') {
    throw new Error('Claude declined to generate this presentation')
  }
  const text = data.content?.find((block) => block.type === 'text')?.text
  if (!text) throw new Error('Claude returned no presentation content')

  return stripCodeFence(text.trim())
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
