// Supabase Edge Function: mcp
//
// The Claude connector (menu > Use in Claude). An MCP server that lets Claude
// -- desktop, claude.ai or the phone app -- read one account's sessions: list
// and search them, read a session's transcript, notes and slide text, look at
// its photos, and read its presentation. Read only.
//
// The account is picked by the private link it's reached at,
// .../functions/v1/mcp/<token> (cc_mcp_links; made in the app). Reads use the
// service role, so every query here is held to that account with owner_id.
//
// Speaks MCP's Streamable HTTP transport, stateless: each POST carries one
// JSON-RPC message (or a batch) and gets a plain JSON reply.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'

const SERVER_INFO = { name: 'conference-capture', title: 'Conference Capture', version: '1.0.0' }
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
// Supabase returns at most this many rows per request, without saying it
// stopped short.
const PAGE_ROWS = 1000
// Photos per get_photos call: each is a few hundred KB, and the reply has to
// stay well under Claude's limits.
const MAX_PHOTOS = 6

const INSTRUCTIONS = `Conference Capture holds the conference talks this person captured on their phone: the speaker's words (auto-transcribed on the phone, so expect the odd misheard word), their own notes, photos of slides (with the text read off them), moments they marked "Remembered", entries they starred (★), short audio clips, and for many talks a presentation Claude made from it all.

Start with list_sessions or search, then get_session for the full material of a talk. Times like 12:30 are minutes into that talk. Use get_photos to look at slides when the read-off text isn't enough. Say which talk (and when in it) each point comes from, and keep what the speaker said apart from the attendee's own notes. Don't present outside knowledge as if a speaker said it.`

