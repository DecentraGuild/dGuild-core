/**
 * Address book entries for the current tenant.
 * Uses tenant-catalog Edge Function (central list). Address Book is always available as an admin tab.
 */

import { useTenantStore } from '~/stores/tenant'
import { useTenantCatalog } from '~/composables/watchtower/useTenantCatalog'

export interface AddressBookEntry {
  id?: number
  mint: string
  kind: 'SPL' | 'NFT'
  tier: 'base'
  label?: string | null
  image?: string | null
  name?: string | null
  symbol?: string | null
  traitIndex?: unknown
}

export function useAddressBook() {
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId)
  const { list } = useTenantCatalog()
  const entries = ref<AddressBookEntry[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchEntries() {
    const id = tenantId.value
    if (!id) return
    loading.value = true
    error.value = null
    try {
      const data = await list()
      entries.value = data.map((row) => ({
        id: row.id,
        mint: row.mint,
        kind: row.kind,
        tier: 'base' as const,
        label: row.label,
        image: row.image,
        name: row.name,
        traitIndex: row.trait_index,
      }))
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load address book'
    } finally {
      loading.value = false
    }
  }

  return { entries, loading, error, fetchEntries }
}
