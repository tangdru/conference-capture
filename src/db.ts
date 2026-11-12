import { supabase, PHOTOS_BUCKET, VIDEOS_BUCKET, DECKS_BUCKET } from './supabaseClient'
import { cancelPhotoUploads } from './photoUploads'
import { forgetClipUpload, removeClip, removeSessionClips } from './clips'
import {
  dropQueuedSession, flushOutbox, queuedEntries, queueItemDelete, queueItemPatch, queueRow, queueSession,
  queueSessionDelete, queueSessionPatch, type ItemPatch, type QueuedRow, type SessionPatch, type StoredFile,
} from './itemOutbox'
import { MESSAGES } from './networkError'
import type { AudioItem, DeckStatus, EnrichmentItemData, HighlightItem, NoteItem, PhotoItem, Session, SessionStatus, TimelineItemData, TranscriptItem, VideoItem } from './types'

const ITEM_COLUMNS = 'id, session_id, type, subtype, payload, text, caption, photo_path, video_path, duration_ms, item_timestamp, added_later, excluded, starred, position'
const SESSION_COLUMNS = 'id, title, status, started_at, accumulated_ms, live_span_started_at, deck_status, deck_path, deck_error, deck_generated_at, deck_heartbeat_at, updated_at, pinned_at, deck_cover_photo_id, deck_read_minutes'

interface SessionRow {
  id: string
  title: string
  status: SessionStatus
  started_at: string
  accumulated_ms: number
  live_span_started_at: string | null
  deck_status: DeckStatus
  deck_path: string | null
  deck_error: string | null
  deck_generated_at: string | null
  deck_heartbeat_at: string | null
  updated_at: string
  pinned_at: string | null
  deck_cover_photo_id: string | null
  deck_read_minutes: number | null
}

interface ItemRow {
  id: string
  session_id: string
  type: 'note' | 'photo' | 'video' | 'transcript' | 'highlight' | 'audio' | 'enrichment'
  subtype: string | null
  payload: Record<string, unknown> | null
  text: string | null
  caption: string | null
  photo_path: string | null
  video_path: string | null
  duration_ms: number | null
  item_timestamp: string
  added_later: boolean
  excluded: boolean
  starred: boolean
  position: number | null
}

// A round reports in within about two minutes. A crash can't report at all
// (running out of memory ends the function on the spot), so silence this long
// means the build died and would otherwise read as "building" forever.
const DECK_SILENCE_MS = 6 * 60 * 1000

function deckProgress(row: Pick<SessionRow, 'deck_status' | 'deck_error' | 'deck_heartbeat_at'>): { deckStatus: DeckStatus; deckError: string | null } {
  const lastHeard = row.deck_heartbeat_at ? new Date(row.deck_heartbeat_at).getTime() : 0
  if (row.deck_status === 'generating' && Date.now() - lastHeard > DECK_SILENCE_MS) {
    return { deckStatus: 'error', deckError: MESSAGES.stopped }
  }
  return { deckStatus: row.deck_status, deckError: row.deck_error }
}

function sessionFromRow(row: SessionRow, items: TimelineItemData[]): Session {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    startedAt: new Date(row.started_at).getTime(),
    accumulatedMs: row.accumulated_ms,
    liveSpanStartedAt: row.live_span_started_at ? new Date(row.live_span_started_at).getTime() : null,
    items,
    ...deckProgress(row),
    deckPath: row.deck_path,
    deckGeneratedAt: row.deck_generated_at ? new Date(row.deck_generated_at).getTime() : null,
    updatedAt: new Date(row.updated_at).getTime(),
    pinnedAt: row.pinned_at ? new Date(row.pinned_at).getTime() : null,
    deckCoverPhotoId: row.deck_cover_photo_id,
    deckReadMinutes: row.deck_read_minutes,
  }
}

