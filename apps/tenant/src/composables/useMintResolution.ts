import { API_V1 } from '~/utils/apiBase'
import type { MintKind, CollectionMint, SplAssetMint } from '~/types/mints'

export interface MintResolutionResult {
  kind: MintKind
  spl?: SplAssetMint
  collection?: CollectionMint
}

/** Response from GET .../marketplace/asset-preview/resolve/:mint */
interface ResolvedAssetResponse {
  kind: 'SPL' | 'NFT'
  spl?: Record<string, unknown>
  collection?: Record<string, unknown>
}

export function useMintResolution() {
  const apiBase = useApiBase()

  /**
   * Resolve a mint with one RPC-backed call. Backend does getAsset(mint) once,
   * then from metadata/grouping decides collection vs SPL; only for collections
   * does it call getAssetsByGroup for size/traits.
   */
  async function resolveMint(
    mint: string,
    hintKind?: MintKind | 'auto',
  ): Promise<MintResolutionResult> {
    const base = apiBase.value
    const res = await fetch(
      `${base}${API_V1}/marketplace/asset-preview/resolve/${encodeURIComponent(mint)}`,
    )
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      throw new Error(err.message ?? err.error ?? 'Failed to resolve mint')
    }

    const data = (await res.json()) as ResolvedAssetResponse
    if (data.kind === 'NFT' && data.collection) {
      if (hintKind === 'SPL') {
        throw new Error('This mint is an NFT collection, not an SPL token')
      }
      return {
        kind: 'NFT',
        collection: {
          mint: (data.collection.mint as string) ?? mint,
          name: (data.collection.name as string) ?? undefined,
          image: (data.collection.image as string) ?? undefined,
          sellerFeeBasisPoints: (data.collection.sellerFeeBasisPoints as number) ?? undefined,
          collectionSize: (data.collection.collectionSize as number) ?? 0,
          uniqueTraitCount: (data.collection.uniqueTraitCount as number) ?? 0,
          traitTypes: (data.collection.traitTypes as string[]) ?? [],
        },
      }
    }

    if (data.kind === 'SPL' && data.spl) {
      if (hintKind === 'NFT') {
        throw new Error('This mint is an SPL token, not an NFT collection')
      }
      return {
        kind: 'SPL',
        spl: {
          mint: (data.spl.mint as string) ?? mint,
          name: (data.spl.name as string) ?? undefined,
          symbol: (data.spl.symbol as string) ?? undefined,
          image: (data.spl.image as string) ?? undefined,
          decimals: (data.spl.decimals as number) ?? undefined,
          sellerFeeBasisPoints: (data.spl.sellerFeeBasisPoints as number) ?? undefined,
        },
      }
    }

    throw new Error('Mint not recognised as SPL token or NFT collection')
  }

  return { resolveMint }
}
