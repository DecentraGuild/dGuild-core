import { computed } from 'vue'
import { resolveInternalDevTenantIdsFromEnv } from '@decentraguild/catalog'

export function useInternalDevTenantAllowlist() {
  const config = useRuntimeConfig()
  return computed(() =>
    resolveInternalDevTenantIdsFromEnv(config.public.internalDevTenantIds as string | undefined),
  )
}
