// Supabase Edge Function: claude-key
//
// Saves the caller's own Claude API key (menu > Claude API key). The key is
// checked with Claude first, so a typo is caught here rather than at the
// next Sparkle, then kept encrypted in Supabase Vault (cc_save_claude_key).
// The app never gets the key back: it sees only the last 4 characters.
// Removing a key is a plain RPC from the app (cc_remove_claude_key).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Short and fixed, like every other message the app shows.
const MESSAGES = {
  format: 'That doesn’t look like a Claude API key',
  rejected: 'Claude rejected that key',
  check: 'Couldn’t check the key with Claude, try again',
  unknown: 'Something went wrong, try again',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: userData, error: userError } = await caller.auth.getUser()
  if (userError || !userData.user) return jsonResponse({ error: 'Signed out or sign-in expired' }, 401)

  let key: string
  try {
    const body = await req.json()
    key = typeof body.key === 'string' ? body.key.trim() : ''
  } catch {
    return jsonResponse({ error: MESSAGES.unknown }, 400)
  }
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) return jsonResponse({ error: MESSAGES.format }, 422)

  // Listing models costs nothing and needs a valid key.
  let check: Response
  try {
    check = await fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    })
    await check.body?.cancel().catch(() => {})
  } catch (err) {
    console.error('claude-key: check failed', err)
    return jsonResponse({ error: MESSAGES.check }, 502)
  }
  if (check.status === 401 || check.status === 403) return jsonResponse({ error: MESSAGES.rejected }, 422)
  if (!check.ok) {
    console.error('claude-key: check returned', check.status)
    return jsonResponse({ error: MESSAGES.check }, 502)
  }

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const { error } = await admin.rpc('cc_save_claude_key', { p_user: userData.user.id, p_key: key })
  if (error) {
    console.error('claude-key: save failed', error)
    return jsonResponse({ error: MESSAGES.unknown }, 500)
  }
  return jsonResponse({ last4: key.slice(-4) }, 200)
})

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