function enrichmentItemFromRow(row: ItemRow): EnrichmentItemData | null {
  const timestamp = new Date(row.item_timestamp).getTime()
  const excluded = row.excluded || undefined
  const starred = row.starred || undefined
  const payload = row.payload ?? {}

  switch (row.subtype) {
    case 'summary':
      return { id: row.id, type: 'enrichment', subtype: 'summary', timestamp, excluded, starred, text: String(payload.text ?? '') }
    case 'action_items':
      return {
        id: row.id,
        type: 'enrichment',
        subtype: 'action_items',
        timestamp,
        excluded,
        starred,
        items: Array.isArray(payload.items) ? (payload.items as { text: string; context: string }[]) : [],
      }
    case 'references':
      return {
        id: row.id,
        type: 'enrichment',
        subtype: 'references',
        timestamp,
        excluded,
        starred,
        items: Array.isArray(payload.items)
          ? (payload.items as { title: string; source: string; description: string; url: string | null }[])
          : [],
      }
    case 'speaker_bio':
      return {
        id: row.id,
        type: 'enrichment',
        subtype: 'speaker_bio',
        timestamp,
        excluded,
        starred,
        name: String(payload.name ?? ''),
        role: String(payload.role ?? ''),
        org: String(payload.org ?? ''),
        description: String(payload.description ?? ''),
      }
    case 'acronyms':
      return {
        id: row.id,
        type: 'enrichment',
        subtype: 'acronyms',
        timestamp,
        excluded,
        starred,
        items: Array.isArray(payload.items) ? (payload.items as { term: string; expansion: string }[]) : [],
      }
    default:
      return null
  }
}

function itemFromRow(row: ItemRow): TimelineItemData | null {
  const timestamp = new Date(row.item_timestamp).getTime()
  const excluded = row.excluded || undefined
  const starred = row.starred || undefined
  if (row.type === 'note') {
    return { id: row.id, type: 'note', text: row.text ?? '', timestamp, addedLater: row.added_later, excluded, starred, position: row.position ?? undefined }
  }
  if (row.type === 'video') {
    return {
      id: row.id,
      type: 'video',
      videoPath: row.video_path ?? '',
      durationMs: row.duration_ms ?? 0,
      timestamp,
      addedLater: row.added_later,
      excluded,
      starred,
    }
  }
  if (row.type === 'transcript') {
    return { id: row.id, type: 'transcript', text: row.text ?? '', timestamp, durationMs: row.duration_ms ?? 0, excluded, starred }
  }
  if (row.type === 'highlight') {
    return { id: row.id, type: 'highlight', timestamp, excluded }
  }
  if (row.type === 'audio') {
    const p = (row.payload ?? {}) as Partial<AudioPayload>
    const durationMs = row.duration_ms ?? 0
    return {
      id: row.id,
      type: 'audio',
      timestamp,
      startedAt: typeof p.startedAt === 'number' ? p.startedAt : null,
      durationMs,
      trimStartMs: typeof p.trimStartMs === 'number' ? p.trimStartMs : 0,
      trimEndMs: typeof p.trimEndMs === 'number' ? p.trimEndMs : durationMs,
      peaks: Array.isArray(p.peaks) ? p.peaks : [],
      audioPath: typeof p.path === 'string' ? p.path : null,
      excluded,
      starred,
    }
  }
  if (row.type === 'enrichment') {
    return enrichmentItemFromRow(row)
  }
  return {
    id: row.id,
    type: 'photo',
    photoPath: row.photo_path ?? '',
    caption: row.caption ?? '',
    slideText: row.text ?? undefined,
    timestamp,
    addedLater: row.added_later,
    excluded,
    starred,
    position: row.position ?? undefined,
  }
}

// Supabase returns at most this many rows per request, without saying it
// stopped short; a busy conference day passes it.
const PAGE_ROWS = 1000

/** Every row of a query, a page at a time. `page` builds the query for rows
 * from..to (inclusive), ordered so pages don't overlap. */
async function allPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1)
    if (error) return { data: rows, error }
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_ROWS) return { data: rows, error: null }
  }
}

/** Where loading left off: the server's time of the newest change seen. */
export type SyncCursor = string | null

export interface LoadedSessions {
  sessions: Session[]
  cursor: SyncCursor
}

// A saved copy older than this is reloaded in full, so anything that ever
// went astray (a change the server refused, say) can't linger for long.
const FULL_RELOAD_MS = 24 * 60 * 60 * 1000
// Asks again for a little before the cursor: a change saved while the last
// load was running can carry a time just before what that load saw.
const CURSOR_OVERLAP_MS = 2 * 60 * 1000

function positionOf(item: TimelineItemData): number {
  return 'position' in item && item.position != null ? item.position : Infinity
}

