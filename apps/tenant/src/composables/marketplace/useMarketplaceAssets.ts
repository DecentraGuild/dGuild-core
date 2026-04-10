/**
 * Paginated marketplace assets: scope from marketplace_mint_scope, display from
 * tenant_mint_catalog (central store) + mint_metadata.
 */

import { computed, ref } from 'vue'
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

function mapScopeToAssets(
  rows: { mint: string; source: string; collection_mint: string | null }[],
  catalogByMint: Map<string, { label?: string | null }>,
  metaByMint: Map<
    string,
    {
      name?: string | null
      symbol?: string | null
      image?: string | null
      decimals?: number | null
      seller_fee_basis_points?: number | null
      token_standard?: string | null
    }
  >,
): MarketplaceAsset[] {
  return rows.map((row) => {
    const catalog = catalogByMint.get(row.mint)
    const meta = metaByMint.get(row.mint)
    return {
      mint: row.mint,
      source: row.source,
      collectionMint: row.collection_mint,
      name: catalog?.label ?? meta?.name ?? null,
      symbol: meta?.symbol ?? null,
      image: meta?.image ?? null,
      decimals: meta?.decimals ?? null,
      sellerFeeBasisPoints: meta?.seller_fee_basis_points ?? null,
      tokenStandard: meta?.token_standard ?? null,
    }
  })
}

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
        .order('mint', { ascending: true })
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
        (catalogRes.data ?? []).map((c) => [c.mint as string, c as { label?: string | null }]),
      )
      const metaByMint = new Map(
        (metaRes.data ?? []).map((m) => [m.mint as string, m]),
      )

      const mapped = mapScopeToAssets(
        rows.map((row) => ({
          mint: row.mint as string,
          source: row.source as string,
          collection_mint: row.collection_mint as string | null,
        })),
        catalogByMint,
        metaByMint,
      )
      assets.value = reset ? mapped : [...assets.value, ...mapped]
      hasMore.value = rows.length === PAGE_SIZE
      page++
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load assets'
    } finally {
      loading.value = false
    }
  }

  /**
   * Re-query catalog + metadata for specific mints and merge into `assets`.
   * Used when opening item detail so Supabase rows that arrived after the first page load still show.
   */
  async function refreshMints(mints: string[]) {
    const id = tenantId.value
    const uniq = [...new Set(mints.map((m) => m.trim()).filter(Boolean))]
    if (!id || uniq.length === 0) return
    loading.value = true
    error.value = null
    try {
      const supabase = useSupabase()
      const { data: scopeRows, error: scopeError } = await supabase
        .from('marketplace_mint_scope')
        .select('mint, source, collection_mint')
        .eq('tenant_id', id)
        .in('mint', uniq)
      if (scopeError) throw scopeError
      const rows = scopeRows ?? []
      if (rows.length === 0) return

      const rowMints = rows.map((r) => r.mint as string)
      const [catalogRes, metaRes] = await Promise.all([
        supabase
          .from('tenant_mint_catalog')
          .select('mint, kind, label')
          .eq('tenant_id', id)
          .in('mint', rowMints),
        supabase
          .from('mint_metadata')
          .select('mint, name, symbol, image, decimals, seller_fee_basis_points, token_standard')
          .in('mint', rowMints),
      ])

      const catalogByMint = new Map(
        (catalogRes.data ?? []).map((c) => [c.mint as string, c as { label?: string | null }]),
      )
      const metaByMint = new Map((metaRes.data ?? []).map((m) => [m.mint as string, m]))

      const mapped = mapScopeToAssets(
        rows.map((row) => ({
          mint: row.mint as string,
          source: row.source as string,
          collection_mint: row.collection_mint as string | null,
        })),
        catalogByMint,
        metaByMint,
      )

      const byMint = new Map(assets.value.map((a) => [a.mint, a]))
      for (const a of mapped) {
        byMint.set(a.mint, a)
      }
      assets.value = [...byMint.values()]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to refresh assets'
    } finally {
      loading.value = false
    }
  }

  return { assets, loading, error, hasMore, fetchPage, refreshMints }
}
