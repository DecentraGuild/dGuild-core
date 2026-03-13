/**
 * Server-side auth plugin: creates a per-request Supabase client using
 * @supabase/ssr cookie helpers so the session established by sign-in is
 * available during SSR and cookies are forwarded to the browser correctly.
 *
 * Provides useSupabaseClient() via Nuxt composable for server-side use.
 */
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'

export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.client) return

  const config = useRuntimeConfig()
  const supabaseUrl = config.public.supabaseUrl as string
  const supabaseAnonKey = config.public.supabaseAnonKey as string

  const event = useRequestEvent()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(event?.node?.req?.headers?.cookie ?? '')
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          event?.node?.res?.appendHeader(
            'Set-Cookie',
            serializeCookieHeader(name, value, options),
          )
        }
      },
    },
  })

  // Make the server client available in Nuxt context.
  nuxtApp.provide('supabase', supabase)
})
