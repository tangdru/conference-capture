// Supabase Edge Function: ask-session
//
// Answers a question from what the attendee captured -- the transcript,
// their notes, the text read off slide photos, the moments they marked, and
// any enrichment -- either within one session ({sessionId}) or across all
// of theirs ({scope: 'all'}). Reads with the caller's own JWT, so Postgres
// RLS keeps it to their own sessions (no service-role key). Stateless: the
// client sends the conversation so far with each question.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
// Answers are read while the talk is fresh, often during it -- a faster
// model keeps the wait short.
const ANTHROPIC_MODEL = 'claude-sonnet-5-5'
const MAX_HISTORY = 12
// Roughly how much captured material goes into one cross-session question
// (~150k tokens). Past this, the sessions that look most relevant go in
// whole and the rest only by title and summary.
const ALL_SESSIONS_BUDGET_CHARS = 600_000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Turn {
  role: 'user' | 'assistant'
  content: string
}

interface ItemRow {
  session_id: string
  type: string
  subtype: string | null
  payload: Record<string, unknown> | null
  text: string | null
  caption: string | null
  item_timestamp: string
}

interface SessionRow {
  id: string
  title: string
  started_at: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let supabase: ReturnType<typeof createClient>
  let sessionId: string | null
  let question: string
  let history: Turn[]
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const body = await req.json()
    sessionId = body.scope === 'all' ? null : body.sessionId
    question = typeof body.question === 'string' ? body.question.trim() : ''
    history = Array.isArray(body.history)
      ? (body.history as Turn[])
          .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
          .slice(-MAX_HISTORY)
      : []
    if (body.scope !== 'all' && !sessionId) throw new Error('Missing sessionId')
    if (!question) throw new Error('Missing question')
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Bad request' }, 400)
  }

  try {
    const result = sessionId
      ? { answer: await answerInSession(supabase, sessionId, question, history) }
      : await answerAcrossSessions(supabase, question, history)
    return jsonResponse(result, 200)
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to answer' }, 500)
  }
})

const GROUND_RULES = `- The transcript is the speaker, auto-transcribed on the phone -- expect the odd misheard word. Slide text was read off photos on the phone -- expect the odd misread character.
- Notes are the attendee's own. "Remembered" marks a moment they flagged as important.
- Answer from this material only. If it doesn't cover the question, say so plainly, and say what it does cover that's closest. Never fill gaps with outside knowledge presented as if a speaker said it; if general background would genuinely help, keep it brief and say it's not from the talks.
- Be concise: a direct answer first, then only the detail that helps.
- Plain text for a phone screen: short paragraphs, "- " for lists, no headings, tables or other markdown.`

async function answerInSession(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  question: string,
  history: Turn[],
): Promise<string> {
  const { data: session, error: sessionError } = await supabase
    .from('cc_sessions')
    .select('id, title, started_at')
    .eq('id', sessionId)
    .single()
  if (sessionError) throw sessionError

  const { data: rows, error: itemsError } = await supabase
    .from('cc_timeline_items')
    .select('session_id, type, subtype, payload, text, caption, item_timestamp')
    .eq('session_id', sessionId)
    .order('item_timestamp', { ascending: true })
  if (itemsError) throw itemsError

  const material = describeSession(session.started_at, (rows ?? []) as ItemRow[])
  if (!material) {
    return 'Nothing has been captured in this session yet, so there’s nothing to answer from.'
  }

  const system = `You answer questions about one conference talk an attendee captured, titled "${session.title}", using only what they captured, listed below in the order it happened. Each line has its time into the talk (MM:SS, or H:MM:SS past the hour).

${GROUND_RULES}
- Point to when things were said, like (12:30), when it helps them find it.

Captured material:
${material}`

  return await callClaude(system, history, question)
}

/** Across every session: each is labelled S1, S2... in the prompt and
 * cited that way in the answer; `sessions` maps the labels back to ids so
 * the app can link each citation to its session. */