const TOOLS = [
  {
    name: 'list_sessions',
    title: 'List sessions',
    description:
      'Every captured session (talk), newest first: id, title, date, length, what was captured, whether it has a presentation, and its summary when there is one. Optionally only those whose title or summary contains some text.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Only sessions whose title or summary contains this text.' },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'search',
    title: 'Search sessions',
    description:
      "Finds what was said, noted or shown on slides across every session. Returns the matching moments with their session, time into the talk and the surrounding words. Matches entries containing all the words given (falling back to any of them).",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to look for, e.g. "design tokens" or "accessibility audit".' },
        limit: { type: 'integer', description: 'Most matches to return (default 40, at most 150).' },
      },
      required: ['query'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_session',
    title: 'Read a session',
    description:
      "Everything captured in one session, in the order it happened: the speaker's transcript, the attendee's notes, photos (with their ids and the text read off them), Remembered moments, audio clips and starred entries, plus the summary and speaker details when there are any.",
    inputSchema: {
      type: 'object',
      properties: { session_id: { type: 'string', description: 'The session id, from list_sessions or search.' } },
      required: ['session_id'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_photos',
    title: 'Look at photos',
    description: `Returns photos (usually slides) as images, by the photo ids get_session lists. At most ${MAX_PHOTOS} per call.`,
    inputSchema: {
      type: 'object',
      properties: {
        photo_ids: { type: 'array', items: { type: 'string' }, description: `Up to ${MAX_PHOTOS} photo ids.` },
      },
      required: ['photo_ids'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_presentation',
    title: 'Read a presentation',
    description:
      "The presentation Claude made from a session (Sparkle in the app), as text, plus its share link if the attendee shared it.",
    inputSchema: {
      type: 'object',
      properties: { session_id: { type: 'string', description: 'The session id.' } },
      required: ['session_id'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
]

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, accept',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

interface RpcMessage {
  jsonrpc: '2.0'
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

interface SessionRow {
  id: string
  title: string
  status: string
  started_at: string
  accumulated_ms: number | null
  deck_status: string
  deck_path: string | null
}

interface ItemRow {
  id: string
  session_id: string
  type: string
  subtype: string | null
  payload: Record<string, unknown> | null
  text: string | null
  caption: string | null
  photo_path: string | null
  item_timestamp: string
  starred: boolean | null
  duration_ms: number | null
  excluded: boolean | null
}

const ITEM_COLUMNS = 'id, session_id, type, subtype, payload, text, caption, photo_path, item_timestamp, starred, duration_ms, excluded'

class ToolError extends Error {}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const token = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? ''
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const userId = /^[0-9a-f]{48}$/.test(token) ? await userFor(admin, token) : null
  if (!userId) {
    return json({ error: 'This Conference Capture link is not valid. Make a new one in the app: menu > Use in Claude.' }, 404)
  }

  // Stateless server: no stream to open, nothing to end.
  if (req.method === 'GET' || req.method === 'DELETE') return new Response(null, { status: 405, headers: corsHeaders })
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: corsHeaders })

  let body: RpcMessage | RpcMessage[]
  try {
    body = await req.json()
  } catch {
    return json(rpcError(null, -32700, 'Parse error'), 400)
  }

  const messages = Array.isArray(body) ? body : [body]
  const replies = (await Promise.all(messages.map((m) => handle(admin, userId, m)))).filter((r) => r !== null)
  if (replies.length === 0) return new Response(null, { status: 202, headers: corsHeaders })
  return json(Array.isArray(body) ? replies : replies[0], 200)
})

async function userFor(admin: SupabaseClient, token: string): Promise<string | null> {
  const { data, error } = await admin.rpc('cc_mcp_user_for', { p_token: token })
  if (error) {
    console.error('mcp: link lookup failed', error)
    return null
  }
  return typeof data === 'string' ? data : null
}

/** One JSON-RPC message; null for notifications, which get no reply. */
async function handle(admin: SupabaseClient, userId: string, msg: RpcMessage): Promise<unknown | null> {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return msg?.id === undefined ? null : rpcError(msg.id ?? null, -32600, 'Invalid request')
  }
  if (msg.id === undefined) return null // notification (e.g. notifications/initialized)

  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion
      const protocolVersion = typeof asked === 'string' && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0]
      return rpcResult(msg.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      })
    }
    case 'ping':
      return rpcResult(msg.id, {})
    case 'tools/list':
      return rpcResult(msg.id, { tools: TOOLS })
    case 'resources/list':
      return rpcResult(msg.id, { resources: [] })
    case 'prompts/list':
      return rpcResult(msg.id, { prompts: [] })
    case 'tools/call': {
      const name = msg.params?.name
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>
      try {
        const content = await callTool(admin, userId, String(name), args)
        return rpcResult(msg.id, { content })
      } catch (err) {
        if (!(err instanceof ToolError)) console.error(`mcp: ${name} failed`, err)
        const text = err instanceof ToolError ? err.message : 'Something went wrong reading Conference Capture, try again.'
        return rpcResult(msg.id, { content: [{ type: 'text', text }], isError: true })
      }
    }
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`)
  }
}

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }

async function callTool(admin: SupabaseClient, userId: string, name: string, args: Record<string, unknown>): Promise<Content[]> {
  switch (name) {
    case 'list_sessions':
      return [{ type: 'text', text: await listSessions(admin, userId, str(args.filter)) }]
    case 'search':
      return [{ type: 'text', text: await search(admin, userId, str(args.query), Number(args.limit) || 40) }]
    case 'get_session':
      return [{ type: 'text', text: await getSession(admin, userId, sessionIdArg(args.session_id)) }]
    case 'get_photos':
      return await getPhotos(admin, userId, args.photo_ids)
    case 'get_presentation':
      return [{ type: 'text', text: await getPresentation(admin, userId, sessionIdArg(args.session_id)) }]
    default:
      throw new ToolError(`No tool called ${name}.`)
  }
}

// ---- Tools -----------------------------------------------------------------

async function listSessions(admin: SupabaseClient, userId: string, filter: string): Promise<string> {
  const sessions = await allSessions(admin, userId)
  if (sessions.length === 0) return 'No sessions captured yet.'

  const items = await allPages<Pick<ItemRow, 'session_id' | 'type' | 'subtype' | 'payload'>>((from, to) =>
    admin
      .from('cc_timeline_items')
      .select('session_id, type, subtype, payload')
      .eq('owner_id', userId)
      .eq('excluded', false)
      .order('id')
      .range(from, to),
  )
  const counts = new Map<string, Record<string, number>>()
  const summaries = new Map<string, string>()
  for (const item of items) {
    const c = counts.get(item.session_id) ?? {}
    c[item.type] = (c[item.type] ?? 0) + 1
    counts.set(item.session_id, c)
    if (item.type === 'enrichment' && item.subtype === 'summary' && typeof item.payload?.text === 'string') {
      summaries.set(item.session_id, item.payload.text)
    }
  }

  const needle = filter.toLowerCase()
  const shown = sessions
    .slice()
    .reverse()
    .filter((s) => !needle || s.title.toLowerCase().includes(needle) || (summaries.get(s.id) ?? '').toLowerCase().includes(needle))
  if (shown.length === 0) return `No sessions match "${filter}". There are ${sessions.length} in all.`

  const blocks = shown.map((s) => {
    const c = counts.get(s.id) ?? {}
    const captured = [
      c.transcript && 'transcript',
      plural(c.note, 'note'),
      plural(c.photo, 'photo'),
      plural(c.audio, 'audio clip'),
      plural(c.video, 'video'),
      plural(c.highlight, 'Remembered moment'),
    ].filter(Boolean)
    const lines = [
      `${s.title}`,
      `  id: ${s.id}`,
      `  ${formatDate(s.started_at)}${lengthOf(s)}${s.status === 'recording' ? ' -- live now' : ''}`,
      `  captured: ${captured.length ? captured.join(', ') : 'nothing yet'}`,
      `  presentation: ${s.deck_status === 'ready' ? 'yes' : 'no'}`,
    ]
    const summary = summaries.get(s.id)
    if (summary) lines.push(`  summary: ${summary}`)
    return lines.join('\n')
  })
  return `${shown.length} session${shown.length === 1 ? '' : 's'}${needle ? ` matching "${filter}"` : ''}, newest first:\n\n${blocks.join('\n\n')}`
}

async function search(admin: SupabaseClient, userId: string, query: string, limit: number): Promise<string> {
  const words = searchWords(query)
  if (words.length === 0) throw new ToolError('Give some words to search for.')
  limit = Math.min(Math.max(1, Math.floor(limit)), 150)

  // Entries containing the longest word, then narrowed to all the words.
  const longest = [...words].sort((a, b) => b.length - a.length)[0]
  const pattern = `%${longest.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const rows = await allPages<ItemRow>((from, to) =>
    admin
      .from('cc_timeline_items')
      .select(ITEM_COLUMNS)
      .eq('owner_id', userId)
      .eq('excluded', false)
      .in('type', ['transcript', 'note', 'photo'])
      .or(`text.ilike.${pattern},caption.ilike.${pattern}`)
      .order('item_timestamp')
      .order('id')
      .range(from, to),
  )
  const haystack = (r: ItemRow) => `${r.text ?? ''} ${r.caption ?? ''}`.toLowerCase()
  let matches = rows.filter((r) => words.every((w) => haystack(r).includes(w)))
  const partial = matches.length === 0 && words.length > 1
  if (partial) matches = rows

  const sessions = new Map((await allSessions(admin, userId)).map((s) => [s.id, s]))
  matches = matches.filter((r) => sessions.has(r.session_id))
  if (matches.length === 0) return `Nothing captured mentions "${query}".`

  const shown = matches.slice(0, limit)
  const bySession = new Map<string, ItemRow[]>()
  for (const r of shown) bySession.set(r.session_id, [...(bySession.get(r.session_id) ?? []), r])

  const blocks = [...bySession.entries()].map(([sessionId, rs]) => {
    const s = sessions.get(sessionId)!
    const lines = rs.map((r) => {
      const at = formatElapsed(s.started_at, r.item_timestamp) + (r.starred ? ' ★' : '')
      const who = r.type === 'transcript' ? 'Speaker' : r.type === 'note' ? 'Note' : `Photo ${r.id}`
      return `  [${at}] ${who}: ${snippet(`${r.text ?? ''} ${r.type === 'photo' ? r.caption ?? '' : ''}`, words)}`
    })
    return `"${s.title}" (${formatDate(s.started_at)}, id ${s.id})\n${lines.join('\n')}`
  })
  const head = partial
    ? `No entry has all of "${query}"; these mention "${longest}":`
    : `${matches.length} match${matches.length === 1 ? '' : 'es'} for "${query}"${matches.length > shown.length ? `, showing the first ${shown.length}` : ''}:`
  return `${head}\n\n${blocks.join('\n\n')}\n\nUse get_session for the full context of a talk.`
}

