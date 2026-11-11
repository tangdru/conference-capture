import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { MESSAGES } from './networkError'
import { supabase } from './supabaseClient'

// Everything the user does in a session -- starting it, notes, transcript
// lines, "Remember this", stars, hiding, moving, renaming, pausing, deleting
// -- is saved to the phone first and sent to Supabase in order, when the
// connection allows. A dead spot in the conference wifi can't lose it or hold
// the user up. Rows carry their own ids (made here, not by the server), so
// one sent twice -- the reply was lost, say -- is the same row, not a
// duplicate, and a session can be started with no signal at all. Photos have
// their own queue (photoUploads), which waits for the session to arrive.

export interface QueuedRow {
  id: string
  session_id: string
  owner_id: string
  type: 'transcript' | 'highlight' | 'note'
  item_timestamp: string
  text?: string
  duration_ms?: number
  excluded?: boolean
  starred?: boolean
  position?: number | null
  placement_locked?: boolean
}

export interface QueuedSession {
  id: string
  owner_id: string
  title: string
  status: string
  started_at: string
  accumulated_ms: number
  live_span_started_at: string | null
  updated_at: string
  pinned_at?: string | null
}

export type ItemPatch = Partial<Pick<QueuedRow, 'text' | 'excluded' | 'starred' | 'position' | 'item_timestamp' | 'placement_locked'>>
export type SessionPatch = Partial<Pick<QueuedSession, 'title' | 'status' | 'accumulated_ms' | 'live_span_started_at' | 'updated_at' | 'pinned_at'>>

/** Files to remove from storage along with a deletion. */
export interface StoredFile {
  bucket: string
  path: string
}

export type Entry =
  | { op: 'item'; row: QueuedRow }
  | { op: 'session'; row: QueuedSession }
  | { op: 'patchItem'; id: string; sessionId: string; patch: ItemPatch }
  | { op: 'patchSession'; id: string; patch: SessionPatch }
  | { op: 'deleteItem'; id: string; sessionId: string; files: StoredFile[] }
  | { op: 'deleteSession'; id: string; files: StoredFile[] }

const FILE = 'item-outbox.json'
const RETRY_MS = 20_000
const REQUEST_TIMEOUT_MS = 20_000

let queue: Entry[] = []
let saving: Promise<unknown> = Promise.resolve()
let sending: Promise<void> | null = null
const sessionSentListeners = new Set<() => void>()
const problemListeners = new Set<(message: string) => void>()

function report(message: string) {
  problemListeners.forEach((fn) => fn(message))
}

/** Called with a message to show when a change can't be kept: the phone is
 * out of space, or the server refused it. */
export function onOutboxProblem(fn: (message: string) => void): () => void {
  problemListeners.add(fn)
  return () => problemListeners.delete(fn)
}

const loaded = readQueue().then((stored) => {
  queue = [...stored, ...queue]
})

async function readQueue(): Promise<Entry[]> {
  try {
    const text = Capacitor.isNativePlatform()
      ? (await Filesystem.readFile({ path: FILE, directory: Directory.Library, encoding: Encoding.UTF8 })).data as string
      : localStorage.getItem(FILE) ?? '[]'
    const stored = JSON.parse(text) as (Entry | QueuedRow)[]
    // Builds before 57 kept only rows, without an "op".
    return stored.map((e) => ('op' in e ? e : { op: 'item', row: e }))
  } catch {
    return [] // Nothing saved yet.
  }
}

/** Writes run one at a time, each saving the queue as it stands by then. */
function persist(): Promise<void> {
  saving = saving.then(async () => {
    const data = JSON.stringify(queue)
    if (Capacitor.isNativePlatform()) {
      await Filesystem.writeFile({ path: FILE, directory: Directory.Library, encoding: Encoding.UTF8, data })
    } else {
      localStorage.setItem(FILE, data)
    }
  }).catch((err) => {
    console.warn('Could not save the outbox', err)
    report(MESSAGES.phoneFull)
  })
  return saving as Promise<void>
}

