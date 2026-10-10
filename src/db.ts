import { supabase, PHOTOS_BUCKET, VIDEOS_BUCKET, DECKS_BUCKET } from './supabaseClient'
import type { DeckStatus, NoteItem, PhotoItem, Session, SessionEnrichment, SessionStatus, TimelineItemData, TranscriptItem, VideoItem } from './types'

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
  enrichment: SessionEnrichment | null
  enrichment_error: string | null
  updated_at: string
}

interface ItemRow {
  id: string
  session_id: string
  type: 'note' | 'photo' | 'video' | 'transcript'
  text: string | null
  caption: string | null
  photo_path: string | null
  video_path: string | null
  duration_ms: number | null
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
    deckStatus: row.deck_status,
    deckPath: row.deck_path,
    deckError: row.deck_error,
    deckGeneratedAt: row.deck_generated_at ? new Date(row.deck_generated_at).getTime() : null,
    enrichment: row.enrichment,
    enrichmentError: row.enrichment_error,
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

function itemFromRow(row: ItemRow): TimelineItemData {
  const timestamp = new Date(row.item_timestamp).getTime()
  if (row.type === 'note') {
    return { id: row.id, type: 'note', text: row.text ?? '', timestamp, addedLater: row.added_later }
  }
  if (row.type === 'video') {
    return {
      id: row.id,
      type: 'video',
      videoPath: row.video_path ?? '',
      durationMs: row.duration_ms ?? 0,
      timestamp,
      addedLater: row.added_later,
    }
  }
  if (row.type === 'transcript') {
    return { id: row.id, type: 'transcript', text: row.text ?? '', timestamp, durationMs: row.duration_ms ?? 0 }
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
      .select('id, title, status, started_at, accumulated_ms, live_span_started_at, deck_status, deck_path, deck_error, deck_generated_at, enrichment, enrichment_error, updated_at')
      .eq('owner_id', userId)
      .order('started_at', { ascending: false }),
    supabase
      .from('cc_timeline_items')
      .select('id, session_id, type, text, caption, photo_path, video_path, duration_ms, item_timestamp, added_later')
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
    .select('id, title, status, started_at, accumulated_ms, live_span_started_at, deck_status, deck_path, deck_error, deck_generated_at, enrichment, enrichment_error, updated_at')
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

export async function enrichSession(sessionId: string): Promise<SessionEnrichment> {
  const { data, error } = await supabase.functions.invoke('enrich-session', { body: { sessionId } })
  if (error) throw error
  return data.enrichment
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
