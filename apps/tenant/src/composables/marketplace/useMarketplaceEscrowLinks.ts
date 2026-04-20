/**
 * Escrow link and share URL helpers for the marketplace.
 * Centralizes path/query construction and clipboard copy.
 * Only appends ?tenant= when not already on a tenant subdomain (see useTenantInLinks).
 */
import { useTenantInLinks } from '~/composables/core/useTenantInLinks'

export interface EscrowLinkResult {
  path: string
  query?: Record<string, string>
}

export interface EscrowLinkOptions {
  tab?: string
}

export function useMarketplaceEscrowLinks() {
  const { shouldAppendTenantToLinks, tenantParamForQuery } = useTenantInLinks()

  function escrowLink(id: string, options?: EscrowLinkOptions): EscrowLinkResult {
    const query: Record<string, string> = { escrow: id }
    const t = tenantParamForQuery.value
    if (t && shouldAppendTenantToLinks.value) query.tenant = t
    if (options?.tab) query.tab = options.tab
    return { path: '/market', query }
  }

  function shareUrl(id: string): string {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    const t = tenantParamForQuery.value
    const path =
      t && shouldAppendTenantToLinks.value
        ? `/market/escrow/${id}?tenant=${encodeURIComponent(t)}`
        : `/market/escrow/${id}`
    return `${base}${path}`
  }

  function copyShareLink(id: string): void {
    const url = shareUrl(id)
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url)
    }
  }

  return { escrowLink, shareUrl, copyShareLink }
}
