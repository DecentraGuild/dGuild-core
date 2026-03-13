/**
 * Supabase admin client for Edge Functions (service role — bypasses RLS).
 * Use only for write operations that the calling user cannot do directly:
 * billing confirmation, Discord sync, cron jobs, etc.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

export function getAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}

/** User-scoped client from the Authorization header (respects RLS). */
export function getUserClient(authHeader: string | null) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
  })
  return client
}
