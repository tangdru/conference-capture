import { supabase, PHOTOS_BUCKET } from './supabaseClient'
import type { NoteItem, PhotoItem, Session, SessionStatus, TimelineItemData } from './types'

interface SessionRow {
  id: string
  title: string
  status: SessionStatus
  started_at: string
  accumulated_ms: number
  live_span_started_at: string | null
}

interface ItemRow {
  id: string
  session_id: string
  type: 'note' | 'photo'
  text: string | null
  caption: string | null
  photo_path: string | null
  item_timestamp: string
  added_later: boolean
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
  }
}

function itemFromRow(row: ItemRow): TimelineItemData {
  const timestamp = new Date(row.item_timestamp).getTime()
  if (row.type === 'note') {
    return { id: row.id, type: 'note', text: row.text ?? '', timestamp, addedLater: row.added_later }
  }
  return {
    id: row.id,
    type: 'photo',
    photoPath: row.photo_path ?? '',
    caption: row.caption ?? '',
    timestamp,
    addedLater: row.added_later,
  }
}

export async function fetchSessions(userId: string): Promise<Session[]> {
  const [{ data: sessionRows, error: sessionsError }, { data: itemRows, error: itemsError }] = await Promise.all([
    supabase
      .from('cc_sessions')
      .select('id, title, status, started_at, accumulated_ms, live_span_started_at')
      .eq('owner_id', userId)
      .order('started_at', { ascending: false }),
    supabase
      .from('cc_timeline_items')
      .select('id, session_id, type, text, caption, photo_path, item_timestamp, added_later')
      .eq('owner_id', userId)
      .order('item_timestamp', { ascending: true }),
  ])

  if (sessionsError) throw sessionsError
  if (itemsError) throw itemsError

  const itemsBySession = new Map<string, TimelineItemData[]>()
  for (const row of itemRows ?? []) {
    const list = itemsBySession.get(row.session_id) ?? []
    list.push(itemFromRow(row))
    itemsBySession.set(row.session_id, list)
  }

  return (sessionRows ?? []).map((row) => sessionFromRow(row, itemsBySession.get(row.id) ?? []))
}

export async function createSession(userId: string): Promise<Session> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('cc_sessions')
    .insert({
      owner_id: userId,
      title: 'Session',
      status: 'recording',
      started_at: now,
      accumulated_ms: 0,
      live_span_started_at: now,
    })
    .select('id, title, status, started_at, accumulated_ms, live_span_started_at')
    .single()

  if (error) throw error
  return sessionFromRow(data, [])
}

export async function updateSession(
  sessionId: string,
  patch: Partial<{
    status: SessionStatus
    accumulatedMs: number
    liveSpanStartedAt: number | null
  }>,
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.status !== undefined) row.status = patch.status
  if (patch.accumulatedMs !== undefined) row.accumulated_ms = patch.accumulatedMs
  if (patch.liveSpanStartedAt !== undefined) {
    row.live_span_started_at = patch.liveSpanStartedAt ? new Date(patch.liveSpanStartedAt).toISOString() : null
  }

  const { error } = await supabase.from('cc_sessions').update(row).eq('id', sessionId)
  if (error) throw error
}

export async function deleteSession(session: Session): Promise<void> {
  const photoPaths = session.items
    .filter((i): i is PhotoItem => i.type === 'photo')
    .map((i) => i.photoPath)
  if (photoPaths.length > 0) {
    // Best-effort -- orphaned storage objects are a minor cleanup issue,
    // not something that should block the session disappearing for the user.
    await supabase.storage.from(PHOTOS_BUCKET).remove(photoPaths)
  }
  await supabase.from('cc_timeline_items').delete().eq('session_id', session.id)
  const { error } = await supabase.from('cc_sessions').delete().eq('id', session.id)
  if (error) throw error
}

export async function addNote(sessionId: string, userId: string, text: string): Promise<NoteItem> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('cc_timeline_items')
    .insert({ session_id: sessionId, owner_id: userId, type: 'note', text, item_timestamp: now })
    .select('id, item_timestamp')
    .single()

  if (error) throw error
  return { id: data.id, type: 'note', text, timestamp: new Date(data.item_timestamp).getTime() }
}

export async function updateNoteText(itemId: string, text: string): Promise<void> {
  const { error } = await supabase.from('cc_timeline_items').update({ text }).eq('id', itemId)
  if (error) throw error
}

export async function deleteTimelineItem(item: TimelineItemData): Promise<void> {
  if (item.type === 'photo') {
    // Best-effort -- an orphaned storage object is a minor cleanup issue,
    // not something that should block the item disappearing for the user.
    await supabase.storage.from(PHOTOS_BUCKET).remove([item.photoPath])
  }
  const { error } = await supabase.from('cc_timeline_items').delete().eq('id', item.id)
  if (error) throw error
}

export async function addPhoto(sessionId: string, userId: string, blob: Blob): Promise<PhotoItem> {
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
