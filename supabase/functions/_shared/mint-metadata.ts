/**
 * Fetch mint metadata from Solana RPC (DAS getAsset).
 * Shared by tenant_catalog and marketplace for consistent metadata.
 */

import {
  classifyDasAssetKind,
  getOnChainSplMintState,
  isDasCompressedNft,
  isMplCoreAccount,
} from './spl-mint-guard.ts'
import { solanaJsonRpc } from './solana-json-rpc.ts'

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
  /** Legacy Tokenkeg… mint vs Token-2022; null when mint is not an SPL mint account (e.g. MPL Core). */
  splTokenProgram?: 'legacy' | 'token_2022' | null
  isMplCore?: boolean
  isCompressedNft?: boolean
  /**
   * NFT collection mints only: how Watchtower aggregates holders.
   * From DAS `getAssetsByGroup` item `interface` (Metaplex): all `FungibleAsset` → per-child SPL holders.
   */
  nftCollectionSyncMode?: 'das_group' | 'sft_per_mint'
}

/** DAS `interface` values that represent fungible collection members (SFT); holders are per-mint SPL. */
const DAS_INTERFACE_FUNGIBLE_COLLECTION_MEMBER = new Set(['FungibleAsset', 'FungibleToken'])

/**
 * First page of collection members: if every item is a fungible interface, use per-mint SPL holder sync.
 * Mixed or non-fungible → classic getAssetsByGroup ownership rollup.
 */
export function inferNftCollectionSyncModeFromDasGroupItems(
  items: Array<Record<string, unknown>>,
): 'das_group' | 'sft_per_mint' {
  if (items.length === 0) return 'das_group'
  for (const it of items) {
    const iface = String(it.interface ?? '').trim()
    if (!DAS_INTERFACE_FUNGIBLE_COLLECTION_MEMBER.has(iface)) return 'das_group'
  }
  return 'sft_per_mint'
}

function traitIndexFromDasAsset(asset: Record<string, unknown>): Record<string, unknown> {
  const traitKeys = new Set<string>()
  const traitOptions: Record<string, Set<string>> = {}
  const attrs = ((asset.content as Record<string, unknown>)?.metadata as Record<string, unknown>)
    ?.attributes as Array<{ trait_type?: string; value?: string }> | undefined
  if (attrs) {
    for (const a of attrs) {
      if (!a.trait_type) continue
      traitKeys.add(a.trait_type)
      if (!traitOptions[a.trait_type]) traitOptions[a.trait_type] = new Set()
      if (a.value) traitOptions[a.trait_type].add(String(a.value))
    }
  }
  return {
    trait_keys: [...traitKeys],
    trait_options: Object.fromEntries([...Object.entries(traitOptions)].map(([k, v]) => [k, [...v]])),
  }
}

function normalizeMetadataJsonUri(uri: string): string | null {
  const t = uri.trim()
  if (!t || t.startsWith('http://localhost')) return null
  if (t.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${t.replace('ipfs://', '').replace(/^\/+/, '')}`
  }
  if (t.startsWith('ar://')) {
    return `https://arweave.net/${t.replace('ar://', '').replace(/^\/+/, '')}`
  }
  if (t.startsWith('http://') || t.startsWith('https://')) return t
  return null
}

async function fetchImageFromMetadataJsonUri(jsonUri: string): Promise<string | null> {
  const url = normalizeMetadataJsonUri(jsonUri)
  if (!url) return null
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    clearTimeout(t)
    if (!res.ok) return null
    const json = (await res.json()) as { image?: string; image_url?: string }
    const img = json.image ?? json.image_url
    return typeof img === 'string' && img.trim() ? img.trim() : null
  } catch {
    return null
  }
}

/** Prefer DAS-native fields; fungible Metaplex mints often omit content.links.image until JSON is fetched. */
export function extractImageFromDasAsset(asset: Record<string, unknown>): string | null {
  const content = asset.content as Record<string, unknown> | undefined
  if (!content) return null
  const links = content.links as Record<string, unknown> | undefined
  const li = links?.image
  if (typeof li === 'string' && li.trim()) return li.trim()
  const files = content.files as Array<Record<string, unknown>> | undefined
  if (files?.length) {
    const f0 = files[0]
    const u = (f0?.uri ?? f0?.cdn_uri ?? f0?.cdnUri) as string | undefined
    if (typeof u === 'string' && u.trim()) return u.trim()
  }
  const json = content.json as Record<string, unknown> | undefined
  if (json) {
    const ji = json.image ?? json.image_url
    if (typeof ji === 'string' && ji.trim()) return ji.trim()
  }
  const metadata = content.metadata as Record<string, unknown> | undefined
  const mi = metadata?.image
  if (typeof mi === 'string' && mi.trim()) return mi.trim()
  return null
}

