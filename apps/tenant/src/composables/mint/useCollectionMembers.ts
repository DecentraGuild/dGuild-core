/**
 * Member NFTs for a collection from tenant_mint_catalog (central store).
 * Used by MintDetailModal (Address Book) and Watchtower modal.
 */
import { invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useTenantStore } from '~/stores/tenant'
import { useSupabase } from '~/composables/core/useSupabase'

export interface CollectionMemberNft {
  mint: string
  metadata?: {
    name?: string | null
    image?: string | null
    traits?: Array<{ trait_type?: string; traitType?: string; value?: string }>
    owner?: string | null
  }
}

export function useCollectionMembers(collectionMint: Ref<string | null>) {
  const tenantStore = useTenantStore()
  const assets = ref<CollectionMemberNft[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetch() {
    const mint = collectionMint.value
    const id = tenantStore.tenantId
    if (!mint || !id) {
      assets.value = []
      return
    }
    loading.value = true
    error.value = null
    try {
      const supabase = useSupabase()
      const data = await invokeEdgeFunction<{ entries?: Array<{ mint: string; name?: string | null; image?: string | null; traits?: unknown; owner?: string | null }> }>(
        supabase,
        'tenant_catalog',
        { action: 'list-members', tenantId: id, collectionMint: mint },
        { errorFallback: 'Failed to load member NFTs' },
      )
      const entries = data?.entries ?? []
      assets.value = entries.map((e) => ({
        mint: e.mint,
        metadata: {
          name: e.name ?? null,
          image: e.image ?? null,
          traits: Array.isArray(e.traits) ? e.traits : [],
          owner: e.owner ?? null,
        },
      }))
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load'
      assets.value = []
    } finally {
      loading.value = false
    }
  }

  watch(collectionMint, (m) => {
    if (m) void fetch()
    else assets.value = []
  }, { immediate: true })

  return { assets, loading, error, fetch }
}