async function getSession(admin: SupabaseClient, userId: string, sessionId: string): Promise<string> {
  const session = await oneSession(admin, userId, sessionId)
  const rows = await allPages<ItemRow>((from, to) =>
    admin
      .from('cc_timeline_items')
      .select(ITEM_COLUMNS)
      .eq('owner_id', userId)
      .eq('session_id', sessionId)
      .eq('excluded', false)
      .order('item_timestamp')
      .order('id')
      .range(from, to),
  )

  const head: string[] = [
    `"${session.title}"`,
    `id: ${session.id}`,
    `${formatDate(session.started_at)}${lengthOf(session)}${session.status === 'recording' ? ' -- live now, still being captured' : ''}`,
    `presentation: ${session.deck_status === 'ready' ? 'yes (get_presentation)' : 'no'}`,
  ]
  const lines: string[] = []
  for (const row of rows) {
    const at = formatElapsed(session.started_at, row.item_timestamp) + (row.starred ? ' ★' : '')
    switch (row.type) {
      case 'transcript':
        if (row.text) lines.push(`[${at}] Speaker: ${row.text}`)
        break
      case 'note':
        if (row.text) lines.push(`[${at}] Attendee's note: ${row.text}`)
        break
      case 'photo': {
        const text = (row.text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).join(' / ')
        const caption = row.caption && row.caption !== 'Untitled photo' ? ` "${row.caption}"` : ''
        lines.push(`[${at}] Photo ${row.id}${caption}${text ? ` -- text on it: ${text}` : ' (no text found on it)'}`)
        break
      }
      case 'highlight':
        lines.push(`[${at}] Remembered (the attendee marked this moment as important)`)
        break
      case 'audio':
        lines.push(`[${at}] Audio clip${row.duration_ms ? ` (${Math.round(row.duration_ms / 1000)} s)` : ''}${row.text ? `: ${row.text}` : ''}`)
        break
      case 'video':
        lines.push(`[${at}] Video${row.duration_ms ? ` (${Math.round(row.duration_ms / 1000)} s)` : ''}${row.caption ? `: ${row.caption}` : ''}`)
        break
      case 'enrichment': {
        const p = row.payload ?? {}
        if (row.subtype === 'summary' && p.text) head.push(`summary: ${p.text}`)
        if (row.subtype === 'speaker_bio' && p.name) head.push(`speaker: ${p.name}${p.role ? ` -- ${p.role}` : ''}${p.org ? ` at ${p.org}` : ''}${p.description ? `. ${p.description}` : ''}`)
        break
      }
    }
  }
  const body = lines.length ? lines.join('\n') : 'Nothing captured in this session yet.'
  return `${head.join('\n')}\n\nTimes are minutes into the talk; ★ marks entries the attendee starred.\n\n${body}`
}

