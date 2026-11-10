import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'

// Ready presentations kept on the phone, photos already embedded, so tapping a
// card opens one at once -- with no signal too -- instead of downloading the
// page and every photo first. One file per session, named for when its
// presentation was built: a rebuild has a new name, so the old copy is never
// shown. Phone only; a browser opens the presentation in a new tab instead.
const FOLDER = 'decks'
const enabled = Capacitor.isNativePlatform()

function fileFor(sessionId: string, generatedAt: number): string {
  return `${FOLDER}/${sessionId}-${generatedAt}.html`
}

export async function readCachedDeck(sessionId: string, generatedAt: number | null): Promise<string | null> {
  if (!enabled || generatedAt === null) return null
  try {
    const { data } = await Filesystem.readFile({
      path: fileFor(sessionId, generatedAt),
      directory: Directory.Library,
      encoding: Encoding.UTF8,
    })
    return typeof data === 'string' && data ? data : null
  } catch {
    return null
  }
}

/** Saves this build of the session's presentation, replacing any older one. */
export async function saveCachedDeck(sessionId: string, generatedAt: number | null, html: string): Promise<void> {
  if (!enabled || generatedAt === null) return
  try {
    await forgetCachedDeck(sessionId)
    await Filesystem.writeFile({
      path: fileFor(sessionId, generatedAt),
      directory: Directory.Library,
      encoding: Encoding.UTF8,
      data: html,
      recursive: true,
    })
  } catch {
    // Out of space: it's downloaded again next time, as before.
  }
}

/** Drops the session's saved copy -- e.g. a photo in it was deleted. */
export async function forgetCachedDeck(sessionId: string): Promise<void> {
  if (!enabled) return
  for (const name of await savedNames()) {
    if (name.startsWith(`${sessionId}-`)) {
      await Filesystem.deleteFile({ path: `${FOLDER}/${name}`, directory: Directory.Library }).catch(() => {})
    }
  }
}

/** Which sessions have a copy saved for this build. */
export async function cachedDeckKeys(): Promise<Set<string>> {
  return new Set((await savedNames()).map((name) => name.replace(/\.html$/, '')))
}

export function deckKey(sessionId: string, generatedAt: number): string {
  return `${sessionId}-${generatedAt}`
}

export async function clearCachedDecks(): Promise<void> {
  if (!enabled) return
  await Filesystem.rmdir({ path: FOLDER, directory: Directory.Library, recursive: true }).catch(() => {})
}

async function savedNames(): Promise<string[]> {
  if (!enabled) return []
  try {
    const { files } = await Filesystem.readdir({ path: FOLDER, directory: Directory.Library })
    return files.map((f) => f.name)
  } catch {
    return []
  }
}
