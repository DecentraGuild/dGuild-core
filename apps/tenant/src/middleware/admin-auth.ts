import { useAuth } from '@decentraguild/auth'
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

export default defineNuxtRouteMiddleware(async (_to) => {
  const tenantStore = useTenantStore()
  const slug = tenantStore.slug
  const appendTenant = shouldAppendTenantToRedirect(slug)

  // Server: never render /admin (auth is client-side). Redirect so client loads home; preserve tenant query when on single-domain.
  if (import.meta.server) {
    return navigateTo(homeWithTenantQuery(slug, appendTenant), { replace: true })
  }
  const auth = useAuth()
  if (!tenantStore.tenant || !slug) {
    return navigateTo(homeWithTenantQuery(slug, appendTenant), { replace: true })
  }
  const wallet = auth.wallet.value
  if (!wallet) {
    return navigateTo(homeWithTenantQuery(slug, appendTenant), { replace: true })
  }
  const admins = tenantStore.tenant.admins ?? []
  if (!admins.includes(wallet)) {
    return navigateTo(homeWithTenantQuery(slug, appendTenant), { replace: true })
  }
})