async function getPhotos(admin: SupabaseClient, userId: string, ids: unknown): Promise<Content[]> {
  const wanted = (Array.isArray(ids) ? ids : [ids]).map(String).filter((id) => UUID.test(id))
  if (wanted.length === 0) throw new ToolError('Give the photo ids from get_session.')
  if (wanted.length > MAX_PHOTOS) throw new ToolError(`At most ${MAX_PHOTOS} photos per call; ask for the rest in another call.`)

  const { data, error } = await admin
    .from('cc_timeline_items')
    .select('id, session_id, photo_path, caption, item_timestamp, text')
    .eq('owner_id', userId)
    .eq('type', 'photo')
    .in('id', wanted)
  if (error) throw error
  const rows = (data ?? []) as ItemRow[]
  const sessions = new Map((await allSessions(admin, userId)).map((s) => [s.id, s]))

  const content: Content[] = []
  for (const id of wanted) {
    const row = rows.find((r) => r.id === id)
    if (!row?.photo_path) {
      content.push({ type: 'text', text: `Photo ${id}: not found.` })
      continue
    }
    const s = sessions.get(row.session_id)
    const label = `Photo ${id}${s ? ` -- "${s.title}" at ${formatElapsed(s.started_at, row.item_timestamp)}` : ''}`
    const { data: blob, error: dlError } = await admin.storage.from('cc-photos').download(row.photo_path)
    if (dlError || !blob) {
      content.push({ type: 'text', text: `${label}: couldn't be loaded.` })
      continue
    }
    content.push({ type: 'text', text: label })
    content.push({ type: 'image', data: encodeBase64(new Uint8Array(await blob.arrayBuffer())), mimeType: blob.type || 'image/jpeg' })
  }
  return content
}

