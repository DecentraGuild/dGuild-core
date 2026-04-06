export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/ops')) return
  if (to.path === '/ops/login') return

  if (import.meta.server) {
    return navigateTo('/ops/login', { replace: true })
  }

  try {
    const { assertPlatformOpsAccess } = await import('~/composables/assertPlatformOpsAccess')
    const allowed = await assertPlatformOpsAccess()
    if (!allowed) return
  } catch {
    return navigateTo('/ops/login', { replace: true })
  }
})
