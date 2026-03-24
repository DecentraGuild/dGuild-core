import { useTenantCatalog } from '~/composables/watchtower/useTenantCatalog'

export interface EnsuredMintEntry {
  mint: string
  kind: 'SPL' | 'NFT'
  name: string | null
  label: string | null
  symbol: string | null
  image: string | null
  decimals: number | null
  collectionSize?: number
  uniqueTraitCount?: number
}

export function useEnsureCatalogMint() {
  const tenantCatalog = useTenantCatalog()
  const ensuring = ref(false)

  async function ensureMint(mint: string, kindHint?: 'SPL' | 'NFT'): Promise<EnsuredMintEntry> {
    const trimmed = mint.trim()
    ensuring.value = true
    try {
      const { entry, resolved } = await tenantCatalog.add({
        mint: trimmed,
        kind: kindHint ?? 'auto',
      })
      return {
        mint: trimmed,
        kind: resolved.kind,
        name: resolved.name,
        label: entry.label,
        symbol: resolved.symbol,
        image: resolved.image,
        decimals: resolved.decimals,
        collectionSize: resolved.collectionSize,
        uniqueTraitCount: resolved.uniqueTraitCount,
      }
    } finally {
      ensuring.value = false
    }
  }

  return { ensureMint, ensuring }
}
