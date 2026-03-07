/**
 * Fetch asset preview data for admin UI (SPL tokens and NFT collections).
 * Does not persist; used to show metadata before save.
 *
 * Resolve flow: one getAsset(mint), then from metadata/grouping decide collection vs SPL.
 * Only when it's a collection do we call getAssetsByGroup for size/traits.
 */

import type { DasAsset } from '@decentraguild/web3'
import { fetchAsset, fetchAssetsByGroup, fetchMintMetadataFromChain } from '@decentraguild/web3'
import { getSolanaConnection } from '../solana-connection.js'
import { traitsFromDasAsset } from './das-traits.js'

export interface SplAssetPreview {
  mint: string
  name: string | null
  symbol: string | null
  image: string | null
  decimals: number | null
  sellerFeeBasisPoints: number | null
}

export interface CollectionAssetPreview {
  mint: string
  name: string | null
  symbol: string | null
  image: string | null
  sellerFeeBasisPoints: number | null
  collectionSize: number
  uniqueTraitCount: number
  traitTypes: string[]
}

export type ResolvedAssetPreview =
  | { kind: 'SPL'; spl: SplAssetPreview }
  | { kind: 'NFT'; collection: CollectionAssetPreview }

export async function fetchSplAssetPreview(mint: string): Promise<SplAssetPreview> {
  const asset = await fetchAsset(mint)
  if (asset && (asset.content?.metadata || asset.content?.links?.image || asset.token_info?.decimals != null)) {
    const meta = asset.content?.metadata
    const bps = meta?.seller_fee_basis_points
    return {
      mint,
      name: meta?.name ?? null,
      symbol: meta?.symbol ?? null,
      image: asset.content?.links?.image ?? null,
      decimals: asset.token_info?.decimals ?? null,
      sellerFeeBasisPoints: typeof bps === 'number' && bps >= 0 && bps <= 10000 ? bps : null,
    }
  }
  const meta = await fetchMintMetadataFromChain(getSolanaConnection(), mint)
  return {
    mint,
    name: meta.name,
    symbol: meta.symbol,
    image: meta.image,
    decimals: meta.decimals,
    sellerFeeBasisPoints: meta.sellerFeeBasisPoints,
  }
}

/**
 * Build collection preview for a collection mint. Optionally pass the already-fetched asset
 * when the mint is the collection address to avoid a second getAsset.
 */
export async function fetchCollectionPreview(
  mint: string,
  preFetchedAsset?: DasAsset | null
): Promise<CollectionAssetPreview> {
  const asset = preFetchedAsset ?? (await fetchAsset(mint))
  if (!asset) {
    throw new Error('Asset not found')
  }
  const meta = asset.content?.metadata
  const image = asset.content?.links?.image ?? null
  const name = meta?.name ?? null
  const symbol = meta?.symbol ?? null
  const bps = meta?.seller_fee_basis_points
  const sellerFeeBasisPoints =
    typeof bps === 'number' && bps >= 0 && bps <= 10000 ? bps : null

  let collectionSize = 0
  const traitTypesSet = new Set<string>()

  const groups = asset.grouping ?? []
  const collectionGroup = groups.find((g) => g.group_key === 'collection')
  const collectionValue = collectionGroup?.group_value ?? (asset.id === mint ? mint : null)

  if (collectionValue) {
    let page = 1
    const limit = 1000
    let hasMore = true
    let itemCount = 0
    while (hasMore) {
      const result = await fetchAssetsByGroup('collection', collectionValue, page, limit)
      const items = result?.items ?? []
      if (page === 1 && result?.total != null) {
        collectionSize = result.total
      }
      itemCount += items.length
      for (const item of items) {
        for (const t of traitsFromDasAsset(item)) {
          const key = t.trait_type?.trim()
          if (key) traitTypesSet.add(key)
        }
      }
      hasMore = items.length >= limit
      page++
    }
    if (collectionSize === 0) {
      collectionSize = itemCount
    }
  } else if (asset.id === mint) {
    const single = await fetchAssetsByGroup('collection', mint, 1, 1)
    collectionSize = single?.total ?? 0
  }

  return {
    mint,
    name,
    symbol,
    image,
    sellerFeeBasisPoints,
    collectionSize,
    uniqueTraitCount: traitTypesSet.size,
    traitTypes: Array.from(traitTypesSet).sort(),
  }
}

/**
 * Resolve a mint to either SPL or NFT in one go: getAsset(mint) once, then decide from
 * metadata/grouping. Only when it's a collection do we call getAssetsByGroup for size/traits.
 */
export async function resolveAssetPreview(mint: string): Promise<ResolvedAssetPreview> {
  const asset = await fetchAsset(mint)

  if (!asset) {
    const meta = await fetchMintMetadataFromChain(getSolanaConnection(), mint)
    return {
      kind: 'SPL',
      spl: {
        mint,
        name: meta.name,
        symbol: meta.symbol,
        image: meta.image,
        decimals: meta.decimals,
        sellerFeeBasisPoints: meta.sellerFeeBasisPoints,
      },
    }
  }

  const groups = asset.grouping ?? []
  const collectionGroup = groups.find((g) => g.group_key === 'collection')
  const collectionValue = collectionGroup?.group_value ?? (asset.id === mint ? mint : null)

  if (collectionValue) {
    const totalResult = await fetchAssetsByGroup('collection', collectionValue, 1, 1)
    const total = totalResult?.total ?? 0
    if (total > 0) {
      const usePreFetched = collectionValue === mint ? asset : undefined
      const collection = await fetchCollectionPreview(collectionValue, usePreFetched)
      return { kind: 'NFT', collection }
    }
  } else if (asset.id === mint) {
    const single = await fetchAssetsByGroup('collection', mint, 1, 1)
    if ((single?.total ?? 0) > 0) {
      const collection = await fetchCollectionPreview(mint, asset)
      return { kind: 'NFT', collection }
    }
  }

  if (asset.content?.metadata || asset.content?.links?.image || asset.token_info?.decimals != null) {
    const meta = asset.content?.metadata
    const bps = meta?.seller_fee_basis_points
    return {
      kind: 'SPL',
      spl: {
        mint,
        name: meta?.name ?? null,
        symbol: meta?.symbol ?? null,
        image: asset.content?.links?.image ?? null,
        decimals: asset.token_info?.decimals ?? null,
        sellerFeeBasisPoints: typeof bps === 'number' && bps >= 0 && bps <= 10000 ? bps : null,
      },
    }
  }

  const meta = await fetchMintMetadataFromChain(getSolanaConnection(), mint)
  return {
    kind: 'SPL',
    spl: {
      mint,
      name: meta.name,
      symbol: meta.symbol,
      image: meta.image,
      decimals: meta.decimals,
      sellerFeeBasisPoints: meta.sellerFeeBasisPoints,
    },
  }
}
