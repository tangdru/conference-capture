import { supabase, PHOTOS_BUCKET, VIDEOS_BUCKET, DECKS_BUCKET } from './supabaseClient'
import type { DeckStatus, EnrichmentItemData, NoteItem, PhotoItem, Session, SessionStatus, TimelineItemData, TranscriptItem, VideoItem } from './types'

const ITEM_COLUMNS = 'id, session_id, type, subtype, payload, text, caption, photo_path, video_path, duration_ms, item_timestamp, added_later, excluded, position'
const SESSION_COLUMNS = 'id, title, status, started_at, accumulated_ms, live_span_started_at, deck_status, deck_path, deck_error, deck_generated_at, enrichment_error, updated_at'

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
  enrichment_error: string | null
  updated_at: string
}

interface ItemRow {
  id: string
  session_id: string
  type: 'note' | 'photo' | 'video' | 'transcript' | 'enrichment'
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
  position: number | null
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
    deckStatus: row.deck_status,
    deckPath: row.deck_path,
    deckError: row.deck_error,
    deckGeneratedAt: row.deck_generated_at ? new Date(row.deck_generated_at).getTime() : null,
    enrichmentError: row.enrichment_error,
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

function enrichmentItemFromRow(row: ItemRow): EnrichmentItemData | null {
  const timestamp = new Date(row.item_timestamp).getTime()
  const excluded = row.excluded || undefined
  const payload = row.payload ?? {}

  switch (row.subtype) {
    case 'summary':
      return { id: row.id, type: 'enrichment', subtype: 'summary', timestamp, excluded, text: String(payload.text ?? '') }
    case 'action_item':
      return {
        id: row.id,
        type: 'enrichment',
        subtype: 'action_item',
        timestamp,
        excluded,
        text: String(payload.text ?? ''),
        context: String(payload.context ?? ''),
      }
    case 'reference':
      return {
        id: row.id,
        type: 'enrichment',
        subtype: 'reference',
        timestamp,
        excluded,
        title: String(payload.title ?? ''),
        source: String(payload.source ?? ''),
        description: String(payload.description ?? ''),
        url: typeof payload.url === 'string' ? payload.url : null,
      }
    case 'speaker_bio':
      return {
        id: row.id,
        type: 'enrichment',
        subtype: 'speaker_bio',
        timestamp,
        excluded,
        name: String(payload.name ?? ''),
        role: String(payload.role ?? ''),
        org: String(payload.org ?? ''),
        description: String(payload.description ?? ''),
      }
    case 'acronym':
      return {
        id: row.id,
        type: 'enrichment',
        subtype: 'acronym',
        timestamp,
        excluded,
        term: String(payload.term ?? ''),
        expansion: String(payload.expansion ?? ''),
      }
    default:
      return null
  }
}

function itemFromRow(row: ItemRow): TimelineItemData | null {
  const timestamp = new Date(row.item_timestamp).getTime()
  const excluded = row.excluded || undefined
  if (row.type === 'note') {
    return { id: row.id, type: 'note', text: row.text ?? '', timestamp, addedLater: row.added_later, excluded, position: row.position ?? undefined }
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
    }
  }
  if (row.type === 'transcript') {
    return { id: row.id, type: 'transcript', text: row.text ?? '', timestamp, durationMs: row.duration_ms ?? 0, excluded }
  }
  if (row.type === 'enrichment') {
    return enrichmentItemFromRow(row)
  }
  return {
    id: row.id,
    type: 'photo',
    photoPath: row.photo_path ?? '',
    caption: row.caption ?? '',
    timestamp,
    addedLater: row.added_later,
    excluded,
    position: row.position ?? undefined,
  }
}

