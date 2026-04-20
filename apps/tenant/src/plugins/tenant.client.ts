import { getTenantSlugFromHost } from '@decentraguild/core'
import { useThemeStore } from '@decentraguild/ui'
import { useTenantStore } from '~/stores/tenant'
import { requestHostMatchesTenantSingleHost } from '~/utils/tenantSingleHostMatch'

const LAST_TENANT_STORAGE_KEY = 'dg_last_tenant'

function setCachedTenantId(tenantId: string): void {
  if (import.meta.server || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(LAST_TENANT_STORAGE_KEY, tenantId)
  } catch {
    /* ignore */
  }
}

function queryTenantAsString(q: unknown): string | null {
  if (q == null) return null
  const raw = Array.isArray(q) ? q[0] : q
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  return t || null
}

/** Tenant param from URL (id or slug). On dapp single host, only `?tenant=` (or dev defaults) resolves — never localStorage. */
function getTenantParamFromUrl(): string | null {
  if (import.meta.server) return null
  const config = useRuntimeConfig()
  const devDefaultSlug = (config.public.devTenantSlug as string)?.trim() || ''
  const host = window.location.hostname.toLowerCase()
  const searchParams = new URL(window.location.href).searchParams
  const queryParam = searchParams.get('tenant')?.trim() || null

  if (queryParam) return queryParam

  if (requestHostMatchesTenantSingleHost(window.location.host, config.public.tenantSingleHost)) {
    return null
  }

  let slug = getTenantSlugFromHost(host, searchParams)
  if (!slug && (host === 'localhost' || host === '127.0.0.1') && devDefaultSlug) {
    slug = devDefaultSlug
  }
  return slug || null
}

export default defineNuxtPlugin(async () => {
  if (import.meta.server) return

  const tenantStore = useTenantStore()
  const themeStore = useThemeStore()
  const route = useRoute()
  const router = useRouter()
  const config = useRuntimeConfig()

  async function ensureTenantContext(slug: string | null) {
    if (!slug) return
    const tid = tenantStore.tenant?.id
    const match = tid === slug || tenantStore.tenant?.slug === slug
    if (match) return
    await tenantStore.fetchTenantContext(slug)
  }

  function persistTenantToCache() {
    const t = tenantStore.tenant
    if (t?.id) setCachedTenantId(t.id)
  }

  const searchParams = new URL(window.location.href).searchParams
  const tenantFromUrl = searchParams.get('tenant')?.trim() || null
  const isNewOrgRedirect = Boolean(searchParams.get('new'))

  if (tenantFromUrl) {
    const current = tenantStore.tenant
    const match = current && (current.id === tenantFromUrl || current.slug === tenantFromUrl)
    if (!match) {
      tenantStore.clearTenant()
      tenantStore.setSlug(tenantFromUrl)
    }
  }

  const initialParam = getTenantParamFromUrl()
  await ensureTenantContext(initialParam)
  persistTenantToCache()

  const isSingleHost = requestHostMatchesTenantSingleHost(window.location.host, config.public.tenantSingleHost)
  const loadedTenantId = tenantStore.tenant?.id

  if (isSingleHost && loadedTenantId && router) {
    const currentQuery = queryTenantAsString(route.query.tenant)
    if (currentQuery !== loadedTenantId) {
      router.replace({ path: route.path, query: { ...route.query, tenant: loadedTenantId } })
    }
  }

  if (isNewOrgRedirect && router && loadedTenantId) {
    const q = { ...route.query }
    delete q.new
    router.replace({ path: route.path, query: Object.keys(q).length ? q : undefined })
  }

  themeStore.applyThemeToDocument()

  watch(
    () => tenantStore.tenant,
    () => persistTenantToCache(),
    { deep: true }
  )

  watch(
    () => [route.fullPath, route.query.tenant] as const,
    () => {
      const newParam = getTenantParamFromUrl()
      if (!newParam) return
      if (newParam !== tenantStore.slug && newParam !== tenantStore.tenantId) {
        tenantStore.clearTenant()
        tenantStore.setSlug(newParam)
        void tenantStore.fetchTenantContext(newParam)
      }
    }
  )
})
