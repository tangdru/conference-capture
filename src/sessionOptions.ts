// Session options: the account's settings for the capture screen during a
// talk -- which buttons the session bar (and the camera) show. Saved in
// cc_user_settings.session_options, and kept on the phone too so a session
// opens with the right buttons straight away, even offline.
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export interface SessionOptions {
  /** The star: marks a key moment while recording. */
  rememberThis: boolean
  /** The clip button ("Chui's audio"): keeps a minute of the speaker's voice. */
  chuisAudio: boolean
  // Chui's audio settings (shown under it when it's on).
  /** Seconds already heard that a clip keeps (0-60). */
  clipBeforeS: number
  /** Seconds a clip records on after the tap (0-120). */
  clipAfterS: number
  /** Start and end each clip at a pause in speech. */
  snapToSentences: boolean
  /** Clean up room noise in the saved clip. */
  voiceBoost: boolean
  /** Hold clip uploads until the phone is on Wi-Fi. */
  wifiOnlyUploads: boolean
  /** After trimming, delete the audio outside the trim (on leaving the session). */
  keepTrimmedOnly: boolean
  /** Whether shared presentations (link or download) play the clips. */
  clipsInShared: boolean
}

export const CLIP_BEFORE_MAX_S = 60
export const CLIP_AFTER_MAX_S = 120

export const DEFAULT_SESSION_OPTIONS: SessionOptions = {
  rememberThis: true,
  chuisAudio: false,
  clipBeforeS: 5,
  clipAfterS: 44,
  snapToSentences: false,
  voiceBoost: false,
  wifiOnlyUploads: false,
  keepTrimmedOnly: true,
  clipsInShared: false,
}

const STORAGE_KEY = 'cc-session-options'

function readStored(): SessionOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_SESSION_OPTIONS, ...(JSON.parse(raw) as Partial<SessionOptions>) }
  } catch {
    // Nothing stored, or storage blocked: the defaults.
  }
  return DEFAULT_SESSION_OPTIONS
}

let current = readStored()
const listeners = new Set<(options: SessionOptions) => void>()

function publish(next: SessionOptions) {
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // The account copy still has them.
  }
  for (const listener of listeners) listener(next)
}

/** The options as last known on this phone. */
export function getSessionOptions(): SessionOptions {
  return current
}

/** The account's options, fetched fresh (and remembered on the phone). */
export async function fetchSessionOptions(): Promise<SessionOptions> {
  const { data, error } = await supabase.from('cc_user_settings').select('session_options').maybeSingle()
  if (error) throw error
  const next = { ...DEFAULT_SESSION_OPTIONS, ...((data?.session_options as Partial<SessionOptions>) ?? {}) }
  publish(next)
  return next
}

/** Applies the options on this phone at once, then saves them to the account. */
export async function saveSessionOptions(userId: string, options: SessionOptions): Promise<void> {
  publish(options)
  const { error } = await supabase
    .from('cc_user_settings')
    .upsert({ user_id: userId, session_options: options, updated_at: new Date().toISOString() })
  if (error) throw error
}

/** The current options, updating when they change. Refreshes from the
 * account once when first used, so a change made on another phone arrives. */
let refreshed = false
export function useSessionOptions(): SessionOptions {
  const [options, setOptions] = useState(current)
  useEffect(() => {
    listeners.add(setOptions)
    if (!refreshed) {
      refreshed = true
      fetchSessionOptions().catch(() => {
        refreshed = false
      })
    }
    return () => {
      listeners.delete(setOptions)
    }
  }, [])
  return options
}