export async function fetchSessions(userId: string): Promise<Session[]> {
  const [{ data: sessionRows, error: sessionsError }, { data: itemRows, error: itemsError }] = await Promise.all([
    supabase
      .from('cc_sessions')
      .select(SESSION_COLUMNS)
      .eq('owner_id', userId)
      .order('started_at', { ascending: false }),
    supabase
      .from('cc_timeline_items')
      .select(ITEM_COLUMNS)
      .eq('owner_id', userId)
      .order('position', { ascending: true, nullsFirst: false })
      .order('item_timestamp', { ascending: true }),
  ])

  if (sessionsError) throw sessionsError
  if (itemsError) throw itemsError

  const itemsBySession = new Map<string, TimelineItemData[]>()
  for (const row of itemRows ?? []) {
    const item = itemFromRow(row)
    if (!item) continue
    const list = itemsBySession.get(row.session_id) ?? []
    list.push(item)
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
    .select(SESSION_COLUMNS)
    .single()

  if (error) throw error
  return sessionFromRow(data, [])
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
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) row.title = patch.title
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
  const videoPaths = session.items
    .filter((i): i is VideoItem => i.type === 'video')
    .map((i) => i.videoPath)
  if (videoPaths.length > 0) {
    await supabase.storage.from(VIDEOS_BUCKET).remove(videoPaths)
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

export async function setItemExcluded(itemId: string, excluded: boolean): Promise<void> {
  const { error } = await supabase.from('cc_timeline_items').update({ excluded }).eq('id', itemId)
  if (error) throw error
}

/** Persists a full drag-reorder: every item in the session gets stamped with
 * its index in `orderedIds` (not just the dragged ones), so items that were
 * never touched keep their place relative to the ones that moved instead of
 * all falling back to raw timestamp order, which would bunch them together. */
export async function reorderItems(orderedIds: string[]): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from('cc_timeline_items').update({ position: index }).eq('id', id)),
  )
  const firstError = results.find((r) => r.error)?.error
  if (firstError) throw firstError
}

export async function deleteTimelineItem(item: TimelineItemData): Promise<void> {
  if (item.type === 'photo') {
    // Best-effort -- an orphaned storage object is a minor cleanup issue,
    // not something that should block the item disappearing for the user.
    await supabase.storage.from(PHOTOS_BUCKET).remove([item.photoPath])
  } else if (item.type === 'video') {
    await supabase.storage.from(VIDEOS_BUCKET).remove([item.videoPath])
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

export async function addVideo(
  sessionId: string,
  userId: string,
  blob: Blob,
  durationMs: number,
): Promise<VideoItem> {
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
  const { data, error } = await supabase
    .from('cc_timeline_items')
    .insert({
      session_id: sessionId,
      owner_id: userId,
      type: 'transcript',
      text,
      duration_ms: durationMs,
      item_timestamp: new Date(timestamp).toISOString(),
    })
    .select('id')
    .single()

  if (error) throw error
  return { id: data.id, type: 'transcript', text, timestamp, durationMs }
}

export async function generateDeck(sessionId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('generate-deck', { body: { sessionId } })
  if (error) throw error
}

export async function enrichSession(sessionId: string): Promise<number> {
  const { data, error } = await supabase.functions.invoke('enrich-session', { body: { sessionId } })
  if (error) throw error
  return data.count
}

/** Re-fetches a session's items -- used after enrich-session inserts new
 * rows server-side, so the local timeline picks them up without a full reload. */
export async function fetchSessionItems(sessionId: string): Promise<TimelineItemData[]> {
  const { data, error } = await supabase
    .from('cc_timeline_items')
    .select(ITEM_COLUMNS)
    .eq('session_id', sessionId)
    .order('position', { ascending: true, nullsFirst: false })
    .order('item_timestamp', { ascending: true })
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
): Promise<{ deckStatus: DeckStatus; deckPath: string | null; deckError: string | null }> {
  const { data, error } = await supabase
    .from('cc_sessions')
    .select('deck_status, deck_path, deck_error')
    .eq('id', sessionId)
    .single()
  if (error) throw error
  return { deckStatus: data.deck_status, deckPath: data.deck_path, deckError: data.deck_error }
}

// A Blob URL (rather than a signed URL) so the browser treats it as same-origin
// -- the only way an <a download> actually saves the file instead of just
// navigating to it, since the real file lives in a private, cross-origin bucket.
export async function resolveDeckUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(DECKS_BUCKET).download(path)
  if (error) throw error
  return URL.createObjectURL(data)
}
