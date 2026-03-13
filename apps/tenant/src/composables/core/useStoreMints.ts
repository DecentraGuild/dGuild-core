/**
 * Single source for "what mints does the store accept" (offer filter) and
 * "what mints can the user request" (request dropdown).
 * Uses marketplace scope when available, falls back to marketplace settings.
 */

import { computed } from 'vue'
import { useTenantStore } from '~/stores/tenant'
import { useMarketplaceScope } from '~/composables/marketplace/useMarketplaceScope'

export function useStoreMints() {
  const tenantStore = useTenantStore()
  const { entries: scopeEntries, loading: scopeLoading } = useMarketplaceScope()

  /** Mints allowed for offer (from wallet). Scope-first, fallback to settings. */
  const allowedMints = computed(() => {
    const mints = new Set<string>()
    for (const e of scopeEntries.value) {
      mints.add(e.mint)
    }
    if (mints.size > 0) return mints
    const settings = tenantStore.marketplaceSettings
    if (!settings) return mints
    for (const c of settings.collectionMints ?? []) mints.add(c.mint)
    for (const c of settings.currencyMints ?? []) mints.add(c.mint)
    for (const s of settings.splAssetMints ?? []) mints.add(s.mint)
    return mints
  })

  /** Mints for request dropdown (collections, currencies, SPL). Always from settings. */
  const requestSelectorMints = computed(() => {
    const settings = tenantStore.marketplaceSettings
    if (!settings) return new Set<string>()
    const mints = new Set<string>()
    for (const c of settings.collectionMints ?? []) mints.add(c.mint)
    for (const c of settings.currencyMints ?? []) mints.add(c.mint)
    for (const s of settings.splAssetMints ?? []) mints.add(s.mint)
    return mints
  })

  return {
    allowedMints,
    requestSelectorMints,
    scopeEntries,
    scopeLoading,
  }
}
