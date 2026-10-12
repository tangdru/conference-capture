// Supabase Edge Function: enrich-session
//
// Given a session id, reads that session's notes, ambient transcript, and
// photos (scoped by the caller's own JWT, so Postgres RLS enforces
// ownership end-to-end -- this function never uses a service-role key),
// and asks Claude to turn the raw capture into a reorganized, "presentation
// outline" timeline:
//
//   - A short summary, pinned to the very top of the timeline.
//   - The verbatim ambient transcript, split from its mechanical ~30s
//     recording chunks into smaller, more meaningful entries (never
//     reworded -- every split segment is verified server-side to be an
//     exact substring of its source chunk, or the chunk is left unsplit).
//   - The user's own notes/photos, woven into that same chronological flow:
//     on an item's first eligible pass only, Claude may re-timestamp it to
//     where it actually belongs in context -- once an item has a manual
//     `position` (dragged by the user) or has been placed once already
//     (`placement_locked`), no later run may move it again.
//   - Action items, speaker bio, acronyms, and references, in that order,
//     pinned to the end of the timeline as before.
//
// Each run only processes transcript added since the last run (tracked via
// cc_sessions.last_enriched_at) -- new notes/photos alone never trigger
// anything, since there is no new spoken context to place them against.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const ANTHROPIC_MODEL = 'claude-opus-5-5'
const PHOTOS_BUCKET = 'cc-photos'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ItemRow {
  id: string
  type: 'note' | 'photo' | 'video' | 'transcript' | 'enrichment'
  text: string | null
  caption: string | null
  photo_path: string | null
  item_timestamp: string
  duration_ms: number | null
  position: number | null
  placement_locked: boolean
  created_at: string
  excluded: boolean
}

interface EnrichmentResult {
  summary: string
  actionItems: { text: string; context: string }[]
  references: { title: string; source: string; description: string; url: string | null }[]
  speakerBio: { name: string; role: string; org: string; description: string } | null
  acronyms: { term: string; expansion: string }[]
  transcriptSplits: { id: string; segments: string[] }[]
  notePlacements: { id: string; timestamp: string }[]
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
    .select('id, owner_id, started_at, last_enriched_at')
    .eq('id', sessionId)
    .single()
  if (sessionError) throw sessionError

  const lastEnrichedAt = session.last_enriched_at as string | null

  const { data: allItemRows, error: itemsError } = await supabase
    .from('cc_timeline_items')
    .select('id, type, text, caption, photo_path, item_timestamp, duration_ms, position, placement_locked, created_at, excluded')
    .eq('session_id', sessionId)
    .order('item_timestamp', { ascending: true })
  if (itemsError) throw itemsError

  const itemRows = ((allItemRows ?? []) as ItemRow[]).filter((r) => !r.excluded)
  const notesPhotos = itemRows.filter((r) => (r.type === 'note' || r.type === 'photo'))
  const transcriptRows = itemRows.filter((r) => r.type === 'transcript' && r.text)
  const photoRows = itemRows.filter((r) => r.type === 'photo' && r.photo_path)

  const eligibleTranscript = transcriptRows.filter(
    (r) => !lastEnrichedAt || r.created_at > lastEnrichedAt,
  )
  const eligibleNotesPhotos = notesPhotos.filter((r) => r.position === null && !r.placement_locked)

  // No new transcript since the last run (or ever) -- there's no new spoken
  // context to place anything against, so there's nothing for Enrichment to
  // do. Notes/photos alone never trigger a run.
  if (eligibleTranscript.length === 0) {
    return 0
  }

  // Clear any previous extracted-insight rows so a re-run doesn't duplicate
  // them -- summary, action items, speaker bio, acronyms, and references are
  // always regenerated wholesale from the full current corpus. The split
  // transcript entries and repositioned notes/photos are NOT cleared here --
  // they're incremental and position-locked, handled separately below.
  const { error: clearError } = await supabase
    .from('cc_timeline_items')
    .delete()
    .eq('session_id', sessionId)
    .eq('type', 'enrichment')
  if (clearError) throw clearError

  const photos: { dataUrl: string; caption: string }[] = []
  for (const row of photoRows) {
    const { data: blob, error: downloadError } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .download(row.photo_path!)
    if (downloadError) throw downloadError
    const base64 = await blobToBase64(blob)
    photos.push({ dataUrl: `data:${blob.type || 'image/jpeg'};base64,${base64}`, caption: row.caption ?? '' })
  }

