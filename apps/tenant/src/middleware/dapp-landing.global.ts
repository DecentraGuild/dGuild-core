import { useRequestHeaders } from 'nuxt/app'
import { pickRequestHeader } from '~/utils/pickRequestHeader'
import { requestHostMatchesTenantSingleHost } from '~/utils/tenantSingleHostMatch'

function requestHostForMatch(): string {
  if (import.meta.server) {
    const headers = useRequestHeaders()
    const raw = (
      pickRequestHeader(headers, 'x-forwarded-host') || pickRequestHeader(headers, 'host')
    ).trim()
    return raw ? raw.split(',')[0].trim() : ''
  }
  return window.location.host
}

function tenantQueryTrimmed(to: { query: Record<string, unknown> }): string | null {
  const raw = to.query.tenant
  const s = Array.isArray(raw) ? raw[0] : raw
  if (typeof s !== 'string') return null
  const t = s.trim()
  return t || null
}

export default defineNuxtRouteMiddleware((to) => {
  const config = useRuntimeConfig()
  const host = requestHostForMatch()
  if (!requestHostMatchesTenantSingleHost(host, config.public.tenantSingleHost)) return
  if (to.path !== '/') return
  if (tenantQueryTrimmed(to)) return
  return navigateTo({ path: '/discover', query: to.query })
})
