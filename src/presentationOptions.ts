// Presentation options: the account's defaults for every presentation it
// builds. Saved in cc_user_settings.presentation; the generate-deck function
// keeps its own copy of these defaults (it can't import from the app).
import { supabase } from './supabaseClient'

export type Motion = 'still' | 'scrolly'
export type Charts = 'interactive' | 'photo'
export type Theme = 'auto' | 'light' | 'dark'
export type Length = 'full' | 'short'
export type Photos = 'all' | 'starred' | 'none'
export type Voice = 'neutral' | 'first_person' | 'brief'

export interface PresentationOptions {
  tldr: boolean
  quotes: boolean
  actionItems: boolean
  references: boolean
  chapterBar: boolean
  speakerBio: boolean
  chapterTimes: boolean
  motion: Motion
  charts: Charts
  theme: Theme
  /** A hex color, or 'auto' to let the theme pick. */
  accent: string
  length: Length
  photos: Photos
  voice: Voice
  /** A language name, or 'auto' for the talk's own language. */
  language: string
  // What Sparkle also saves into the session itself, as entries Ask and
  // search can use.
  saveSummary: boolean
  saveActionItems: boolean
  saveSpeakerBio: boolean
  saveAcronyms: boolean
  saveReferences: boolean
}

/** Today's presentation, as it was before these options existed. */
export const DEFAULT_PRESENTATION_OPTIONS: PresentationOptions = {
  tldr: true,
  quotes: true,
  actionItems: true,
  references: true,
  chapterBar: true,
  speakerBio: true,
  chapterTimes: true,
  motion: 'still',
  charts: 'interactive',
  theme: 'auto',
  accent: 'auto',
  length: 'full',
  photos: 'all',
  voice: 'neutral',
  language: 'auto',
  saveSummary: true,
  saveActionItems: true,
  saveSpeakerBio: true,
  saveAcronyms: true,
  saveReferences: true,
}

export const ACCENT_SWATCHES = ['#00f0e0', '#4f7cff', '#a66bff', '#ff5c8a', '#ff8a3d', '#3ccf6e']

export const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch',
  'Japanese', 'Korean', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Hindi', 'Arabic',
]

export async function fetchPresentationOptions(): Promise<PresentationOptions> {
  const { data, error } = await supabase.from('cc_user_settings').select('presentation').maybeSingle()
  if (error) throw error
  return { ...DEFAULT_PRESENTATION_OPTIONS, ...((data?.presentation as Partial<PresentationOptions>) ?? {}) }
}

export async function savePresentationOptions(userId: string, options: PresentationOptions): Promise<void> {
  const { error } = await supabase
    .from('cc_user_settings')
    .upsert({ user_id: userId, presentation: options, updated_at: new Date().toISOString() })
  if (error) throw error
}
