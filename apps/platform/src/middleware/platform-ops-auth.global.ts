export default defineNuxtRouteMiddleware(async (to) => {
  // Only guard /ops routes; other routes remain public.
  if (!to.path.startsWith('/ops')) return

  // Allow reaching the login page without an existing platform session.
  if (to.path === '/ops/login') return

  const config = useRuntimeConfig()
  const apiBase = config.public.apiUrl as string

  try {
    const res = await $fetch<{ wallet: string }>(`${apiBase.replace(/\/$/, '')}/api/v1/platform/auth/me`, {
      credentials: 'include',
    })
    if (!res?.wallet) {
      return navigateTo('/ops/login')
    }
  } catch {
    return navigateTo('/ops/login')
  }
})

