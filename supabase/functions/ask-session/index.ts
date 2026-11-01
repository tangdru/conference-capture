// Supabase Edge Function: ask-session
//
// Answers a question about one session from what was captured in it -- the
// transcript, the attendee's notes, the text read off slide photos, the
// moments they marked, and any enrichment. Reads with the caller's own JWT,
// so Postgres RLS keeps it to their own sessions (no service-role key).
// Stateless: the client sends the conversation so far with each question.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
// Answers are read while the talk is fresh, often during it -- a faster
// model keeps the wait short.
const ANTHROPIC_MODEL = 'claude-sonnet-5-5'
const MAX_HISTORY = 12

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Turn {
  role: 'user' | 'assistant'
  content: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let supabase: ReturnType<typeof createClient>
  let sessionId: string
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
    sessionId = body.sessionId
    question = typeof body.question === 'string' ? body.question.trim() : ''
    history = Array.isArray(body.history)
      ? (body.history as Turn[])
          .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
          .slice(-MAX_HISTORY)
      : []
    if (!sessionId) throw new Error('Missing sessionId')
    if (!question) throw new Error('Missing question')
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Bad request' }, 400)
  }

  try {
    const answer = await answerQuestion(supabase, sessionId, question, history)
    return jsonResponse({ answer }, 200)
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to answer' }, 500)
  }
})

async function answerQuestion(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  question: string,
  history: Turn[],
): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured')

  const { data: session, error: sessionError } = await supabase
    .from('cc_sessions')
    .select('title, started_at')
    .eq('id', sessionId)
    .single()
  if (sessionError) throw sessionError

  const { data: rows, error: itemsError } = await supabase
    .from('cc_timeline_items')
    .select('type, subtype, payload, text, caption, item_timestamp, excluded')
    .eq('session_id', sessionId)
    .order('item_timestamp', { ascending: true })
  if (itemsError) throw itemsError

  const material = describeSession(session.started_at, rows ?? [])
  if (!material) {
    return 'Nothing has been captured in this session yet, so there’s nothing to answer from.'
  }

  const system = `You answer questions about one conference talk an attendee captured, titled "${session.title}", using only what they captured, listed below in the order it happened. Each line has its time into the talk (MM:SS, or H:MM:SS past the hour).

- The transcript is the speaker, auto-transcribed on the phone -- expect the odd misheard word. Slide text was read off photos on the phone -- expect the odd misread character.
- Notes are the attendee's own. "Remembered" marks a moment they flagged as important.
- Answer from this material only. If it doesn't cover the question, say so plainly, and say what it does cover that's closest. Never fill gaps with outside knowledge presented as if the speaker said it; if general background would genuinely help, keep it brief and say it's not from the talk.
- Be concise: a direct answer first, then only the detail that helps. Point to when things were said, like (12:30), when it helps them find it.
- Plain text for a phone screen: short paragraphs, "- " for lists, no headings, tables or other markdown.

Captured material:
${material}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1500,
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

/** The session as dated lines for the prompt, or '' if there's nothing. */
function describeSession(
  startedAt: string,
  rows: { type: string; subtype: string | null; payload: Record<string, unknown> | null; text: string | null; caption: string | null; item_timestamp: string; excluded: boolean }[],
): string {
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

function formatElapsed(startedAtIso: string, itemIso: string): string {
  const totalSec = Math.max(0, Math.round((new Date(itemIso).getTime() - new Date(startedAtIso).getTime()) / 1000))
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = (totalSec % 60).toString().padStart(2, '0')
  // H:MM:SS past the hour (workshops, long sessions), else MM:SS.
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
