// Supabase Edge Function: enrich-session
//
// Given a session id, reads that session's notes, ambient transcript, and
// photos (scoped by the caller's own JWT, so Postgres RLS enforces
// ownership end-to-end -- this function never uses a service-role key),
// asks Claude for a starter set of enrichment: a session summary, action
// items, references, a speaker bio, and acronym expansions. Each result
// is inserted as its own cc_timeline_items row (type='enrichment') so it
// shows up in the timeline alongside notes/photos/transcript -- same
// delete/exclude machinery, no separate review surface. Any previous
// enrichment rows for the session are cleared first, so a re-run doesn't
// duplicate them.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const ANTHROPIC_MODEL = 'claude-opus-5-5'
const PHOTOS_BUCKET = 'cc-photos'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SessionEnrichment {
  summary: string
  actionItems: { text: string; context: string }[]
  references: { title: string; source: string; description: string; url: string | null }[]
  speakerBio: { name: string; role: string; org: string; description: string } | null
  acronyms: { term: string; expansion: string }[]
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
    const count = await enrichSession(supabase, sessionId)
    return jsonResponse({ count }, 200)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Enrichment failed'
    await supabase.from('cc_sessions').update({ enrichment_error: message }).eq('id', sessionId)
    return jsonResponse({ error: message }, 500)
  }
})

async function enrichSession(supabase: ReturnType<typeof createClient>, sessionId: string): Promise<number> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured')

  const { data: session, error: sessionError } = await supabase
    .from('cc_sessions')
    .select('id, owner_id')
    .eq('id', sessionId)
    .single()
  if (sessionError) throw sessionError

  const { data: allItemRows, error: itemsError } = await supabase
    .from('cc_timeline_items')
    .select('type, text, caption, photo_path, item_timestamp, excluded')
    .eq('session_id', sessionId)
    .order('item_timestamp', { ascending: true })
  if (itemsError) throw itemsError

  const itemRows = (allItemRows ?? []).filter((r) => !r.excluded)
  const notes = itemRows.filter((r) => r.type === 'note' && r.text)
  const transcriptSegments = itemRows.filter((r) => r.type === 'transcript' && r.text)
  const photoRows = itemRows.filter((r) => r.type === 'photo' && r.photo_path)

  // Clear any previous enrichment rows so a re-run doesn't duplicate them.
  const { error: clearError } = await supabase
    .from('cc_timeline_items')
    .delete()
    .eq('session_id', sessionId)
    .eq('type', 'enrichment')
  if (clearError) throw clearError

  if (notes.length === 0 && transcriptSegments.length === 0 && photoRows.length === 0) {
    await supabase.from('cc_sessions').update({ enrichment_error: null }).eq('id', sessionId)
    return 0
  }

  const photos: { dataUrl: string; caption: string }[] = []
  for (const row of photoRows) {
    const { data: blob, error: downloadError } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .download(row.photo_path)
    if (downloadError) throw downloadError
    const base64 = await blobToBase64(blob)
    photos.push({ dataUrl: `data:${blob.type || 'image/jpeg'};base64,${base64}`, caption: row.caption ?? '' })
  }

  const enrichment = await callClaude(notes, transcriptSegments, photos)
  const rows = buildEnrichmentRows(sessionId, session.owner_id as string, enrichment)

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('cc_timeline_items').insert(rows)
    if (insertError) throw insertError
  }

  await supabase.from('cc_sessions').update({ enrichment_error: null }).eq('id', sessionId)

  return rows.length
}