/** The server's order: position (older builds), then time, then id. */
function sortItems(items: TimelineItemData[]): TimelineItemData[] {
  return items.sort((a, b) =>
    positionOf(a) - positionOf(b) || a.timestamp - b.timestamp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function cursorAge(cursor: SyncCursor): number {
  return cursor ? Date.now() - new Date(cursor).getTime() : Infinity
}

function later(a: SyncCursor, b: string | null | undefined): SyncCursor {
  if (!b) return a
  return !a || new Date(b).getTime() > new Date(a).getTime() ? b : a
}

/** Postgres or PostgREST saying a column or table isn't there (the database
 * hasn't had the change that tracks edits yet). */
function isMissingSchema(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? ''
  return code === '42703' || code === '42P01' || code === 'PGRST204' || code === 'PGRST205'
}

async function fetchSessionRows(userId: string): Promise<SessionRow[]> {
  const { data, error } = await supabase
    .from('cc_sessions')
    .select(SESSION_COLUMNS)
    .eq('owner_id', userId)
    .order('started_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

type ItemRowWithTime = ItemRow & { updated_at?: string }

/** Every session with every entry. */
async function fetchEverything(userId: string): Promise<LoadedSessions> {
  const itemPages = (columns: string) => allPages<ItemRowWithTime>((from, to) => supabase
    .from('cc_timeline_items')
    .select(columns)
    .eq('owner_id', userId)
    .order('position', { ascending: true, nullsFirst: false })
    .order('item_timestamp', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to) as unknown as PromiseLike<{ data: ItemRowWithTime[] | null; error: unknown }>)
  const [sessionRows, firstTry] = await Promise.all([fetchSessionRows(userId), itemPages(`${ITEM_COLUMNS}, updated_at`)])
  let { data: itemRows, error: itemsError } = firstTry
  let tracked = true
  if (itemsError && isMissingSchema(itemsError)) {
    tracked = false
    ;({ data: itemRows, error: itemsError } = await itemPages(ITEM_COLUMNS))
  }
  if (itemsError) throw itemsError

  let cursor: SyncCursor = null
  const itemsBySession = new Map<string, TimelineItemData[]>()
  for (const row of itemRows) {
    if (tracked) cursor = later(cursor, row.updated_at)
    const item = itemFromRow(row)
    if (!item) continue
    const list = itemsBySession.get(row.session_id) ?? []
    list.push(item)
    itemsBySession.set(row.session_id, list)
  }
  // With nothing loaded there's nothing to compare against: start from now.
  if (tracked && !cursor) cursor = new Date(Date.now() - CURSOR_OVERLAP_MS).toISOString()
  return {
    sessions: sessionRows.map((row) => sessionFromRow(row, itemsBySession.get(row.id) ?? [])),
    cursor,
  }
}

/** Sessions as stored on the server. Given what was loaded last time, asks
 * only for entries added, changed or deleted since then -- the session list
 * itself is small and always comes whole -- instead of every entry again. */
export async function loadSessions(userId: string, previous?: LoadedSessions | null): Promise<LoadedSessions> {
  if (!previous?.cursor || cursorAge(previous.cursor) > FULL_RELOAD_MS) return fetchEverything(userId)
  const since = new Date(new Date(previous.cursor).getTime() - CURSOR_OVERLAP_MS).toISOString()
  try {
    const [sessionRows, changed, deleted] = await Promise.all([
      fetchSessionRows(userId),
      allPages<ItemRowWithTime>((from, to) => supabase
        .from('cc_timeline_items')
        .select(`${ITEM_COLUMNS}, updated_at`)
        .eq('owner_id', userId)
        .gt('updated_at', since)
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: ItemRowWithTime[] | null; error: unknown }>),
      allPages<{ id: string; deleted_at: string }>((from, to) => supabase
        .from('cc_deleted_items')
        .select('id, deleted_at')
        .eq('owner_id', userId)
        .gt('deleted_at', since)
        .order('deleted_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)),
    ])
    if (changed.error) throw changed.error
    if (deleted.error) throw deleted.error

    let cursor: SyncCursor = previous.cursor
    const gone = new Set<string>()
    for (const row of deleted.data) {
      gone.add(row.id)
      cursor = later(cursor, row.deleted_at)
    }
    const changedBySession = new Map<string, Map<string, TimelineItemData>>()
    for (const row of changed.data) {
      cursor = later(cursor, row.updated_at)
      const item = itemFromRow(row)
      if (!item) continue
      const map = changedBySession.get(row.session_id) ?? new Map<string, TimelineItemData>()
      map.set(item.id, item)
      changedBySession.set(row.session_id, map)
    }

    const before = new Map(previous.sessions.map((s) => [s.id, s]))
    const sessions = sessionRows.map((row) => {
      const updates = changedBySession.get(row.id)
      const kept = (before.get(row.id)?.items ?? []).filter((i) => !gone.has(i.id) && !updates?.has(i.id))
      const items = updates ? sortItems([...kept, ...updates.values()]) : kept
      return sessionFromRow(row, items)
    })
    return { sessions, cursor }
  } catch (err) {
    // The database doesn't track changes yet: load everything, as before.
    if (isMissingSchema(err)) return fetchEverything(userId)
    throw err
  }
}

/** Sessions plus everything still on the phone waiting to be sent: sessions
 * started with no signal, new entries, and edits and deletions not yet made
 * on the server -- so the app shows what the user did, not what Supabase has
 * heard so far. */
export async function withQueued(sessions: Session[]): Promise<Session[]> {
  const entries = await queuedEntries()
  if (entries.length === 0) return sessions
  let result = [...sessions]
  const byId = () => new Map(result.map((s, i) => [s.id, i]))
  for (const e of entries) {
    const index = byId()
    switch (e.op) {
      case 'session':
        if (!index.has(e.row.id)) result.unshift(sessionFromRow(newSessionRow(e.row), []))
        else result[index.get(e.row.id)!] = applySessionPatch(result[index.get(e.row.id)!], e.row)
        break
      case 'patchSession':
        if (index.has(e.id)) result[index.get(e.id)!] = applySessionPatch(result[index.get(e.id)!], e.patch)
        break
      case 'deleteSession':
        result = result.filter((s) => s.id !== e.id)
        break
      case 'item': {
        const i = index.get(e.row.session_id)
        if (i === undefined) break
        const s = result[i]
        const item = queuedItem(e.row)
        const items = s.items.some((x) => x.id === item.id)
          ? s.items.map((x) => (x.id === item.id ? { ...x, ...item } as TimelineItemData : x))
          : sortItems([...s.items, item])
        result[i] = { ...s, items }
        break
      }
      case 'patchItem': {
        const i = index.get(e.sessionId)
        if (i === undefined) break
        const s = result[i]
        result[i] = { ...s, items: sortItems(s.items.map((x) => (x.id === e.id ? applyItemPatch(x, e.patch) : x))) }
        break
      }
      case 'deleteItem': {
        const i = index.get(e.sessionId)
        if (i === undefined) break
        result[i] = { ...result[i], items: result[i].items.filter((x) => x.id !== e.id) }
        break
      }
    }
  }
  return result
}

function applySessionPatch(s: Session, p: SessionPatch): Session {
  const time = (v: string | null | undefined) => (v ? new Date(v).getTime() : null)
  return {
    ...s,
    ...(p.title !== undefined && { title: p.title }),
    ...(p.status !== undefined && { status: p.status as SessionStatus }),
    ...(p.accumulated_ms !== undefined && { accumulatedMs: p.accumulated_ms }),
    ...(p.live_span_started_at !== undefined && { liveSpanStartedAt: time(p.live_span_started_at) }),
    ...(p.updated_at !== undefined && { updatedAt: Math.max(s.updatedAt, time(p.updated_at) ?? 0) }),
    ...(p.pinned_at !== undefined && { pinnedAt: time(p.pinned_at) }),
  }
}

function applyItemPatch(item: TimelineItemData, p: ItemPatch): TimelineItemData {
  const next = { ...item } as TimelineItemData & { text?: string; position?: number }
  if (p.text !== undefined && 'text' in next) next.text = p.text
  if (p.starred !== undefined) (next as { starred?: boolean }).starred = p.starred || undefined
  if (p.excluded !== undefined) next.excluded = p.excluded || undefined
  if (p.item_timestamp !== undefined) next.timestamp = new Date(p.item_timestamp).getTime()
  if (p.position !== undefined && 'position' in next) next.position = p.position ?? undefined
  if (next.type === 'audio' && (p.payload !== undefined || p.duration_ms !== undefined)) {
    const audio = itemFromRow({
      id: next.id, session_id: '', type: 'audio', subtype: null, text: null, caption: null, photo_path: null, video_path: null,
      payload: p.payload ?? audioPayload(next) as unknown as Record<string, unknown>,
      duration_ms: p.duration_ms ?? next.durationMs,
      item_timestamp: new Date(next.timestamp).toISOString(), added_later: false, excluded: !!next.excluded, starred: !!next.starred, position: null,
    })
    if (audio?.type === 'audio') return { ...audio, recording: next.recording }
  }
  return next
}

function queuedItem(row: QueuedRow): TimelineItemData {
  const timestamp = new Date(row.item_timestamp).getTime()
  const shared = { id: row.id, timestamp, excluded: row.excluded || undefined }
  if (row.type === 'transcript') {
    return { ...shared, type: 'transcript', text: row.text ?? '', durationMs: row.duration_ms ?? 0, starred: row.starred || undefined }
  }
  if (row.type === 'note') {
    return { ...shared, type: 'note', text: row.text ?? '', starred: row.starred || undefined, position: row.position ?? undefined }
  }
  if (row.type === 'audio') {
    const audio = itemFromRow({
      id: row.id, session_id: row.session_id, type: 'audio', subtype: null, text: null, caption: null, photo_path: null, video_path: null,
      payload: row.payload ?? null, duration_ms: row.duration_ms ?? 0, item_timestamp: row.item_timestamp,
      added_later: false, excluded: !!row.excluded, starred: !!row.starred, position: null,
    })
    if (audio) return audio
  }
  return { ...shared, type: 'highlight' }
}

/** Starts a session on the phone at once -- no signal needed. It reaches
 * Supabase through the outbox, ahead of anything captured in it. */
export async function createSession(userId: string): Promise<Session> {
  const now = new Date().toISOString()
  const row = {
    id: crypto.randomUUID(),
    owner_id: userId,
    title: 'Session',
    status: 'recording' as SessionStatus,
    started_at: now,
    accumulated_ms: 0,
    live_span_started_at: now,
    updated_at: now,
  }
  await queueSession(row)
  return sessionFromRow(newSessionRow(row), [])
}

/** A session row as the server would return it, for one not sent yet. */
function newSessionRow(row: { id: string; title: string; status: string; started_at: string; accumulated_ms: number; live_span_started_at: string | null; updated_at: string; pinned_at?: string | null }): SessionRow {
  return {
    id: row.id,
    title: row.title,
    status: row.status as SessionStatus,
    started_at: row.started_at,
    accumulated_ms: row.accumulated_ms,
    live_span_started_at: row.live_span_started_at,
    deck_status: 'none',
    deck_path: null,
    deck_error: null,
    deck_generated_at: null,
    deck_heartbeat_at: null,
    updated_at: row.updated_at,
    pinned_at: row.pinned_at ?? null,
    deck_cover_photo_id: null,
    deck_read_minutes: null,
  }
}

/** Pins or unpins a session. Only the pin changes: not the session's last
 * activity, so pinning doesn't reorder the list. */
export async function setSessionPinned(sessionId: string, pinnedAt: number | null): Promise<void> {
  await queueSessionPatch(sessionId, { pinned_at: pinnedAt === null ? null : new Date(pinnedAt).toISOString() })
}

export async function updateSession(
  sessionId: string,
  patch: Partial<{
    title: string
    status: SessionStatus
    accumulatedMs: number
    liveSpanStartedAt: number | null
  }>,
): Promise<void> {
  const row: SessionPatch = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) row.title = patch.title
  if (patch.status !== undefined) row.status = patch.status
  if (patch.accumulatedMs !== undefined) row.accumulated_ms = patch.accumulatedMs
  if (patch.liveSpanStartedAt !== undefined) {
    row.live_span_started_at = patch.liveSpanStartedAt ? new Date(patch.liveSpanStartedAt).toISOString() : null
  }
  // Pausing and resuming wait on the phone when there's no signal.
  await queueSessionPatch(sessionId, row)
}

/** Permanently deletes the signed-in account and everything in it, on the
 * server and on this phone, then signs out. */
export async function deleteAccount(sessionIds: string[]): Promise<void> {
  // Stop anything still uploading first, so nothing lands after the delete.
  for (const id of sessionIds) {
    await cancelPhotoUploads({ sessionId: id })
    dropQueuedSession(id)
  }
  const { error } = await supabase.functions.invoke('delete-account', { body: {} })
  if (error) throw error
  for (const id of sessionIds) await removeSessionClips(id)
  // Remembered sort order, tours and the like belong to the old account.
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('cc-')) localStorage.removeItem(key)
    }
  } catch {
    // Storage off: nothing to clear.
  }
  await supabase.auth.signOut({ scope: 'local' })
}

/** Deletes a session, its entries (the database removes them with it) and
 * its files -- from the phone at once, from Supabase when there's signal. */
export async function deleteSession(session: Session): Promise<void> {
  await cancelPhotoUploads({ sessionId: session.id })
  await removeSessionClips(session.id)
  const files: StoredFile[] = [
    ...session.items.flatMap((i) => filesOf(i)),
    ...(session.deckPath ? [{ bucket: DECKS_BUCKET, path: session.deckPath }] : []),
  ]
  await queueSessionDelete(session.id, files)
}

function filesOf(item: TimelineItemData): StoredFile[] {
  if (item.type === 'photo' && item.photoPath) return [{ bucket: PHOTOS_BUCKET, path: item.photoPath }]
  if (item.type === 'video' && item.videoPath) return [{ bucket: VIDEOS_BUCKET, path: item.videoPath }]
  if (item.type === 'audio' && item.audioPath) return [{ bucket: VIDEOS_BUCKET, path: item.audioPath }]
  return []
}

export async function addNote(sessionId: string, userId: string, text: string): Promise<NoteItem> {
  const id = crypto.randomUUID()
  const timestamp = Date.now()
  await queueRow({ id, session_id: sessionId, owner_id: userId, type: 'note', text, item_timestamp: new Date(timestamp).toISOString() })
  return { id, type: 'note', text, timestamp }
}

export async function addHighlight(sessionId: string, userId: string): Promise<HighlightItem> {
  const id = crypto.randomUUID()
  const timestamp = Date.now()
  await queueRow({ id, session_id: sessionId, owner_id: userId, type: 'highlight', item_timestamp: new Date(timestamp).toISOString() })
  return { id, type: 'highlight', timestamp }
}

/** An audio clip's details, kept in the row's payload. */
export interface AudioPayload {
  startedAt: number | null
  trimStartMs: number
  trimEndMs: number
  peaks: number[]
  /** The kept part, uploaded to cc-videos. */
  path: string | null
}

export function audioPayload(item: AudioItem): AudioPayload {
  return { startedAt: item.startedAt, trimStartMs: item.trimStartMs, trimEndMs: item.trimEndMs, peaks: item.peaks, path: item.audioPath }
}

/** The clip button was tapped: the clip's entry, before its audio is saved. */
export async function addAudioClip(sessionId: string, userId: string): Promise<AudioItem> {
  const id = crypto.randomUUID()
  const timestamp = Date.now()
  const item: AudioItem = { id, type: 'audio', timestamp, startedAt: null, durationMs: 0, trimStartMs: 0, trimEndMs: 0, peaks: [], audioPath: null, recording: true }
  await queueRow({ id, session_id: sessionId, owner_id: userId, type: 'audio', duration_ms: 0, payload: audioPayload(item) as unknown as Record<string, unknown>, item_timestamp: new Date(timestamp).toISOString() })
  return item
}

/** Saves a clip's audio details (length, trim, waveform, uploaded file). */
export async function updateAudioClip(sessionId: string, item: AudioItem): Promise<void> {
  await queueItemPatch(item.id, sessionId, { duration_ms: item.durationMs, payload: audioPayload(item) as unknown as Record<string, unknown> })
}

export async function updateNoteText(sessionId: string, itemId: string, text: string): Promise<void> {
  await queueItemPatch(itemId, sessionId, { text })
}

export async function setItemStarred(sessionId: string, itemId: string, starred: boolean): Promise<void> {
  await queueItemPatch(itemId, sessionId, { starred })
}

export async function setItemExcluded(sessionId: string, itemId: string, excluded: boolean): Promise<void> {
  await queueItemPatch(itemId, sessionId, { excluded })
}

/** The user dragged a note or photo to a new spot. A timeline is in time
 * order, so the entry moves to that moment in the talk, and is marked as
 * placed by the user: Sparkle never moves it again. */
export async function placeItem(sessionId: string, itemId: string, timestamp: number): Promise<void> {
  await queueItemPatch(itemId, sessionId, { item_timestamp: new Date(timestamp).toISOString(), placement_locked: true })
}

/** A session last arranged by an older build, which saved a position on
 * every entry, switches to time order the first time it's dragged here:
 * entries take the given times (just enough to keep the order shown), its
 * notes and photos count as placed by the user, and the positions go. */
export async function convertToTimeOrder(sessionId: string, times: Map<string, number>): Promise<void> {
  const results = await Promise.all(
    [...times].map(([id, t]) =>
      supabase.from('cc_timeline_items').update({ item_timestamp: new Date(t).toISOString() }).eq('id', id),
    ),
  )
  const firstError = results.find((r) => r.error)?.error
  if (firstError) throw firstError
  const locked = await supabase
    .from('cc_timeline_items')
    .update({ placement_locked: true })
    .eq('session_id', sessionId)
    .in('type', ['note', 'photo'])
  if (locked.error) throw locked.error
  const cleared = await supabase.from('cc_timeline_items').update({ position: null }).eq('session_id', sessionId)
  if (cleared.error) throw cleared.error
}

export async function deleteTimelineItem(sessionId: string, item: TimelineItemData): Promise<void> {
  if (item.type === 'highlight' || item.type === 'audio') await removeClip(item.id)
  if (item.type === 'audio') forgetClipUpload(item.id)
  if (item.type === 'photo' && item.uploading) await cancelPhotoUploads({ id: item.id })
  await queueItemDelete(item.id, sessionId, filesOf(item))
}

export async function addPhoto(sessionId: string, userId: string, blob: Blob): Promise<PhotoItem> {
  // A session started with no signal must reach Supabase before its photos.
  await flushOutbox()
  const path = `${userId}/${sessionId}/${crypto.randomUUID()}.jpg`

  const { error: uploadError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (uploadError) throw uploadError

  const now = new Date().toISOString()
  const caption = 'Untitled photo'
  const { data, error } = await supabase
    .from('cc_timeline_items')
    .insert({
      session_id: sessionId,
      owner_id: userId,
      type: 'photo',
      photo_path: path,
      caption,
      item_timestamp: now,
    })
    .select('id, item_timestamp')
    .single()

  if (error) throw error
  return {
    id: data.id,
    type: 'photo',
    photoPath: path,
    caption,
    timestamp: new Date(data.item_timestamp).getTime(),
    dataUrl: URL.createObjectURL(blob),
  }
}

/** After on-device processing: a flattened slide, if one was found, becomes
 * the photo shown and used for the deck (the original stays in storage, its
 * path kept in `payload`), and the text read off it goes in `text`. */
export async function saveProcessedPhoto(
  item: PhotoItem,
  sessionId: string,
  userId: string,
  result: { flattened?: Blob; text: string },
): Promise<Pick<PhotoItem, 'photoPath' | 'slideText' | 'dataUrl'>> {
  const update: Record<string, unknown> = { text: result.text }
  let photoPath = item.photoPath
  if (result.flattened) {
    photoPath = `${userId}/${sessionId}/${crypto.randomUUID()}.jpg`
    const { error: uploadError } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .upload(photoPath, result.flattened, { contentType: 'image/jpeg', upsert: false })
    if (uploadError) throw uploadError
    update.photo_path = photoPath
    update.payload = { originalPhotoPath: item.photoPath }
  }
  const { error } = await supabase.from('cc_timeline_items').update(update).eq('id', item.id)
  if (error) throw error
  return {
    photoPath,
    slideText: result.text,
    dataUrl: result.flattened ? URL.createObjectURL(result.flattened) : item.dataUrl,
  }
}

const photoUrlCache = new Map<string, string>()

export async function resolvePhotoUrl(path: string): Promise<string> {
  const cached = photoUrlCache.get(path)
  if (cached) return cached

  const { data, error } = await supabase.storage.from(PHOTOS_BUCKET).download(path)
  if (error) throw error
  const url = URL.createObjectURL(data)
  photoUrlCache.set(path, url)
  return url
}

export async function addVideo(
  sessionId: string,
  userId: string,
  blob: Blob,
  durationMs: number,
): Promise<VideoItem> {
  await flushOutbox()
  const extension = blob.type.includes('mp4') ? 'mp4' : 'webm'
  const path = `${userId}/${sessionId}/${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from(VIDEOS_BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false })
  if (uploadError) throw uploadError

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('cc_timeline_items')
    .insert({
      session_id: sessionId,
      owner_id: userId,
      type: 'video',
      video_path: path,
      duration_ms: durationMs,
      item_timestamp: now,
    })
    .select('id, item_timestamp')
    .single()

  if (error) throw error
  return {
    id: data.id,
    type: 'video',
    videoPath: path,
    durationMs,
    timestamp: new Date(data.item_timestamp).getTime(),
    dataUrl: URL.createObjectURL(blob),
  }
}

const videoUrlCache = new Map<string, string>()

export async function resolveVideoUrl(path: string): Promise<string> {
  const cached = videoUrlCache.get(path)
  if (cached) return cached

  const { data, error } = await supabase.storage.from(VIDEOS_BUCKET).download(path)
  if (error) throw error
  const url = URL.createObjectURL(data)
  videoUrlCache.set(path, url)
  return url
}

export async function addTranscriptSegment(
  sessionId: string,
  userId: string,
  text: string,
  timestamp: number,
  durationMs: number,
): Promise<TranscriptItem> {
  const id = crypto.randomUUID()
  await queueRow({
    id,
    session_id: sessionId,
    owner_id: userId,
    type: 'transcript',
    text,
    duration_ms: durationMs,
    item_timestamp: new Date(timestamp).toISOString(),
  })
  return { id, type: 'transcript', text, timestamp, durationMs }
}

/** A function's own message (one of the app's fixed messages) when it
 * answered with an error, else the error as it came. */
async function functionError(error: unknown): Promise<unknown> {
  const context = (error as { context?: Response } | null)?.context
  if (context && typeof context.json === 'function') {
    const body = await context.clone().json().catch(() => null) as { error?: unknown } | null
    if (typeof body?.error === 'string') return new Error(body.error)
  }
  return error
}

export async function generateDeck(sessionId: string): Promise<void> {
  await flushOutbox()
  const { error } = await supabase.functions.invoke('generate-deck', { body: { sessionId } })
  if (error) throw await functionError(error)
}

/** "Ask a session": answered from what was captured in it. `history` is the
 * conversation so far, oldest first. */
export async function askSession(
  sessionId: string,
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<string> {
  await flushOutbox()
  const { data, error } = await supabase.functions.invoke('ask-session', { body: { sessionId, question, history } })
  if (error) throw await functionError(error)
  return data.answer
}

/** Ask across every session. `sessions` maps the answer's citation labels
 * ([S2 12:30]) to session ids. */
export async function askAllSessions(
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<{ answer: string; sessions: Record<string, string> }> {
  await flushOutbox()
  const { data, error } = await supabase.functions.invoke('ask-session', { body: { scope: 'all', question, history } })
  if (error) throw await functionError(error)
  return { answer: data.answer, sessions: data.sessions ?? {} }
}

/** Re-fetches a session's items -- used after Sparkle saves entries into the
 * session server-side, so the timeline picks them up without a full reload. */
export async function fetchSessionItems(sessionId: string): Promise<TimelineItemData[]> {
  const { data, error } = await allPages<ItemRow>((from, to) => supabase
    .from('cc_timeline_items')
    .select(ITEM_COLUMNS)
    .eq('session_id', sessionId)
    .order('position', { ascending: true, nullsFirst: false })
    .order('item_timestamp', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to))
  if (error) throw error

  const items: TimelineItemData[] = []
  for (const row of data ?? []) {
    const item = itemFromRow(row)
    if (item) items.push(item)
  }
  return items
}

export async function fetchSessionDeckState(
  sessionId: string,
): Promise<{
  title: string
  deckStatus: DeckStatus
  deckPath: string | null
  deckError: string | null
  deckGeneratedAt: number | null
  deckCoverPhotoId: string | null
  deckReadMinutes: number | null
}> {
  // The title too: generating names a session that was never named.
  const { data, error } = await supabase
    .from('cc_sessions')
    .select('title, deck_status, deck_path, deck_error, deck_generated_at, deck_heartbeat_at, deck_cover_photo_id, deck_read_minutes')
    .eq('id', sessionId)
    .single()
  if (error) throw error
  return {
    title: data.title,
    ...deckProgress(data),
    deckPath: data.deck_path,
    deckGeneratedAt: data.deck_generated_at ? new Date(data.deck_generated_at).getTime() : null,
    deckCoverPhotoId: data.deck_cover_photo_id,
    deckReadMinutes: data.deck_read_minutes,
  }
}

/** The generated page's HTML itself -- for showing it in-app (DeckViewer). */
export async function fetchDeckHtml(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(DECKS_BUCKET).download(path)
  if (error) throw error
  return data.text()
}

/** Saves a presentation back over itself (after its photos were shrunk). */
export async function replaceDeckHtml(path: string, html: string): Promise<void> {
  const { error } = await supabase.storage
    .from(DECKS_BUCKET)
    .upload(path, new Blob([html], { type: 'text/html' }), { contentType: 'text/html', upsert: true })
  if (error) throw error
}

