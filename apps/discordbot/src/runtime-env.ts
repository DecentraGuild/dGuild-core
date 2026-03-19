/**
 * Supabase URL and service role key come from the host environment (Railway Variables, `.env` locally).
 */

export function getSupabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL?.trim()
}

export function getSupabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
}
