import { setInternalDevTenantIds } from '@decentraguild/catalog'

export default defineNuxtPlugin(() => {
  const ids = useRuntimeConfig().public.internalDevTenantIds as string[] | undefined
  if (Array.isArray(ids) && ids.length > 0) setInternalDevTenantIds(ids)
})