function buildEnrichmentRows(
  sessionId: string,
  ownerId: string,
  enrichment: SessionEnrichment,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []
  const baseTime = Date.now()
  let offset = 0
  // Enrichment rows don't have a natural "when it happened" moment -- they're
  // synthesized after the session ends. Stamping each one a beat apart keeps
  // a stable, deterministic order (summary -> bio -> action items ->
  // references -> acronyms) since display falls back to timestamp order for
  // anything that hasn't been manually repositioned.
  const nextTimestamp = () => new Date(baseTime + offset++ * 10).toISOString()
  const base = (subtype: string, payload: Record<string, unknown>) => ({
    session_id: sessionId,
    owner_id: ownerId,
    type: 'enrichment',
    subtype,
    payload,
    item_timestamp: nextTimestamp(),
  })

  if (enrichment.summary) {
    rows.push(base('summary', { text: enrichment.summary }))
  }
  if (enrichment.speakerBio) {
    rows.push(base('speaker_bio', enrichment.speakerBio))
  }
  for (const item of enrichment.actionItems) {
    rows.push(base('action_item', item))
  }
  for (const reference of enrichment.references) {
    rows.push(base('reference', reference))
  }
  for (const acronym of enrichment.acronyms) {
    rows.push(base('acronym', acronym))
  }

  return rows
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
  notes: { text: string | null }[],
  transcriptSegments: { text: string | null }[],
  photos: { dataUrl: string; caption: string }[],
): Promise<SessionEnrichment> {
  const notesText = notes.length > 0
    ? notes.map((n) => `- ${n.text}`).join('\n')
    : '(No written notes were captured.)'

  const transcriptText = transcriptSegments.length > 0
    ? transcriptSegments.map((t) => `- ${t.text}`).join('\n')
    : '(No ambient transcript was captured.)'

  const instructions = `You are extracting structured, review-ready enrichment from a captured conference talk session, to help the attendee review it later and build a shareable deck from it.

You are given the attendee's raw notes (taken live, so fragmentary or out of order), an ambient audio transcript of the speaker (auto-transcribed on-device -- it may contain mistranscribed words or awkward phrasing), and photos taken during the talk (mostly slides).

Raw notes:
${notesText}

Ambient transcript (chronological):
${transcriptText}

Photos are attached below, if any.

Extract exactly these five things, grounded strictly in what's actually in the notes, transcript, and photos -- never invent or infer beyond what's there:

1. summary: A short (2-4 sentence) synthesis of what the talk was actually about, in plain language.
2. actionItems: Commitments or follow-ups the SPEAKER made (e.g. "I'll send the slides", "we're releasing this in Q2") -- not things the attendee should do. Each needs the exact text of the commitment and brief surrounding context. Empty array if none.
3. references: Papers, books, tools, or URLs the speaker explicitly cited or named. Each needs a title, source (e.g. author/publisher/site), a one-line description, and a url if one was actually given (otherwise null). Empty array if none.
4. speakerBio: Only if the session reveals who the speaker actually is (self-introduction in the transcript, or a title/intro slide photo) -- name, role, org, and a one-line description. Set to null if the speaker's identity isn't actually established by the content, not a guess.
5. acronyms: Acronyms or jargon terms used but left unexplained by the speaker (skip any the speaker already defines themselves). Each needs the term and its expansion. Empty array if none.

Return ONLY a single JSON object with exactly these keys: summary, actionItems, references, speakerBio, acronyms. No markdown fences, no commentary before or after, no keys beyond these five.`

  const content: Record<string, unknown>[] = [{ type: 'text', text: instructions }]
  for (const photo of photos) {
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
      max_tokens: 4096,
      messages: [{ role: 'user', content }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Claude API error (${response.status}): ${errText}`)
  }

  const data: { stop_reason?: string; content?: { type: string; text?: string }[] } = await response.json()
  if (data.stop_reason === 'refusal') {
    throw new Error('Claude declined to generate enrichment for this session')
  }
  const text = data.content?.find((block) => block.type === 'text')?.text
  if (!text) throw new Error('Claude returned no enrichment content')

  return parseEnrichment(text.trim())
}

function parseEnrichment(text: string): SessionEnrichment {
  const match = text.match(/^```(?:json)?\n([\s\S]*)\n```$/)
  const jsonText = match ? match[1] : text

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('Claude returned malformed enrichment JSON')
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Claude returned malformed enrichment JSON')
  }
  const obj = parsed as Record<string, unknown>

  return {
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    actionItems: Array.isArray(obj.actionItems) ? obj.actionItems : [],
    references: Array.isArray(obj.references) ? obj.references : [],
    speakerBio: typeof obj.speakerBio === 'object' ? (obj.speakerBio as SessionEnrichment['speakerBio']) : null,
    acronyms: Array.isArray(obj.acronyms) ? obj.acronyms : [],
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
