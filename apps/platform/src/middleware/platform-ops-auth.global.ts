/**
 * Guards /ops routes. Same pattern as tenant admin-auth:
 * - Server: never render protected ops pages; redirect to login so auth is only evaluated on client.
 * - Client: require session + check_platform_admin(); only then allow access.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/ops')) return
  if (to.path === '/ops/login') return

  if (import.meta.server) {
    return navigateTo('/ops/login', { replace: true })
  }

  const { useSupabase } = await import('~/composables/useSupabase')
  const supabase = useSupabase()

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return navigateTo('/ops/login', { replace: true })

    const { data: wallet, error } = await supabase.rpc('check_platform_admin')
    if (error || !wallet) return navigateTo('/ops/login', { replace: true })
  } catch {
    return navigateTo('/ops/login', { replace: true })
  }
})