async function answerAcrossSessions(
  supabase: ReturnType<typeof createClient>,
  question: string,
  history: Turn[],
): Promise<{ answer: string; sessions: Record<string, string> }> {
  const { data: sessionRows, error: sessionsError } = await supabase
    .from('cc_sessions')
    .select('id, title, started_at')
    .order('started_at', { ascending: true })
  if (sessionsError) throw sessionsError

  const { data: itemRows, error: itemsError } = await supabase
    .from('cc_timeline_items')
    .select('session_id, type, subtype, payload, text, caption, item_timestamp')
    .order('item_timestamp', { ascending: true })
  if (itemsError) throw itemsError

  const itemsBySession = new Map<string, ItemRow[]>()
  for (const row of (itemRows ?? []) as ItemRow[]) {
    itemsBySession.set(row.session_id, [...(itemsBySession.get(row.session_id) ?? []), row])
  }

  const labels: Record<string, string> = {}
  const described = ((sessionRows ?? []) as SessionRow[])
    .map((session) => {
      const rows = itemsBySession.get(session.id) ?? []
      return { session, rows, material: describeSession(session.started_at, rows) }
    })
    .filter((s) => s.material)
  if (described.length === 0) {
    return { answer: 'Nothing has been captured in any session yet, so there’s nothing to answer from.', sessions: {} }
  }
  described.forEach((s, i) => (labels[`S${i + 1}`] = s.session.id))

  // Everything if it fits. If not, the sessions sharing the most words with
  // the question (and the conversation so far) go in whole, and the rest as
  // a one-line overview, so they can still be pointed to.
  const total = described.reduce((sum, s) => sum + s.material.length, 0)
  let full = new Set(described.map((s) => s.session.id))
  if (total > ALL_SESSIONS_BUDGET_CHARS) {
    const words = keywords([question, ...history.filter((t) => t.role === 'user').map((t) => t.content)].join(' '))
    const ranked = [...described].sort((a, b) => relevance(b.material, words) - relevance(a.material, words))
    full = new Set()
    let used = 0
    for (const s of ranked) {
      if (used + s.material.length > ALL_SESSIONS_BUDGET_CHARS) continue
      full.add(s.session.id)
      used += s.material.length
    }
  }

  const blocks = described.map((s, i) => {
    const label = `S${i + 1}`
    const heading = `=== ${label}: "${s.session.title}" -- ${formatDate(s.session.started_at)} ===`
    if (full.has(s.session.id)) return `${heading}\n${s.material}`
    const summary = s.rows.find((r) => r.type === 'enrichment' && r.subtype === 'summary')?.payload?.text
    return `${heading}\n(Left out for length${summary ? ` -- summary: ${summary}` : ''})`
  })

  const system = `You answer questions across all the conference talks an attendee captured, using only what they captured. Each talk below is labelled S1, S2 and so on, with its title and date, and each line in it has its time into that talk (MM:SS, or H:MM:SS past the hour).

${GROUND_RULES}
- Say which talk each point comes from by citing its label and the time in square brackets, like [S2 12:30] -- or just [S2] for the talk as a whole. The app turns these into links, so use exactly that form, and mention the talk's title in your words the first time it comes up.
- When several talks bear on the question, bring them together: where they agree, where they differ, and what each added.

Captured talks:
${blocks.join('\n\n')}`

  return { answer: await callClaude(system, history, question), sessions: labels }
}

async function callClaude(system: string, history: Turn[], question: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured')
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      system,
      messages: [...history, { role: 'user', content: question }],
    }),
  })
  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Claude API error (${response.status}): ${errText.slice(0, 300)}`)
  }
  const data: { stop_reason?: string; content?: { type: string; text?: string }[] } = await response.json()
  if (data.stop_reason === 'refusal') throw new Error('Claude declined to answer this')
  const answer = data.content?.find((b) => b.type === 'text')?.text?.trim()
  if (!answer) throw new Error('Claude returned no answer')
  return answer
}

/** A session as dated lines for the prompt, or '' if there's nothing. */
function describeSession(startedAt: string, rows: ItemRow[]): string {
  const lines: string[] = []
  const extras: string[] = []
  for (const row of rows) {
    const at = formatElapsed(startedAt, row.item_timestamp)
    switch (row.type) {
      case 'transcript':
        if (row.text) lines.push(`[${at}] Speaker: ${row.text}`)
        break
      case 'note':
        if (row.text) lines.push(`[${at}] Attendee's note: ${row.text}`)
        break
      case 'photo': {
        const text = (row.text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).join(' / ')
        lines.push(`[${at}] Photo${text ? ` -- text on it: ${text}` : row.caption && row.caption !== 'Untitled photo' ? `: ${row.caption}` : ' (no text found on it)'}`)
        break
      }
      case 'highlight':
        lines.push(`[${at}] Remembered (attendee flagged this moment as important)`)
        break
      case 'enrichment': {
        const p = row.payload ?? {}
        if (row.subtype === 'summary') extras.push(`Summary: ${p.text}`)
        if (row.subtype === 'speaker_bio') extras.push(`Speaker: ${p.name} -- ${p.role} at ${p.org}. ${p.description}`)
        break
      }
    }
  }
  if (lines.length === 0) return ''
  return [...extras, ...lines].join('\n')
}

const STOPWORDS = new Set(
  'a an and are as at be but by did do does for from had has have how i in is it its me my of on or said say says so that the their them they this to was were what when where which who why will with you your about any there talk talks session sessions speaker speakers'.split(' '),
)

function keywords(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z0-9][a-z0-9'-]+/g) ?? [])].filter((w) => !STOPWORDS.has(w))
}

function relevance(material: string, words: string[]): number {
  const lower = material.toLowerCase()
  return words.reduce((score, w) => score + (lower.includes(w) ? 1 + Math.min(lower.split(w).length - 2, 5) * 0.2 : 0), 0)
}

function formatElapsed(startedAtIso: string, itemIso: string): string {
  const totalSec = Math.max(0, Math.round((new Date(itemIso).getTime() - new Date(startedAtIso).getTime()) / 1000))
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = (totalSec % 60).toString().padStart(2, '0')
  // H:MM:SS past the hour (workshops, long sessions), else MM:SS.
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

function formatDate(iso: string): string {
  return new Date(iso).toUTCString().slice(0, 16)
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
