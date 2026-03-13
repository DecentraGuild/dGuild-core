/**
 * Resolve a mint address to kind + metadata via the marketplace Edge Function.
 * Returns { kind, spl?, collection? } for MintAssetPicker.
 */
import { useSupabase } from '~/composables/core/useSupabase'
import type { SplAssetMint, CollectionMint } from '~/types/mints'

export type AssetKind = 'SPL' | 'NFT' | null

export type ResolveMintResult =
  | { kind: 'SPL'; spl: SplAssetMint }
  | { kind: 'NFT'; collection: CollectionMint }
  | null

export function useMintResolution() {
  const resolving = ref(false)

  async function resolveMint(
    mint: string,
    kindHint?: 'SPL' | 'NFT',
  ): Promise<ResolveMintResult> {
    if (!mint) return null
    resolving.value = true
    try {
      const supabase = useSupabase()
      const { data, error } = await supabase.functions.invoke('marketplace', {
        body: { action: 'resolve-full', mint, kind: kindHint ?? 'auto' },
      })
      if (error) throw error
      const d = data as { kind?: string; spl?: SplAssetMint; collection?: CollectionMint }
      if (d?.kind === 'SPL' && d.spl) return { kind: 'SPL', spl: { ...d.spl, mint } }
      if (d?.kind === 'NFT' && d.collection) return { kind: 'NFT', collection: { ...d.collection, mint } }
      throw new Error('Could not resolve mint as NFT collection or SPL token')
    } finally {
      resolving.value = false
    }
  }

  return { resolveMint, resolving }
}