  const result = await callClaude(notesPhotos, transcriptRows, eligibleTranscript, eligibleNotesPhotos, photos)

  const splitCount = await applyTranscriptSplits(supabase, sessionId, session.owner_id as string, eligibleTranscript, result.transcriptSplits)
  await applyNotePlacements(supabase, eligibleNotesPhotos, result.notePlacements, session.started_at as string)

  const rows = buildCategoryRows(sessionId, session.owner_id as string, session.started_at as string, result)
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('cc_timeline_items').insert(rows)
    if (insertError) throw insertError
  }

  await supabase
    .from('cc_sessions')
    .update({ last_enriched_at: new Date().toISOString(), enrichment_error: null })
    .eq('id', sessionId)

  return rows.length + splitCount
}

/** Splits each eligible transcript row into verbatim sub-entries where Claude
 * returned a verified split, leaving it as a single row otherwise. Returns
 * the number of rows the split entries ended up as (0 for untouched rows,
 * since those keep their existing single row and aren't being newly
 * inserted). */
async function applyTranscriptSplits(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  ownerId: string,
  eligibleTranscript: ItemRow[],
  splits: { id: string; segments: string[] }[],
): Promise<number> {
  const splitsById = new Map(splits.map((s) => [s.id, s.segments]))
  let inserted = 0

  for (const row of eligibleTranscript) {
    const segments = splitsById.get(row.id)
    const originalText = row.text ?? ''
    if (!segments || segments.length < 2 || !originalText) continue

    const offsets = findSequentialOffsets(originalText, segments)
    if (!offsets) continue // Verification failed -- leave this chunk unsplit.

    const rowStart = new Date(row.item_timestamp).getTime()
    const rowDuration = row.duration_ms ?? 0
    const totalLen = originalText.length

    const newRows = segments.map((segment, i) => {
      const fraction = totalLen > 0 ? offsets[i] / totalLen : i / segments.length
      const nextFraction = totalLen > 0 ? (offsets[i + 1] ?? totalLen) / totalLen : (i + 1) / segments.length
      const timestamp = rowStart + fraction * rowDuration
      const duration = Math.max(0, (nextFraction - fraction) * rowDuration)
      return {
        session_id: sessionId,
        owner_id: ownerId,
        type: 'transcript',
        text: segment,
        duration_ms: Math.round(duration),
        item_timestamp: new Date(timestamp).toISOString(),
      }
    })

    const { data: insertedRows, error: insertError } = await supabase
      .from('cc_timeline_items')
      .insert(newRows)
      .select('id')
    if (insertError) continue // Best-effort -- leave the original row as a fallback.

    const { error: deleteError } = await supabase.from('cc_timeline_items').delete().eq('id', row.id)
    if (deleteError) {
      // Roll back the split rows rather than leave the original chunk
      // duplicated alongside its own split pieces.
      const ids = (insertedRows ?? []).map((r) => (r as { id: string }).id)
      if (ids.length > 0) await supabase.from('cc_timeline_items').delete().in('id', ids)
      continue
    }

    inserted += newRows.length
  }

  return inserted
}

/** Finds each segment's character offset in `text`, searching strictly in
 * order from a moving cursor -- returns null if any segment (after
 * trimming) isn't an exact substring at or after the previous one, which
 * covers both "Claude reworded something" and "Claude returned segments out
 * of order." */
function findSequentialOffsets(text: string, segments: string[]): number[] | null {
  const offsets: number[] = []
  let cursor = 0
  for (const raw of segments) {
    const segment = raw.trim()
    if (!segment) return null
    const at = text.indexOf(segment, cursor)
    if (at === -1) return null
    offsets.push(at)
    cursor = at + segment.length
  }
  return offsets
}

/** Re-timestamps each eligible note/photo per Claude's contextual placement
 * (clamped into the session's real time range), and locks it either way --
 * once an item has passed through this, no later run may touch it again,
 * whether or not Claude actually chose to move it. */