/** Which thing an entry is about: entries about the same thing merge, and a
 * merged entry is sent again rather than dropped. */
function keyOf(e: Entry): string {
  switch (e.op) {
    case 'item':
    case 'patchItem':
    case 'deleteItem':
      return `${e.op}:${e.op === 'item' ? e.row.id : e.id}`
    case 'session':
      return `session:${e.row.id}`
    case 'patchSession':
    case 'deleteSession':
      return `${e.op}:${e.id}`
  }
}

function sessionOf(e: Entry): string {
  switch (e.op) {
    case 'item':
      return e.row.session_id
    case 'session':
      return e.row.id
    case 'patchItem':
    case 'deleteItem':
      return e.sessionId
    case 'patchSession':
    case 'deleteSession':
      return e.id
  }
}

/** Bad data or a session deleted on another device: sending again can't work.
 * Anything else (no connection, an expired token) is worth another try. */
function canNeverSucceed(error: { code?: string }): boolean {
  return /^2[23]/.test(error.code ?? '')
}

function timeout() {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS)
}

async function removeFiles(files: StoredFile[]): Promise<void> {
  const byBucket = new Map<string, string[]>()
  for (const f of files) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.path])
  // Best effort: a file left behind is a minor cleanup issue.
  await Promise.all([...byBucket].map(([bucket, paths]) => supabase.storage.from(bucket).remove(paths).catch(() => null)))
}

async function send(e: Entry): Promise<{ code?: string } | null> {
  switch (e.op) {
    case 'item':
      return (await supabase.from('cc_timeline_items').upsert(e.row, { onConflict: 'id' }).abortSignal(timeout())).error
    case 'session':
      return (await supabase.from('cc_sessions').upsert(e.row, { onConflict: 'id' }).abortSignal(timeout())).error
    case 'patchItem':
      return (await supabase.from('cc_timeline_items').update(e.patch).eq('id', e.id).abortSignal(timeout())).error
    case 'patchSession':
      return (await supabase.from('cc_sessions').update(e.patch).eq('id', e.id).abortSignal(timeout())).error
    case 'deleteItem': {
      const { error } = await supabase.from('cc_timeline_items').delete().eq('id', e.id).abortSignal(timeout())
      if (!error) await removeFiles(e.files)
      return error
    }
    case 'deleteSession': {
      const { error } = await supabase.from('cc_sessions').delete().eq('id', e.id).abortSignal(timeout())
      if (!error) await removeFiles(e.files)
      return error
    }
  }
}

async function sendQueue(): Promise<void> {
  await loaded
  while (queue.length > 0) {
    const entry = queue[0]
    const error = await send(entry)
    if (error && !canNeverSucceed(error)) return
    if (error) {
      console.warn('Dropped a change Supabase refused', entry.op, error)
      report(MESSAGES.refusedChange)
    }

    const index = queue.indexOf(entry)
    if (index !== -1) {
      queue.splice(index, 1)
      await persist()
      if (entry.op === 'session' && !error) sessionSentListeners.forEach((fn) => fn())
    } else if (!queue.some((e) => keyOf(e) === keyOf(entry)) && !error) {
      // Deleted while it was on its way: take it back off the server.
      if (entry.op === 'item') await supabase.from('cc_timeline_items').delete().eq('id', entry.row.id)
      if (entry.op === 'session') await supabase.from('cc_sessions').delete().eq('id', entry.row.id)
    }
    // Otherwise it was changed on the way: the loop sends the new version.
  }
}

/** Sends everything waiting. Settles when the queue is empty or the connection
 * gave out -- it never rejects. */
export function flushOutbox(): Promise<void> {
  sending ??= sendQueue()
    .catch((err) => console.warn('Could not send the outbox', err))
    .finally(() => {
      sending = null
    })
  return sending
}

async function add(entry: Entry): Promise<void> {
  await loaded
  queue.push(entry)
  await persist()
  void flushOutbox()
}

