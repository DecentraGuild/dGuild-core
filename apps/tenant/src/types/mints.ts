export interface BaseMintMetadata {
  mint: string
  name?: string
  symbol?: string
  image?: string
  decimals?: number | null
  sellerFeeBasisPoints?: number | null
  updateAuthority?: string | null
  uri?: string | null
  primarySaleHappened?: boolean | null
  isMutable?: boolean | null
  editionNonce?: number | null
  tokenStandard?: string | null
}

export interface SplAssetMint extends BaseMintMetadata {
  _loading?: boolean
  _error?: string
}

export interface CollectionMint extends BaseMintMetadata {
  groupPath?: string[]
  collectionSize?: number
  uniqueTraitCount?: number
  traitTypes?: string[]
  _loading?: boolean
  _error?: string
}

export type MintKind = 'SPL' | 'NFT'

export interface AddressBookEntry {
  id: number
  mint: string
  kind: MintKind
  tier: 'base' | 'grow' | 'pro'
  label: string | null
  image: string | null
  name: string | null
  symbol?: string | null
  shipment_banner_image?: string | null
  /** NFT collection trait keys (e.g. for filtering or rule dropdowns). */
  trait_keys?: string[] | null
  /** NFT collection trait key -> list of values. */
  trait_options?: Record<string, string[]> | null
  createdAt?: string
}

export interface MintAssetPickerValue {
  spl: SplAssetMint[]
  nfts: CollectionMint[]
}

export interface TrackingByMint {
  [mint: string]: {
    trackHolder: boolean
    trackTransactions: boolean
  }
}

/** Discord guild mint catalog entry. */
export interface CatalogMint {
  id: number
  asset_id: string
  kind: 'SPL' | 'NFT'
  label: string
  symbol: string | null
  image: string | null
  decimals: number | null
  trait_keys: string[] | null
  trait_options: Record<string, string[]> | null
  /** Current holders track (short refresh rate for conditions, shipment, Discord). */
  track_holders?: boolean
  /** Snapshot track (daily holder snapshots). */
  track_snapshot?: boolean
  /** Transactions track (coming soon). */
  track_transactions?: boolean
}

/**
 * Normalised display item used by AdminMintCatalog and MintDetailModal.
 * Each consumer maps its own domain type (CatalogMint, CollectionMint, AddressBookEntry, etc.) to this shape.
 */
export interface CatalogMintItem {
  id: string | number
  mint: string
  kind: MintKind
  label: string
  symbol?: string | null
  image?: string | null
  shipment_banner_image?: string | null
  decimals?: number | null
  sellerFeeBasisPoints?: number | null
  updateAuthority?: string | null
  uri?: string | null
  primarySaleHappened?: boolean | null
  isMutable?: boolean | null
  editionNonce?: number | null
  tokenStandard?: string | null
  traitTypes?: string[] | null
  traitKeys?: string[] | null
  _loading?: boolean
  _error?: string
  /** Current holders track enabled. */
  track_holders?: boolean
  /** Snapshot track enabled. */
  track_snapshot?: boolean
  /** Transactions track enabled. */
  track_transactions?: boolean
}
