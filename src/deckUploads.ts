import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import * as db from './db'
import { readCachedDeck } from './deckCache'

// Once the phone has embedded a presentation's photos, the finished page goes
// back to Supabase too, so the website and other devices get it whole and it
// outlasts the photo links. It can be 10 MB, so on the phone it waits for a
// fast connection rather than compete with conference wifi; the page is
// already saved on the phone (deckCache), so nothing is lost by waiting.

interface PendingUpload {
  sessionId: string
  deckPath: string
  generatedAt: number
}

const FILE = 'deck-uploads.json'
const NATIVE = Capacitor.isNativePlatform()
// A connection this quick to answer is a good one to send a big file over.
const FAST_ENOUGH_MS = 700
const TRY_EVERY_MS = 5 * 60 * 1000

let pending: PendingUpload[] | null = null
let running = false

async function load(): Promise<PendingUpload[]> {
  if (pending) return pending
  try {
    const { data } = await Filesystem.readFile({ path: FILE, directory: Directory.Library, encoding: Encoding.UTF8 })
    pending = JSON.parse(data as string) as PendingUpload[]
  } catch {
    pending = []
  }
  return pending
}

async function save(): Promise<void> {
  await Filesystem.writeFile({ path: FILE, directory: Directory.Library, encoding: Encoding.UTF8, data: JSON.stringify(pending ?? []) })
    .catch(() => {})
}

/** Sends the page back now in a browser; on the phone, when the connection
 * is good. */
export async function uploadDeckLater(session: { id: string; deckGeneratedAt: number | null }, deckPath: string, html: string): Promise<void> {
  if (!NATIVE || session.deckGeneratedAt === null) {
    const { deckStatus } = await db.fetchSessionDeckState(session.id).catch(() => ({ deckStatus: null }))
    // Skipped while a rebuild runs: it would overwrite the new page.
    if (deckStatus === 'ready') await db.replaceDeckHtml(deckPath, html).catch(() => {})
    return
  }
  const list = await load()
  pending = [...list.filter((p) => p.sessionId !== session.id), { sessionId: session.id, deckPath, generatedAt: session.deckGeneratedAt }]
  await save()
  void sendDeckUploads()
}

/** How long Supabase takes to answer a tiny request, or null if it doesn't. */
async function responseTime(): Promise<number | null> {
  const started = performance.now()
  try {
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string },
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    })
    return performance.now() - started
  } catch {
    return null
  }
}

/** Sends what's waiting, one page at a time, while the connection stays fast. */
export async function sendDeckUploads(): Promise<void> {
  if (!NATIVE || running) return
  running = true
  try {
    for (const upload of [...(await load())]) {
      const time = await responseTime()
      if (time === null || time > FAST_ENOUGH_MS) return
      const html = await readCachedDeck(upload.sessionId, upload.generatedAt)
      const state = await db.fetchSessionDeckState(upload.sessionId).catch(() => null)
      if (!state) return
      // Rebuilt or deleted since, or no longer saved on the phone: nothing to send.
      const current = state.deckStatus === 'ready' && state.deckGeneratedAt === upload.generatedAt && !!html
      if (current) await db.replaceDeckHtml(upload.deckPath, html)
      pending = (pending ?? []).filter((p) => p !== upload)
      await save()
    }
  } catch {
    // A slow or dropped connection: try again later.
  } finally {
    running = false
  }
}

/** Tries now, when the app comes back to the front, and every few minutes. */
export function startDeckUploads(): () => void {
  if (!NATIVE) return () => {}
  const onVisible = () => {
    if (document.visibilityState === 'visible') void sendDeckUploads()
  }
  document.addEventListener('visibilitychange', onVisible)
  const timer = window.setInterval(() => void sendDeckUploads(), TRY_EVERY_MS)
  void sendDeckUploads()
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.clearInterval(timer)
  }
}
