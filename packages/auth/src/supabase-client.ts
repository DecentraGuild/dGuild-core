/**
 * Supabase client factory for the DecentraGuild tenant app.
 * Uses @supabase/ssr for SSR-safe cookie-based session management.
 * Call createBrowserClient() in client-side code,
 * createServerClient() in Nuxt server plugins.
 */

import { createBrowserClient as _createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

export type { SupabaseClient }

let _browserClient: SupabaseClient | null = null

/**
 * Returns a singleton Supabase browser client.
 * Must be called with NUXT_PUBLIC_SUPABASE_URL and NUXT_PUBLIC_SUPABASE_ANON_KEY.
 */
export function getBrowserClient(supabaseUrl: string, supabaseKey: string): SupabaseClient {
  if (!_browserClient) {
    _browserClient = _createBrowserClient(supabaseUrl, supabaseKey)
  }
  return _browserClient
}

/** Reset the singleton (for testing / hot-reload). */
export function resetBrowserClient(): void {
  _browserClient = null
}
