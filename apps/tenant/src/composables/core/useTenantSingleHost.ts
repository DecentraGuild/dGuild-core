import { useRequestHeaders } from 'nuxt/app'
import { pickRequestHeader } from '~/utils/pickRequestHeader'
import { requestHostMatchesTenantSingleHost } from '~/utils/tenantSingleHostMatch'

function currentRequestHostForMatch(): string {
  if (import.meta.server) {
    const headers = useRequestHeaders()
    const raw = (
      pickRequestHeader(headers, 'x-forwarded-host') || pickRequestHeader(headers, 'host')
    ).trim()
    return raw ? raw.split(',')[0].trim() : ''
  }
  return window.location.host
}

export function useTenantSingleHost() {
  const config = useRuntimeConfig()
  return computed(() =>
    requestHostMatchesTenantSingleHost(currentRequestHostForMatch(), config.public.tenantSingleHost),
  )
}
