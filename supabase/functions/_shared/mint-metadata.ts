/**
 * Fetch mint metadata from Solana RPC (DAS getAsset).
 * Shared by tenant-catalog and marketplace for consistent metadata.
 */

export interface MintMetadataResult {
  kind: 'SPL' | 'NFT'
  name: string | null
  label: string | null
  image: string | null
  traitIndex?: Record<string, unknown> | null
  /** NFT collection: total items in group (from getAssetsByGroup total). */
  collectionSize?: number
  /** SPL token decimals (from token_info.decimals). */
  decimals?: number | null
  /** Extended metadata from DAS (for display and next-gen marketplace). */
  updateAuthority?: string | null
  uri?: string | null
  sellerFeeBasisPoints?: number | null
  primarySaleHappened?: boolean | null
  isMutable?: boolean | null
  editionNonce?: number | null
  tokenStandard?: string | null
}

/** Extract extended metadata from DAS getAsset result. */
export function extractExtendedMetadata(asset: Record<string, unknown> | null | undefined): {
  updateAuthority: string | null
  uri: string | null
  sellerFeeBasisPoints: number | null
  primarySaleHappened: boolean | null
  isMutable: boolean | null
  editionNonce: number | null
  tokenStandard: string | null
} {
  if (!asset) {
    return { updateAuthority: null, uri: null, sellerFeeBasisPoints: null, primarySaleHappened: null, isMutable: null, editionNonce: null, tokenStandard: null }
  }
  const content = asset.content as Record<string, unknown> | undefined
  const meta = (content?.metadata as Record<string, unknown>) ?? {}
  const royalty = asset.royalty as Record<string, unknown> | undefined
  const authorities = (asset.authorities as Array<{ address?: string; scopes?: string[] }>) ?? []
  const updateAuth = authorities.find((a) => (a.scopes ?? []).includes('update') || (a.scopes ?? []).includes('full'))?.address ?? authorities[0]?.address ?? null
  const uri = (content?.json_uri as string) ?? null
  const bps = typeof meta?.seller_fee_basis_points === 'number' ? meta.seller_fee_basis_points : (typeof royalty?.basis_points === 'number' ? royalty.basis_points : null)
  const sellerFeeBasisPoints = bps != null && bps >= 0 && bps <= 10000 ? bps : null
  const primarySaleHappened = typeof royalty?.primary_sale_happened === 'boolean' ? royalty.primary_sale_happened : null
  const isMutable = typeof meta?.is_mutable === 'boolean' ? meta.is_mutable : null
  const editionNonce = typeof meta?.edition_nonce === 'number' ? meta.edition_nonce : null
  const tokenStandard = (asset.interface as string) ?? (meta?.token_standard as string) ?? null
  return {
    updateAuthority: updateAuth ?? null,
    uri: uri && uri.trim() ? uri.trim() : null,
    sellerFeeBasisPoints,
    primarySaleHappened,
    isMutable,
    editionNonce,
    tokenStandard: tokenStandard && String(tokenStandard).trim() ? String(tokenStandard).trim() : null,
  }
}

export async function fetchMintMetadata(
  mint: string,
  kindHint?: 'SPL' | 'NFT',
): Promise<MintMetadataResult | null> {
  const rpcUrl = Deno.env.get('HELIUS_RPC_URL') ?? Deno.env.get('SOLANA_RPC_URL')
  if (!rpcUrl) return null

  try {
    if (kindHint !== 'SPL') {
      const colRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAssetsByGroup',
          params: { groupKey: 'collection', groupValue: mint, limit: 1, page: 1 },
        }),
      })
      const colData = await colRes.json() as { result?: { total?: number } }
      const collectionSize = colData.result?.total ?? 0
      if (collectionSize > 0) {
        const traitKeys = new Set<string>()
        const traitOptions: Record<string, Set<string>> = {}
        let pgN = 1
        let more = true
        while (more) {
          const r2 = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getAssetsByGroup',
              params: { groupKey: 'collection', groupValue: mint, limit: 1000, page: pgN },
            }),
          })
          const d2 = await r2.json() as { result?: { items?: Array<Record<string, unknown>> } }
          const items = d2.result?.items ?? []
          for (const item of items) {
            const attrs = ((item.content as Record<string, unknown>)?.metadata as Record<string, unknown>)
              ?.attributes as Array<{ trait_type?: string; value?: string }> | undefined
            if (attrs) {
              for (const a of attrs) {
                if (!a.trait_type) continue
                traitKeys.add(a.trait_type)
                if (!traitOptions[a.trait_type]) traitOptions[a.trait_type] = new Set()
                if (a.value) traitOptions[a.trait_type].add(String(a.value))
              }
            }
          }
          more = items.length >= 1000
          pgN++
        }
        const metaRes = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }),
        })
        const metaData = await metaRes.json() as { result?: Record<string, unknown> }
        const assetResult = metaData.result
        const assetMeta = (assetResult?.content as Record<string, unknown>)?.metadata as Record<string, unknown> | undefined
        const links = (assetResult?.content as Record<string, unknown>)?.links as Record<string, unknown> | undefined
        const name = assetMeta?.name as string ?? null
        const image = links?.image as string ?? null
        const ext = extractExtendedMetadata(assetResult as Record<string, unknown>)
        return {
          kind: 'NFT',
          name,
          label: name,
          image,
          collectionSize,
          traitIndex: {
            trait_keys: [...traitKeys],
            trait_options: Object.fromEntries([...Object.entries(traitOptions)].map(([k, v]) => [k, [...v]])),
          },
          ...ext,
        }
      }
    }

    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }),
    })
    const data = await res.json() as { result?: Record<string, unknown> }
    const asset = data.result
    const meta = (asset?.content as Record<string, unknown>)?.metadata as Record<string, unknown> | undefined
    const links = (asset?.content as Record<string, unknown>)?.links as Record<string, unknown> | undefined
    const tokenInfo = asset?.token_info as Record<string, unknown> | undefined
    const name = meta?.name as string ?? null
    const symbol = meta?.symbol as string ?? null
    const image = links?.image as string ?? null
    const decimals = typeof tokenInfo?.decimals === 'number' ? tokenInfo.decimals : null
    const ext = extractExtendedMetadata(asset as Record<string, unknown>)
    return {
      kind: 'SPL',
      name,
      label: name ?? symbol,
      image,
      traitIndex: null,
      decimals,
      ...ext,
    }
  } catch {
    return null
  }
}
