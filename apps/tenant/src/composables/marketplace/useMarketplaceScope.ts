/**
 * Marketplace mint scope for a tenant.
 * Reads from marketplace_mint_scope and expands collections via collection_members
 * so mintsSet includes member NFT mints (required for escrow filtering).
 */

import { computed, watch } from 'vue'
import { useTenantStore } from '~/stores/tenant'
import { useSupabase } from '~/composables/core/useSupabase'

export interface ScopeEntry {
  mint: string
  source: string
  collectionMint?: string | null
}

export function useMarketplaceScope() {
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId)
  const scope = ref<ScopeEntry[]>([])
  const memberMints = ref<string[]>([])
  const memberMintsByCollection = ref<Map<string, string[]>>(new Map())
  const sftCollectionMints = ref<Set<string>>(new Set())
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchScope() {
    const id = tenantId.value
    if (!id) return
    loading.value = true
    error.value = null
    memberMints.value = []
    try {
      const supabase = useSupabase()
      const { data, error: dbError } = await supabase
        .from('marketplace_mint_scope')
        .select('mint, source, collection_mint')
        .eq('tenant_id', id)

      if (dbError) throw dbError
      scope.value = (data ?? []).map((row) => ({
        mint: row.mint as string,
        source: row.source as string,
        collectionMint: row.collection_mint as string | null,
      }))

      const collectionMints = [...new Set(
        scope.value
          .filter((e) => e.source === 'collection' && e.collectionMint)
          .map((e) => e.collectionMint as string),
      )]
      if (collectionMints.length === 0) {
        memberMints.value = []
        memberMintsByCollection.value = new Map()
        sftCollectionMints.value = new Set()
      } else {
        const { data: catalogModeRows } = await supabase
          .from('tenant_mint_catalog')
          .select('mint, nft_collection_sync_mode')
          .eq('tenant_id', id)
          .in('mint', collectionMints)
        const sft = new Set<string>()
        for (const row of catalogModeRows ?? []) {
          const r = row as { mint: string; nft_collection_sync_mode?: string | null }
          if (r.nft_collection_sync_mode === 'sft_per_mint') sft.add(r.mint)
        }
        sftCollectionMints.value = sft
        const { data: members } = await supabase
          .from('collection_members')
          .select('collection_mint, mint')
          .in('collection_mint', collectionMints)
        const rows = members ?? []
        memberMints.value = rows.map((r) => r.mint as string)
        memberMintsByCollection.value = rows.reduce((acc, r) => {
          const col = r.collection_mint as string
          const m = r.mint as string
          const arr = acc.get(col) ?? []
          if (!arr.includes(m)) arr.push(m)
          acc.set(col, arr)
          return acc
        }, new Map<string, string[]>())
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load scope'
    } finally {
      loading.value = false
    }
  }

  watch(tenantId, (id) => {
    if (id) fetchScope()
    else {
      scope.value = []
      memberMints.value = []
      memberMintsByCollection.value = new Map()
      sftCollectionMints.value = new Set()
    }
  }, { immediate: true })

  const entries = computed(() => scope.value)
  const mintsSet = computed(() => {
    const set = new Set(scope.value.map((e) => e.mint))
    for (const m of memberMints.value) set.add(m)
    return set
  })
  const mintsByCollection = computed(() => {
    const map = new Map<string, string[]>()
    for (const e of scope.value) {
      if (e.source === 'collection' && e.collectionMint) {
        const members = memberMintsByCollection.value.get(e.collectionMint) ?? []
        if (members.length > 0) {
          map.set(e.collectionMint, members)
        } else {
          map.set(e.collectionMint, [e.mint])
        }
      }
    }
    return map
  })

  return {
    scope,
    entries,
    mintsSet,
    mintsByCollection,
    sftCollectionMints,
    loading,
    error,
    fetchScope,
    retry: fetchScope,
  }
}
