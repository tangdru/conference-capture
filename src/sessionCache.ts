import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import type { LoadedSessions, SyncCursor } from './db'
import type { Session, TimelineItemData } from './types'

// The sessions last loaded, kept on the phone so they show the moment the app
// opens (and with no signal); a fresh load replaces them a moment later. One
// copy per account: in a file on the phone, in localStorage in a browser
// (where "cc-" keys are cleared on delete account).
const VERSION = 1
const NATIVE = Capacitor.isNativePlatform()

function fileFor(userId: string): string {
  return `sessions-${userId}.json`
}

function keyFor(userId: string): string {
  return `cc-sessions-${userId}`
}

/** The sessions saved on the phone, and where loading left off (null: load
 * everything next time). */
export async function readCachedSessions(userId: string): Promise<LoadedSessions | null> {
  try {
    const text = NATIVE
      ? (await Filesystem.readFile({ path: fileFor(userId), directory: Directory.Library, encoding: Encoding.UTF8 })).data
      : localStorage.getItem(keyFor(userId))
    if (typeof text !== 'string' || !text) return null
    const saved = JSON.parse(text) as { version?: number; sessions?: Session[]; cursor?: SyncCursor }
    return saved.version === VERSION && Array.isArray(saved.sessions) ? { sessions: saved.sessions, cursor: saved.cursor ?? null } : null
  } catch {
    // Nothing saved yet, or unreadable: load as usual.
    return null
  }
}

let writing: Promise<void> = Promise.resolve()

/** Saves in the background, one write at a time; a failed save only means
 * the next open waits for the load, as it always used to. */
export function saveCachedSessions(userId: string, { sessions, cursor }: LoadedSessions): Promise<void> {
  const data = JSON.stringify({ version: VERSION, savedAt: Date.now(), cursor, sessions: sessions.map(forStorage) })
  writing = writing.then(async () => {
    try {
      if (NATIVE) {
        await Filesystem.writeFile({ path: fileFor(userId), directory: Directory.Library, encoding: Encoding.UTF8, data })
      } else {
        localStorage.setItem(keyFor(userId), data)
      }
    } catch {
      // Out of space, or storage off.
    }
  })
  return writing
}

export async function clearCachedSessions(userId: string): Promise<void> {
  await writing
  try {
    if (NATIVE) await Filesystem.deleteFile({ path: fileFor(userId), directory: Directory.Library })
    else localStorage.removeItem(keyFor(userId))
  } catch {
    // Nothing saved.
  }
}

/** What's worth keeping: photos still waiting to upload come back from their
 * own queue on the next open, and a photo's preview link only lasts while
 * the app is running. */
function forStorage(session: Session): Session {
  return {
    ...session,
    items: session.items
      .filter((item) => !(item.type === 'photo' && item.uploading))
      .map((item): TimelineItemData => (item.type === 'photo' && item.dataUrl ? { ...item, dataUrl: undefined } : item)),
  }
}
