/**
 * Member NFTs for a collection from collection_members (platform-wide, public read via RLS).
 * Used by marketplace browse, MintDetailModal, NFT selector, and create-trade flow.
 */
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
  const assets = ref<CollectionMemberNft[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetch() {
    const mint = collectionMint.value
    if (!mint) {
      assets.value = []
      return
    }
    loading.value = true
    error.value = null
    try {
      const supabase = useSupabase()
      const { data: rows, error: qErr } = await supabase
        .from('collection_members')
        .select('mint, name, image, traits, owner')
        .eq('collection_mint', mint)
        .order('mint')
        .limit(2000)
      if (qErr) throw qErr
      const entries = rows ?? []
      assets.value = entries.map((e) => ({
        mint: e.mint as string,
        metadata: {
          name: (e.name as string | null) ?? null,
          image: (e.image as string | null) ?? null,
          traits: Array.isArray(e.traits)
            ? (e.traits as Array<{ trait_type?: string; traitType?: string; value?: string }>)
            : [],
          owner: (e.owner as string | null) ?? null,
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
