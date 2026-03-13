/**
 * Paginated marketplace assets: scope from marketplace_mint_scope, display from
 * tenant_mint_catalog (central store) + mint_metadata.
 */

import { useTenantStore } from '~/stores/tenant'
import { useSupabase } from '~/composables/core/useSupabase'

export interface MarketplaceAsset {
  mint: string
  source: string
  collectionMint?: string | null
  name?: string | null
  symbol?: string | null
  image?: string | null
  decimals?: number | null
  sellerFeeBasisPoints?: number | null
  tokenStandard?: string | null
}

const PAGE_SIZE = 50

export function useMarketplaceAssets() {
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId)
  const assets = ref<MarketplaceAsset[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const hasMore = ref(true)
  let page = 0

  async function fetchPage(reset = false) {
    const id = tenantId.value
    if (!id) return
    if (reset) {
      page = 0
      assets.value = []
      hasMore.value = true
    }
    if (!hasMore.value) return
    loading.value = true
    error.value = null
    try {
      const supabase = useSupabase()
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data: scopeRows, error: scopeError } = await supabase
        .from('marketplace_mint_scope')
        .select('mint, source, collection_mint')
        .eq('tenant_id', id)
        .range(from, to)
      if (scopeError) throw scopeError
      const rows = scopeRows ?? []
      if (rows.length === 0) {
        assets.value = reset ? [] : assets.value
        hasMore.value = false
        return
      }

      const mints = rows.map((r) => r.mint as string)
      const [catalogRes, metaRes] = await Promise.all([
        supabase
          .from('tenant_mint_catalog')
          .select('mint, kind, label')
          .eq('tenant_id', id)
          .in('mint', mints),
        supabase
          .from('mint_metadata')
          .select('mint, name, symbol, image, decimals, seller_fee_basis_points, token_standard')
          .in('mint', mints),
      ])

      const catalogByMint = new Map(
        (catalogRes.data ?? []).map((c) => [c.mint as string, c]),
      )
      const metaByMint = new Map(
        (metaRes.data ?? []).map((m) => [m.mint as string, m]),
      )

      const mapped: MarketplaceAsset[] = rows.map((row) => {
        const catalog = catalogByMint.get(row.mint as string) as { label?: string | null } | undefined
        const meta = metaByMint.get(row.mint as string) as { name?: string; symbol?: string; image?: string; decimals?: number; seller_fee_basis_points?: number; token_standard?: string } | undefined
        return {
          mint: row.mint as string,
          source: row.source as string,
          collectionMint: row.collection_mint as string | null,
          name: catalog?.label ?? meta?.name ?? null,
          symbol: meta?.symbol ?? null,
          image: meta?.image ?? null,
          decimals: meta?.decimals ?? null,
          sellerFeeBasisPoints: meta?.seller_fee_basis_points ?? null,
          tokenStandard: meta?.token_standard ?? null,
        }
      })
      assets.value = reset ? mapped : [...assets.value, ...mapped]
      hasMore.value = rows.length === PAGE_SIZE
      page++
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load assets'
    } finally {
      loading.value = false
    }
  }

  return { assets, loading, error, hasMore, fetchPage }
}
