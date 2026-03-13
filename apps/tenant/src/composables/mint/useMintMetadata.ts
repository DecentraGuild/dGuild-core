/**
 * Fetch mint metadata from PostgREST (mint_metadata table, public read) with
 * client-side RPC fallback for uncached mints.
 */
import { fetchMintMetadataFromChain } from '@decentraguild/web3'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { useSupabase } from '~/composables/core/useSupabase'

export interface MintMetadata {
  mint: string
  name: string
  symbol: string
  image?: string | null
  decimals: number
}

const cache = new Map<string, MintMetadata>()

export function useMintMetadata() {
  async function fetchMetadata(mint: string, forceFromChain = false): Promise<MintMetadata | null> {
    const cached = cache.get(mint)
    if (cached && !forceFromChain) return cached

    if (!forceFromChain) {
      try {
        const supabase = useSupabase()
        const { data, error } = await supabase
          .from('mint_metadata')
          .select('mint, name, symbol, image, decimals')
          .eq('mint', mint)
          .maybeSingle()

        if (!error && data) {
          const meta: MintMetadata = {
            mint: data.mint as string,
            name: (data.name as string) ?? '',
            symbol: (data.symbol as string) ?? '',
            image: data.image as string | null,
            decimals: (data.decimals as number) ?? 0,
          }
          cache.set(mint, meta)
          return meta
        }
      } catch {
        // Fall through to RPC
      }
    }

    const { connection } = useSolanaConnection()
    if (!connection.value) return null
    try {
      const fetched = await fetchMintMetadataFromChain(connection.value, mint)
      const meta: MintMetadata = {
        mint: fetched.mint,
        name: fetched.name ?? '',
        symbol: fetched.symbol ?? '',
        image: fetched.image ?? null,
        decimals: fetched.decimals ?? 0,
      }
      cache.set(mint, meta)
      return meta
    } catch {
      return null
    }
  }

  return { fetchMetadata }
}
