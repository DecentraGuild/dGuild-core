/**
 * Address book entries for the current tenant.
 * Uses tenant_catalog Edge Function (central list). Address Book is always available as an admin tab.
 * Prepends platform defaults (SOL, USDC, USDT, WBTC) by mint address; deduplicates by mint.
 */

import { ADDRESS_BOOK_DEFAULT_MINTS } from '@decentraguild/core'
import { useTenantStore } from '~/stores/tenant'
import { useTenantCatalog } from '~/composables/watchtower/useTenantCatalog'
import { useSupabase } from '~/composables/core/useSupabase'

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

const DEFAULT_MINT_SET = new Set(ADDRESS_BOOK_DEFAULT_MINTS.map((c) => c.mint))

const DEFAULT_MINTS_LIST = ADDRESS_BOOK_DEFAULT_MINTS.map((c) => c.mint)

function defaultEntriesFromMeta(
  metaByMint: Map<string, { image?: string | null; name?: string | null; symbol?: string | null }>,
): AddressBookEntry[] {
  return ADDRESS_BOOK_DEFAULT_MINTS.map((c) => {
    const m = metaByMint.get(c.mint)
    return {
      mint: c.mint,
      kind: c.kind,
      tier: 'base' as const,
      label: c.name ?? c.symbol,
      name: m?.name ?? c.name,
      symbol: m?.symbol ?? c.symbol,
      image: m?.image ?? null,
    }
  })
}

export function useAddressBook() {
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId)
  const { list } = useTenantCatalog()
  const supabase = useSupabase()
  const entries = ref<AddressBookEntry[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchEntries() {
    const id = tenantId.value
    if (!id) return
    loading.value = true
    error.value = null
    try {
      const [data, metaRes] = await Promise.all([
        list(),
        supabase.from('mint_metadata').select('mint, image, name, symbol').in('mint', DEFAULT_MINTS_LIST),
      ])
      const metaByMint = new Map<string, { image?: string | null; name?: string | null; symbol?: string | null }>()
      if (!metaRes.error && metaRes.data) {
        for (const r of metaRes.data) {
          metaByMint.set(r.mint as string, r as { image?: string | null; name?: string | null; symbol?: string | null })
        }
      }
      const defaults = defaultEntriesFromMeta(metaByMint)
      const catalogEntries = data
        .filter((row) => !DEFAULT_MINT_SET.has(row.mint))
        .map((row) => ({
          id: row.id,
          mint: row.mint,
          kind: row.kind,
          tier: 'base' as const,
          label: row.label,
          image: row.image,
          name: row.name,
          symbol: row.symbol ?? null,
          collectionSize: row.collectionSize,
          uniqueTraitCount: row.uniqueTraitCount,
          traitIndex: row.trait_index,
        }))
      entries.value = [...defaults, ...catalogEntries]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load address book'
    } finally {
      loading.value = false
    }
  }

  return { entries, loading, error, fetchEntries }
}
