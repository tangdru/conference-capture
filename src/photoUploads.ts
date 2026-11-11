import { Capacitor } from '@capacitor/core'
import { supabase } from './supabaseClient'
import { PhotoUploads } from './native/photoUploads'
import { blobToBase64 } from './native/slideScanner'
import { onSessionSent } from './itemOutbox'
import type { PhotoItem } from './types'

// Photos in the native app upload through iOS's background transfer service
// (PhotoUploadsPlugin), not from the page: they're saved to the phone first
// and keep uploading after the app is left, locked or closed, waiting out
// bad conference wifi. The web build uploads directly (db.addPhoto).

export const backgroundUploads = Capacitor.isNativePlatform()

const url = import.meta.env.VITE_SUPABASE_URL as string
const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** Keeps the upload queue holding the current sign-in token -- uploads run
 * outside the page, so they need it handed over, and again as it refreshes. */
export function syncPhotoUploadAuth(): () => void {
  if (!backgroundUploads) return () => {}
  const send = (token: string | undefined) => {
    if (token) void PhotoUploads.setAuth({ token, apikey, storageUrl: `${url}/storage/v1`, restUrl: `${url}/rest/v1` })
  }
  const resend = () => void supabase.auth.getSession().then(({ data }) => send(data.session?.access_token))
  resend()
  const { data } = supabase.auth.onAuthStateChange((_event, session) => send(session?.access_token))
  // A photo taken in a session started with no signal can't be saved until
  // the session reaches Supabase; handing the token over again restarts it.
  const off = onSessionSent(resend)
  return () => {
    data.subscription.unsubscribe()
    off()
  }
}

function base64ToObjectUrl(data: string): Promise<string> {
  return fetch(`data:image/jpeg;base64,${data}`).then((r) => r.blob()).then((b) => URL.createObjectURL(b))
}

/** Hands a photo to the queue. `item` is there to show at once; `processed`
 * settles once it's been straightened, read and safely queued. */
export function queuePhoto(
  sessionId: string,
  userId: string,
  blob: Blob,
): { item: PhotoItem; processed: Promise<Pick<PhotoItem, 'photoPath' | 'slideText' | 'dataUrl'>> } {
  const id = crypto.randomUUID()
  const originalPath = `${userId}/${sessionId}/${crypto.randomUUID()}.jpg`
  const flattenedPath = `${userId}/${sessionId}/${crypto.randomUUID()}.jpg`
  const timestamp = Date.now()
  const caption = 'Untitled photo'
  const item: PhotoItem = {
    id,
    type: 'photo',
    photoPath: originalPath,
    caption,
    timestamp,
    dataUrl: URL.createObjectURL(blob),
    uploading: true,
  }
  const processed = blobToBase64(blob).then(async (data) => {
    const result = await PhotoUploads.enqueue({
      id,
      sessionId,
      data,
      originalPath,
      flattenedPath,
      row: {
        id,
        session_id: sessionId,
        owner_id: userId,
        type: 'photo',
        caption,
        item_timestamp: new Date(timestamp).toISOString(),
      },
    })
    return {
      photoPath: result.data ? flattenedPath : originalPath,
      slideText: result.text,
      dataUrl: result.data ? await base64ToObjectUrl(result.data) : item.dataUrl,
    }
  })
  return { item, processed }
}

/** Photos still on the phone waiting to upload, by session -- shown in their
 * timelines until they arrive, including after the app was closed. */
export async function pendingPhotos(): Promise<Map<string, PhotoItem[]>> {
  const bySession = new Map<string, PhotoItem[]>()
  if (!backgroundUploads) return bySession
  const { items } = await PhotoUploads.pending()
  for (const pending of items) {
    const row = pending.row
    const item: PhotoItem = {
      id: pending.id,
      type: 'photo',
      photoPath: String(row.photo_path ?? ''),
      caption: String(row.caption ?? ''),
      slideText: typeof row.text === 'string' ? row.text : undefined,
      timestamp: new Date(String(row.item_timestamp)).getTime(),
      dataUrl: await base64ToObjectUrl(pending.data),
      uploading: true,
    }
    bySession.set(pending.sessionId, [...(bySession.get(pending.sessionId) ?? []), item])
  }
  return bySession
}

export function onPhotoUploaded(listener: (id: string) => void): () => void {
  if (!backgroundUploads) return () => {}
  const handle = PhotoUploads.addListener('uploaded', ({ id }) => listener(id))
  return () => void handle.then((h) => h.remove())
}

/** Stops a deleted photo (or a deleted session's photos) from uploading. */
export async function cancelPhotoUploads(target: { id?: string; sessionId?: string }): Promise<void> {
  if (backgroundUploads) await PhotoUploads.cancel(target)
}
