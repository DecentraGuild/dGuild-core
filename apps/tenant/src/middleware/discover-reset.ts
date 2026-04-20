import { useRequestHeaders } from 'nuxt/app'
import { useTenantStore } from '~/stores/tenant'
import { pickRequestHeader } from '~/utils/pickRequestHeader'
import { requestHostMatchesTenantSingleHost } from '~/utils/tenantSingleHostMatch'

const LAST_TENANT_STORAGE_KEY = 'dg_last_tenant'

function requestHostLower(): string {
  if (import.meta.server) {
    const headers = useRequestHeaders()
    const raw = (
      pickRequestHeader(headers, 'x-forwarded-host') || pickRequestHeader(headers, 'host')
    ).trim()
    return raw ? raw.split(',')[0].trim().split(':')[0].toLowerCase() : ''
  }
  return window.location.hostname.toLowerCase()
}

export default defineNuxtRouteMiddleware((to) => {
  if (to.path !== '/discover') return

  const config = useRuntimeConfig()
  if (!requestHostMatchesTenantSingleHost(requestHostLower(), config.public.tenantSingleHost)) return

  const tenantStore = useTenantStore()
  tenantStore.clearTenant()

  if (import.meta.client) {
    try {
      localStorage.removeItem(LAST_TENANT_STORAGE_KEY)
    } catch {
      /* ignore */
    }
    if (to.query.tenant) {
      return navigateTo({ path: '/discover', query: {} }, { replace: true })
    }
  }
})