async function applyNotePlacements(
  supabase: ReturnType<typeof createClient>,
  eligibleNotesPhotos: ItemRow[],
  placements: { id: string; timestamp: string }[],
  sessionStartedAt: string,
): Promise<void> {
  const placementById = new Map(placements.map((p) => [p.id, p.timestamp]))
  const lowerBound = new Date(sessionStartedAt).getTime()
  const upperBound = Date.now()

  await Promise.all(
    eligibleNotesPhotos.map(async (row) => {
      const patch: Record<string, unknown> = { placement_locked: true }
      const placed = placementById.get(row.id)
      if (placed) {
        const parsed = new Date(placed).getTime()
        if (!Number.isNaN(parsed)) {
          patch.item_timestamp = new Date(Math.min(upperBound, Math.max(lowerBound, parsed))).toISOString()
        }
      }
      await supabase.from('cc_timeline_items').update(patch).eq('id', row.id)
    }),
  )
}

function buildCategoryRows(
  sessionId: string,
  ownerId: string,
  sessionStartedAt: string,
  result: EnrichmentResult,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []

  if (result.summary) {
    // Pinned to the very top -- just before the session's own first item.
    const topTimestamp = new Date(new Date(sessionStartedAt).getTime() - 1000).toISOString()
    rows.push({
      session_id: sessionId,
      owner_id: ownerId,
      type: 'enrichment',
      subtype: 'summary',
      payload: { text: result.summary },
      item_timestamp: topTimestamp,
    })
  }

  // Pinned to the end, in this order, a beat apart to keep a stable,
  // deterministic sub-order since display falls back to timestamp order.
  const baseTime = Date.now()
  let offset = 0
  const nextTimestamp = () => new Date(baseTime + offset++ * 10).toISOString()
  const base = (subtype: string, payload: Record<string, unknown>) => ({
    session_id: sessionId,
    owner_id: ownerId,
    type: 'enrichment',
    subtype,
    payload,
    item_timestamp: nextTimestamp(),
  })

  for (const item of result.actionItems) {
    rows.push(base('action_item', item))
  }
  if (result.speakerBio) {
    rows.push(base('speaker_bio', result.speakerBio))
  }
  for (const acronym of result.acronyms) {
    rows.push(base('acronym', acronym))
  }
  for (const reference of result.references) {
    rows.push(base('reference', reference))
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

/** Renders the full non-excluded note/photo/transcript timeline as text for
 * the prompt, tagging each row as either FIXED (context only -- Claude
 * cannot move or split it) or PLACEABLE/SPLITTABLE (open to this run's
 * contextual placement or splitting, tagged with its id). */
function describeTimeline(notesPhotos: ItemRow[], transcriptRows: ItemRow[], eligibleTranscriptIds: Set<string>): string {
  const lines: { at: number; text: string }[] = []

  for (const row of notesPhotos) {
    const at = new Date(row.item_timestamp).getTime()
    const kind = row.type === 'note' ? 'note' : 'photo caption'
    const content = row.type === 'note' ? row.text : row.caption || '(untitled photo)'
    const eligible = row.position === null && !row.placement_locked
    const tag = eligible ? `PLACEABLE id=${row.id}` : 'FIXED'
    lines.push({ at, text: `[${tag}] ${row.item_timestamp} -- ${kind}: "${content}"` })
  }

  for (const row of transcriptRows) {
    const at = new Date(row.item_timestamp).getTime()
    if (eligibleTranscriptIds.has(row.id)) {
      lines.push({
        at,
        text: `[SPLITTABLE id=${row.id} durationMs=${row.duration_ms ?? 0}] ${row.item_timestamp} -- transcript: "${row.text}"`,
      })
    } else {
      lines.push({ at, text: `[FIXED] ${row.item_timestamp} -- transcript: "${row.text}"` })
    }
  }

  lines.sort((a, b) => a.at - b.at)
  return lines.length > 0 ? lines.map((l) => `- ${l.text}`).join('\n') : '(Nothing captured yet.)'
}

async function callClaude(
  notesPhotos: ItemRow[],
  transcriptRows: ItemRow[],
  eligibleTranscript: ItemRow[],
  eligibleNotesPhotos: ItemRow[],
  photos: { dataUrl: string; caption: string }[],
): Promise<EnrichmentResult> {
  const eligibleTranscriptIds = new Set(eligibleTranscript.map((r) => r.id))
  const timelineText = describeTimeline(notesPhotos, transcriptRows, eligibleTranscriptIds)

  const instructions = `You are turning a captured conference talk session into a reorganized, presentation-ready outline, to help the attendee review it later and build a shareable deck from it.

Below is this session's full timeline so far, in chronological order by when each item was captured. Every line is tagged:
- FIXED: already placed (by the user or a previous pass) -- context only, you cannot move, split, or reword it.
- PLACEABLE id=<id>: a note or photo caption that hasn't been placed in context yet. You may propose a better timestamp for it (if its captured moment already fits, just return that same timestamp).
- SPLITTABLE id=<id> durationMs=<n>: one ~30-second raw transcript chunk that hasn't been split yet. Break it into smaller, meaningful entries.

Timeline:
${timelineText}

Photos are attached below, if any.

Do all of the following, grounded strictly in what's actually in the timeline and photos -- never invent or infer beyond what's there:

1. summary: A short (2-3 sentence) synthesis of what the talk was actually about, in plain language.
2. transcriptSplits: For EVERY id marked SPLITTABLE above, break its verbatim text into smaller, meaningful entries -- each entry a separate idea or sentence-group, never longer than necessary, and never reworded or paraphrased: every segment must be an EXACT, VERBATIM, contiguous substring of that chunk's original text, in original order. If a chunk is already short and coherent, it's fine to return it as a single segment (or omit it from transcriptSplits entirely to leave it as-is).
3. notePlacements: For EVERY id marked PLACEABLE above, return the ISO 8601 timestamp (same date, a time within the session) where that note or photo actually belongs given the surrounding spoken content -- if its captured timestamp is already right, return that same timestamp back. Every PLACEABLE id must get an entry.
4. actionItems: Commitments or follow-ups the SPEAKER made (e.g. "I'll send the slides", "we're releasing this in Q2") -- not things the attendee should do. Each needs the exact text of the commitment and brief surrounding context. Empty array if none.
5. references: Papers, books, tools, or URLs the speaker explicitly cited or named. Each needs a title, source (e.g. author/publisher/site), a one-line description, and a url if one was actually given (otherwise null). Empty array if none.
6. speakerBio: Only if the session reveals who the speaker actually is (self-introduction in the transcript, or a title/intro slide photo) -- name, role, org, and a one-line description. Set to null if the speaker's identity isn't actually established by the content, not a guess.
7. acronyms: Acronyms or jargon terms used but left unexplained by the speaker (skip any the speaker already defines themselves). Each needs the term and its expansion. Empty array if none.

Return ONLY a single JSON object with exactly these keys: summary, transcriptSplits, notePlacements, actionItems, references, speakerBio, acronyms. No markdown fences, no commentary before or after, no keys beyond these seven.`

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
      max_tokens: 8192,
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

  return parseEnrichment(text.trim(), eligibleNotesPhotos)
}

function parseEnrichment(text: string, eligibleNotesPhotos: ItemRow[]): EnrichmentResult {
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
  const eligibleIds = new Set(eligibleNotesPhotos.map((r) => r.id))

  const notePlacements = Array.isArray(obj.notePlacements)
    ? (obj.notePlacements as { id?: unknown; timestamp?: unknown }[])
        .filter((p) => typeof p.id === 'string' && eligibleIds.has(p.id) && typeof p.timestamp === 'string')
        .map((p) => ({ id: p.id as string, timestamp: p.timestamp as string }))
    : []

  const transcriptSplits = Array.isArray(obj.transcriptSplits)
    ? (obj.transcriptSplits as { id?: unknown; segments?: unknown }[])
        .filter((s) => typeof s.id === 'string' && Array.isArray(s.segments))
        .map((s) => ({ id: s.id as string, segments: (s.segments as unknown[]).filter((seg): seg is string => typeof seg === 'string') }))
    : []

  return {
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    actionItems: Array.isArray(obj.actionItems) ? obj.actionItems : [],
    references: Array.isArray(obj.references) ? obj.references : [],
    speakerBio: typeof obj.speakerBio === 'object' ? (obj.speakerBio as EnrichmentResult['speakerBio']) : null,
    acronyms: Array.isArray(obj.acronyms) ? obj.acronyms : [],
    transcriptSplits,
    notePlacements,
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
