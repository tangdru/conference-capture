import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { supabase } from './supabaseClient'

// Transcript lines and "Remember this" taps are saved to the phone first, then
// sent to Supabase, so a dead spot in the conference wifi can't lose them.
// Rows carry their own id: one that's sent twice (the reply was lost, say) is
// the same row, not a duplicate. Photos have their own queue (photoUploads).

export interface QueuedRow {
  id: string
  session_id: string
  owner_id: string
  type: 'transcript' | 'highlight'
  item_timestamp: string
  text?: string
  duration_ms?: number
  excluded?: boolean
  starred?: boolean
  position?: number
}

const FILE = 'item-outbox.json'
const RETRY_MS = 20_000
const REQUEST_TIMEOUT_MS = 20_000

let queue: QueuedRow[] = []
let saving: Promise<unknown> = Promise.resolve()
let sending: Promise<void> | null = null

const loaded = readQueue().then((stored) => {
  queue = [...stored, ...queue]
})

async function readQueue(): Promise<QueuedRow[]> {
  try {
    if (!Capacitor.isNativePlatform()) return JSON.parse(localStorage.getItem(FILE) ?? '[]')
    const { data } = await Filesystem.readFile({ path: FILE, directory: Directory.Library, encoding: Encoding.UTF8 })
    return JSON.parse(data as string)
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
  }).catch((err) => console.warn('Could not save the outbox', err))
  return saving as Promise<void>
}

/** Bad data or a session deleted on another device: sending again can't work.
 * Anything else (no connection, an expired token) is worth another try. */
function canNeverSucceed(error: { code?: string }): boolean {
  return /^2[23]/.test(error.code ?? '')
}

async function sendQueue(): Promise<void> {
  await loaded
  while (queue.length > 0) {
    const row = queue[0]
    const { error } = await supabase
      .from('cc_timeline_items')
      .upsert(row, { onConflict: 'id' })
      .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
    if (error && !canNeverSucceed(error)) return
    if (error) console.warn('Dropped an item Supabase refused', error)

    const index = queue.findIndex((r) => r.id === row.id)
    if (index === -1) {
      // Deleted while it was on its way.
      if (!error) await supabase.from('cc_timeline_items').delete().eq('id', row.id)
    } else if (queue[index] === row) {
      queue.splice(index, 1)
      await persist()
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

/** Saves a row on the phone and starts sending it. Settles once it's stored. */
export async function queueRow(row: QueuedRow): Promise<void> {
  await loaded
  queue.push(row)
  await persist()
  void flushOutbox()
}

/** Rows still on the phone, for showing in their timelines. */
export async function queuedRows(): Promise<QueuedRow[]> {
  await loaded
  return [...queue]
}

/** Changes a row that hasn't been sent. False if it isn't waiting here. */
export function patchQueuedRow(id: string, patch: Pick<QueuedRow, 'excluded' | 'starred' | 'position'>): boolean {
  const index = queue.findIndex((r) => r.id === id)
  if (index === -1) return false
  queue[index] = { ...queue[index], ...patch }
  void persist()
  return true
}

/** Forgets a row that hasn't been sent. False if it isn't waiting here. */
export function dropQueuedRow(id: string): boolean {
  const before = queue.length
  queue = queue.filter((r) => r.id !== id)
  if (queue.length === before) return false
  void persist()
  return true
}

export function dropQueuedSession(sessionId: string): void {
  queue = queue.filter((r) => r.session_id !== sessionId)
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