async function getPresentation(admin: SupabaseClient, userId: string, sessionId: string): Promise<string> {
  const session = await oneSession(admin, userId, sessionId)
  if (session.deck_status !== 'ready' || !session.deck_path) {
    throw new ToolError(`"${session.title}" has no presentation yet. It's made in the app with Sparkle.`)
  }
  const { data: blob, error } = await admin.storage.from('cc-decks').download(session.deck_path)
  if (error || !blob) throw new ToolError(`The presentation for "${session.title}" couldn't be loaded.`)
  const text = htmlToText(await blob.text())

  const { data: shared } = await admin
    .from('cc_shared_decks')
    .select('token')
    .eq('owner_id', userId)
    .eq('session_id', sessionId)
    .maybeSingle()
  const link = shared?.token
    ? `\nShared at: ${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/cc-shared/${userId}/${shared.token}.html`
    : '\nNot shared.'
  return `Presentation for "${session.title}" (${formatDate(session.started_at)})${link}\n\n${text}`
}

// ---- Data ------------------------------------------------------------------

async function allSessions(admin: SupabaseClient, userId: string): Promise<SessionRow[]> {
  return await allPages<SessionRow>((from, to) =>
    admin
      .from('cc_sessions')
      .select('id, title, status, started_at, accumulated_ms, deck_status, deck_path')
      .eq('owner_id', userId)
      .order('started_at')
      .order('id')
      .range(from, to),
  )
}

async function oneSession(admin: SupabaseClient, userId: string, sessionId: string): Promise<SessionRow> {
  const { data, error } = await admin
    .from('cc_sessions')
    .select('id, title, status, started_at, accumulated_ms, deck_status, deck_path')
    .eq('owner_id', userId)
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new ToolError(`No session with id ${sessionId}. list_sessions shows them all.`)
  return data as SessionRow
}

async function allPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1)
    if (error) throw error
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE_ROWS) return rows
  }
}

// ---- Formatting ------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sessionIdArg(value: unknown): string {
  const id = str(value)
  if (!UUID.test(id)) throw new ToolError('Give a session id from list_sessions or search.')
  return id
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

const STOPWORDS = new Set('a an and are as at be but by for from in is it of on or that the this to was with'.split(' '))

function searchWords(query: string): string[] {
  const all = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? [])]
  const kept = all.filter((w) => !STOPWORDS.has(w))
  return kept.length ? kept : all
}

/** About 280 characters around the first word found. */
function snippet(text: string, words: string[]): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const lower = flat.toLowerCase()
  const at = Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0).concat(flat.length))
  const start = Math.max(0, at - 120)
  const end = Math.min(flat.length, at + 160)
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}

function plural(n: number | undefined, word: string): string | false {
  return !!n && `${n} ${word}${n === 1 ? '' : 's'}`
}

function lengthOf(s: SessionRow): string {
  const minutes = Math.round((s.accumulated_ms ?? 0) / 60000)
  return minutes > 0 ? `, ${minutes} min` : ''
}

function formatElapsed(startedAtIso: string, itemIso: string): string {
  const totalSec = Math.max(0, Math.round((new Date(itemIso).getTime() - new Date(startedAtIso).getTime()) / 1000))
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = (totalSec % 60).toString().padStart(2, '0')
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  })
}

/** A presentation page as readable text: headings and paragraphs kept apart,
 * scripts, styles and markup dropped. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, '')
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, (_m, alt) => (alt ? `[Image: ${alt}]` : ''))
    .replace(/<\/(h[1-6]|p|li|div|section|article|header|footer|blockquote|tr|figure|figcaption)>/gi, '\n')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<h([1-6])[^>]*>/gi, (_m, n) => `\n${'#'.repeat(Number(n))} `)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&#8217;/g, '’')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l, i, all) => l || (i > 0 && all[i - 1]))
    .join('\n')
    .trim()
}

// ---- JSON-RPC --------------------------------------------------------------

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result }
}

function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