/** Saves a new entry on the phone and starts sending it. Settles once it's stored. */
export function queueRow(row: QueuedRow): Promise<void> {
  return add({ op: 'item', row })
}

/** Saves a new session on the phone and starts sending it. */
export function queueSession(row: QueuedSession): Promise<void> {
  return add({ op: 'session', row })
}

/** Called each time a new session reaches Supabase. */
export function onSessionSent(fn: () => void): () => void {
  sessionSentListeners.add(fn)
  return () => sessionSentListeners.delete(fn)
}

/** Changes an entry: folded into the entry itself while it's still waiting
 * here, or into a change already waiting, else queued. */
export async function queueItemPatch(id: string, sessionId: string, patch: ItemPatch): Promise<void> {
  await loaded
  const index = queue.findIndex((e) => (e.op === 'item' && e.row.id === id) || (e.op === 'patchItem' && e.id === id))
  if (index === -1) return add({ op: 'patchItem', id, sessionId, patch })
  const e = queue[index]
  queue[index] = e.op === 'item' ? { ...e, row: { ...e.row, ...patch } } : { ...(e as Extract<Entry, { op: 'patchItem' }>), patch: { ...(e as Extract<Entry, { op: 'patchItem' }>).patch, ...patch } }
  await persist()
  void flushOutbox()
}

/** Changes a session, the same way. */
export async function queueSessionPatch(id: string, patch: SessionPatch): Promise<void> {
  await loaded
  const index = queue.findIndex((e) => (e.op === 'session' && e.row.id === id) || (e.op === 'patchSession' && e.id === id))
  if (index === -1) return add({ op: 'patchSession', id, patch })
  const e = queue[index]
  queue[index] = e.op === 'session' ? { ...e, row: { ...e.row, ...patch } } : { ...(e as Extract<Entry, { op: 'patchSession' }>), patch: { ...(e as Extract<Entry, { op: 'patchSession' }>).patch, ...patch } }
  await persist()
  void flushOutbox()
}

/** Deletes an entry: if it never left the phone, it's simply forgotten. */
export async function queueItemDelete(id: string, sessionId: string, files: StoredFile[]): Promise<void> {
  await loaded
  const wasNew = queue.some((e) => e.op === 'item' && e.row.id === id)
  queue = queue.filter((e) => !((e.op === 'item' && e.row.id === id) || (e.op === 'patchItem' && e.id === id)))
  if (wasNew) {
    await persist()
    // A photo that never left the phone has no file on the server either.
    if (files.length) await add({ op: 'deleteItem', id, sessionId, files })
    return
  }
  await add({ op: 'deleteItem', id, sessionId, files })
}

/** Deletes a session and everything waiting for it. */
export async function queueSessionDelete(id: string, files: StoredFile[]): Promise<void> {
  await loaded
  const wasNew = queue.some((e) => e.op === 'session' && e.row.id === id)
  queue = queue.filter((e) => sessionOf(e) !== id)
  if (wasNew && files.length === 0) {
    await persist()
    return
  }
  await add({ op: 'deleteSession', id, files })
}

/** Everything still on the phone, oldest first, for showing it in place. */
export async function queuedEntries(): Promise<Entry[]> {
  await loaded
  return [...queue]
}

/** Forgets everything waiting for a session (the account is being deleted). */
export function dropQueuedSession(sessionId: string): void {
  queue = queue.filter((e) => sessionOf(e) !== sessionId)
  void persist()
}

/** Keeps trying while the app is open: on reconnecting, on coming back to the
 * app, and on a timer, because "online" doesn't fire for every wifi recovery. */
export function startOutbox(): () => void {
  const onVisible = () => {
    if (document.visibilityState === 'visible') void flushOutbox()
  }
  const flush = () => void flushOutbox()
  window.addEventListener('online', flush)
  document.addEventListener('visibilitychange', onVisible)
  const timer = window.setInterval(flush, RETRY_MS)
  flush()
  return () => {
    window.removeEventListener('online', flush)
    document.removeEventListener('visibilitychange', onVisible)
    window.clearInterval(timer)
  }
}
