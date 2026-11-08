// Supabase Edge Function: delete-account
//
// Permanently deletes the caller's account and everything in it: their
// photos, videos and presentations in storage, then the auth user, which
// cascades to their sessions, timeline items and settings. The caller is
// identified from their own JWT; only the deletion itself uses the
// service-role key, and only for that user's id.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKETS = ['cc-photos', 'cc-videos', 'cc-decks']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await caller.auth.getUser()
  const userId = userData?.user?.id
  if (userError || !userId) return jsonResponse({ error: 'Not signed in' }, 401)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  try {
    for (const bucket of BUCKETS) {
      const paths = await listAll(admin, bucket, userId)
      for (let i = 0; i < paths.length; i += 500) {
        const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 500))
        if (error) throw new Error(`${bucket}: ${error.message}`)
      }
    }
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) throw error
    console.log(`delete-account: deleted ${userId}`)
    return jsonResponse({ ok: true }, 200)
  } catch (err) {
    console.error('delete-account failed', userId, err)
    return jsonResponse({ error: err instanceof Error ? err.message : 'Delete failed' }, 500)
  }
})

/** Every file under <prefix>/ in a bucket, at any depth. */
async function listAll(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const files: string[] = []
  const folders = [prefix]
  while (folders.length > 0) {
    const folder = folders.pop()!
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000, offset })
      if (error) throw new Error(`${bucket}: ${error.message}`)
      for (const entry of data ?? []) {
        const path = `${folder}/${entry.name}`
        // Folders come back with no id.
        if (entry.id === null) folders.push(path)
        else files.push(path)
      }
      if (!data || data.length < 1000) break
    }
  }
  return files
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
