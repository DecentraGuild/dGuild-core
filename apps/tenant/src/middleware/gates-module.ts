import { getModuleState, isModuleVisibleToMembers } from '@decentraguild/core'
import { getTenantSlugFromHost } from '@decentraguild/core'

function homeWithTenantQuery(tenantQuery: string | null, appendTenant: boolean) {
  return tenantQuery && appendTenant
    ? { path: '/', query: { tenant: tenantQuery } }
    : tenantQuery
      ? '/'
      : '/'
}

function shouldAppendTenantToRedirect(slug: string | null): boolean {
  if (!slug) return false
  let host = ''
  if (import.meta.client && typeof window !== 'undefined') host = window.location.host
  else host = (useRequestEvent()?.node?.req?.headers?.host as string) ?? ''
  if (!host) return true
  return getTenantSlugFromHost(host, undefined) !== slug
}

export default defineNuxtRouteMiddleware(() => {
  const tenantStore = useTenantStore()
  const slug = tenantStore.slug
  const tenantQuery = tenantStore.tenant?.id ?? slug
  const appendTenant = shouldAppendTenantToRedirect(slug)

  if (!tenantStore.tenant) return
  const gatesState = getModuleState(tenantStore.tenant.modules?.gates)
  if (isModuleVisibleToMembers(gatesState)) return

  return navigateTo(homeWithTenantQuery(tenantQuery, appendTenant), { replace: true })
})
