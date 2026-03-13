/**
 * Returns the Supabase browser client for backend calls (PostgREST + Edge Functions).
 * Shared by platform and tenant apps.
 */
import { getBrowserClient } from '@decentraguild/auth'

export function useSupabase() {
  const config = useRuntimeConfig()
  return getBrowserClient(
    config.public.supabaseUrl as string,
    config.public.supabaseAnonKey as string,
  )
}
