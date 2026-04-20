import { computed } from 'vue'
import { getTenantSlugFromHost } from '@decentraguild/core'
import { useRequestEvent } from 'nuxt/app'
import { useTenantStore } from '~/stores/tenant'
import {
  normalizedTenantSingleHostFromConfig,
  requestHostMatchesTenantSingleHost,
} from '~/utils/tenantSingleHostMatch'

function currentRequestHost(): string {
  if (import.meta.client && typeof window !== 'undefined') {
    return window.location.host
  }
  const event = useRequestEvent()
  return (event?.node?.req?.headers?.host as string) ?? ''
}

export function useTenantEntryRouting() {
  const tenantStore = useTenantStore()
  const config = useRuntimeConfig()

  const tenantSingleHost = computed(() => normalizedTenantSingleHostFromConfig(config.public.tenantSingleHost))

  const showSubdomainMissing = computed(() => {
    const host = currentRequestHost()
    if (!host) return false
    if (tenantStore.tenant || tenantStore.loading) return false
    if (requestHostMatchesTenantSingleHost(host, config.public.tenantSingleHost)) return false
    const slug = getTenantSlugFromHost(host)
    if (!slug) return false
    return Boolean(tenantStore.error || !tenantStore.tenant)
  })

  const dappEntryOrigin = computed(() => {
    if (
      import.meta.client &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ) {
      return `${window.location.protocol}//${window.location.host}`
    }
    return `https://${tenantSingleHost.value}`
  })

  return {
    tenantSingleHost,
    showSubdomainMissing,
    dappEntryOrigin,
  }
}
