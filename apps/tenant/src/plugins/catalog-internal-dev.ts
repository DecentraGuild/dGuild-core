import { setInternalDevTenantIds, resolveInternalDevTenantIdsFromEnv } from '@decentraguild/catalog'

export default defineNuxtPlugin(() => {
  const raw = useRuntimeConfig().public.internalDevTenantIds as string | undefined
  setInternalDevTenantIds(resolveInternalDevTenantIdsFromEnv(raw))
})
