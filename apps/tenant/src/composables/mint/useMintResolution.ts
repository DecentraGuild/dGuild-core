import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantStore } from '~/stores/tenant'
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
    const tenantId = useTenantStore().tenantId
    if (!tenantId) throw new Error('Tenant not loaded')
    resolving.value = true
    try {
      const supabase = useSupabase()
      const { data, error } = await supabase.functions.invoke('tenant_catalog', {
        body: {
          action: 'resolve-full',
          tenantId,
          mint,
          kind: kindHint ?? 'auto',
        },
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
