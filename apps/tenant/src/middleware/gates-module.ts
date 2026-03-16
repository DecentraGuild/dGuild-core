import { getModuleState, isModuleVisibleToMembers } from '@decentraguild/core'
import { getTenantSlugFromHost } from '@decentraguild/core'

function homeWithTenantQuery(slug: string | null, appendTenant: boolean) {
  return slug && appendTenant ? { path: '/', query: { tenant: slug } } : slug ? '/' : '/'
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
  const appendTenant = shouldAppendTenantToRedirect(slug)

  if (!tenantStore.tenant) return
  const gatesState = getModuleState(tenantStore.tenant.modules?.gates)
  if (isModuleVisibleToMembers(gatesState)) return

  return navigateTo(homeWithTenantQuery(slug, appendTenant), { replace: true })
})
