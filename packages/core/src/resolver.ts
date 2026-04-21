/**
 * Resolves tenant slug from host or query params.
 * Platform: dguild.org (main). Tenant shell: subdomain.dguild.org (e.g. dapp.dguild.org, skull.dguild.org).
 * For localhost, use ?tenant=slug. ?tenant= overrides host when present.
 */

export const TENANT_DOMAIN = '.dguild.org'

function getSlugFromHost(host: string): string | null {
  const hostLower = host.toLowerCase()
  if (!hostLower.endsWith(TENANT_DOMAIN)) return null
  const subdomain = hostLower.slice(0, -TENANT_DOMAIN.length).replace(/\.$/, '')
  // www = platform; api = API host (tenant-context is called with ?slug=; Host is api.dguild.org)
  if (subdomain === 'www' || subdomain === '' || subdomain === 'api') return null
  return subdomain
}

export function getTenantSlugFromHost(
  host: string,
  searchParams?: URLSearchParams
): string | null {
  if (!host) return null

  const hostLower = host.toLowerCase()

  if (searchParams) {
    const querySlug = searchParams.get('tenant')
    if (querySlug && querySlug.trim()) return querySlug.trim()
  }

  if (hostLower === 'localhost' || hostLower.startsWith('127.0.0.1') || hostLower.startsWith('localhost:')) {
    return null
  }

  return getSlugFromHost(host)
}

const RESERVED_TENANT_SUBDOMAINS = new Set(['', 'www', 'api', 'dapp'])

export function hasTenantSubdomainSlug(slug: string | null | undefined): boolean {
  const s = (slug ?? '').trim().toLowerCase()
  if (!s) return false
  if (RESERVED_TENANT_SUBDOMAINS.has(s)) return false
  return true
}

export function tenantDiscoveryAppUrl(opts: {
  tenantId: string
  slug: string | null | undefined
  isLocalhost: boolean
  localTenantAppOrigin?: string
  singleTenantAppHost?: string
}): string {
  const local = (opts.localTenantAppOrigin ?? 'http://localhost:3002').replace(/\/$/, '')
  if (opts.isLocalhost) {
    return `${local}?tenant=${encodeURIComponent(opts.tenantId)}`
  }
  const singleHost = (opts.singleTenantAppHost ?? 'dapp.dguild.org').replace(/\/$/, '').toLowerCase()
  if (hasTenantSubdomainSlug(opts.slug)) {
    const sub = String(opts.slug).trim().toLowerCase()
    return `https://${sub}${TENANT_DOMAIN}/`
  }
  return `https://${singleHost}/?tenant=${encodeURIComponent(opts.tenantId)}`
}