async function resolveDasImage(asset: Record<string, unknown>): Promise<string | null> {
  const direct = extractImageFromDasAsset(asset)
  if (direct) return direct
  const ext = extractExtendedMetadata(asset)
  if (ext.uri) {
    const fromJson = await fetchImageFromMetadataJsonUri(ext.uri)
    if (fromJson) return fromJson
  }
  return null
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
  const uriRaw = (content?.json_uri as string) ?? (content?.uri as string) ?? null
  const uri = uriRaw && uriRaw.trim() ? uriRaw.trim() : null
  const bps = typeof meta?.seller_fee_basis_points === 'number' ? meta.seller_fee_basis_points : (typeof royalty?.basis_points === 'number' ? royalty.basis_points : null)
  const sellerFeeBasisPoints = bps != null && bps >= 0 && bps <= 10000 ? bps : null
  const primarySaleHappened = typeof royalty?.primary_sale_happened === 'boolean' ? royalty.primary_sale_happened : null
  const isMutable = typeof meta?.is_mutable === 'boolean' ? meta.is_mutable : null
  const editionNonce = typeof meta?.edition_nonce === 'number' ? meta.edition_nonce : null
  const tokenStandard = (asset.interface as string) ?? (meta?.token_standard as string) ?? null
  return {
    updateAuthority: updateAuth ?? null,
    uri,
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
      const colData = await solanaJsonRpc<{ total?: number; items?: Array<Record<string, unknown>> }>(
        rpcUrl,
        'getAssetsByGroup',
        { groupKey: 'collection', groupValue: mint, limit: 1, page: 1 },
      )
      const collectionSize = colData.total ?? 0
      if (collectionSize > 0) {
        const onChain = await getOnChainSplMintState(rpcUrl, mint)
        const mplCoreCollection = await isMplCoreAccount(rpcUrl, mint)
        if (!onChain.ok && !mplCoreCollection) return null

        const pageLimit = Math.min(1000, Math.max(1, collectionSize))
        const sampleData = await solanaJsonRpc<{ items?: Array<Record<string, unknown>> }>(
          rpcUrl,
          'getAssetsByGroup',
          { groupKey: 'collection', groupValue: mint, limit: pageLimit, page: 1 },
        )
        const sampleItems = sampleData.items ?? []
        const nftCollectionSyncMode = inferNftCollectionSyncModeFromDasGroupItems(sampleItems)

        const assetResult = await solanaJsonRpc<Record<string, unknown> | null>(
          rpcUrl,
          'getAsset',
          { id: mint },
        )
        if (!assetResult) return null
        const assetMeta = (assetResult.content as Record<string, unknown>)?.metadata as Record<string, unknown> | undefined
        const name = assetMeta?.name as string ?? null
        const ext = extractExtendedMetadata(assetResult as Record<string, unknown>)
        const image = await resolveDasImage(assetResult as Record<string, unknown>)
        const isCompressedNft = isDasCompressedNft(assetResult as Record<string, unknown>)
        const splTokenProgram = onChain.ok ? onChain.tokenProgram : null
        return {
          kind: 'NFT',
          name,
          label: name,
          image,
          collectionSize,
          traitIndex: null,
          splTokenProgram,
          isMplCore: mplCoreCollection,
          isCompressedNft,
          nftCollectionSyncMode,
          ...ext,
        }
      }
    }

    const asset = await solanaJsonRpc<Record<string, unknown> | null>(rpcUrl, 'getAsset', { id: mint })
    if (!asset) return null

    const onChain = await getOnChainSplMintState(rpcUrl, mint)
    const mplCore = await isMplCoreAccount(rpcUrl, mint)
    if (!onChain.ok && !mplCore) return null
    if (mplCore && kindHint === 'SPL') return null

    const isCompressedNft = isDasCompressedNft(asset as Record<string, unknown>)
    const splTokenProgram = onChain.ok ? onChain.tokenProgram : null

    let classified = classifyDasAssetKind(asset as Record<string, unknown>)
    if (mplCore) classified = 'NFT'
    if (!classified) {
      if (onChain.ok && onChain.decimals > 0) classified = 'SPL'
      else if (kindHint === 'SPL') classified = 'SPL'
      else if (kindHint === 'NFT') classified = 'NFT'
      else return null
    }
    if (kindHint === 'SPL' && classified !== 'SPL') return null
    if (kindHint === 'NFT' && classified !== 'NFT') return null

    const meta = (asset.content as Record<string, unknown>)?.metadata as Record<string, unknown> | undefined
    const tokenInfo = asset.token_info as Record<string, unknown> | undefined
    const name = meta?.name as string ?? null
    const symbol = meta?.symbol as string ?? null
    const decimals =
      typeof tokenInfo?.decimals === 'number' ? tokenInfo.decimals : onChain.ok ? onChain.decimals : null
    const ext = extractExtendedMetadata(asset as Record<string, unknown>)
    const image = await resolveDasImage(asset as Record<string, unknown>)

    if (classified === 'NFT') {
      return {
        kind: 'NFT',
        name,
        label: name,
        image,
        collectionSize: 0,
        traitIndex: traitIndexFromDasAsset(asset as Record<string, unknown>),
        splTokenProgram,
        isMplCore: mplCore,
        isCompressedNft,
        ...ext,
      }
    }

    return {
      kind: 'SPL',
      name,
      label: name ?? symbol,
      image,
      traitIndex: null,
      decimals,
      splTokenProgram,
      isMplCore: mplCore,
      isCompressedNft,
      ...ext,
    }
  } catch {
    return null
  }
}
