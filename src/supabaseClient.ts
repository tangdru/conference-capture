import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — check .env')
}

export const supabase = createClient(url, anonKey)

export const PHOTOS_BUCKET = 'cc-photos'
export const VIDEOS_BUCKET = 'cc-videos'
export const DECKS_BUCKET = 'cc-decks'
