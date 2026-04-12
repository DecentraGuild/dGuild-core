/**
 * Single source of truth for resolving a mint address from marketplace settings.
 * Used by tree labels, escrow decimals, detail panel, and browse grid augmentation.
 * Base currencies (SOL, WBTC, USDC, USDT) get name, symbol, decimals from core when missing in settings.
 */
import { truncateAddress } from '@decentraguild/display'
import {
  BASE_CURRENCY_MINTS,
  getBaseCurrencyDecimals,
  isBaseCurrencyMint,
  type MarketplaceSettings,
} from '@decentraguild/core'
import type { MarketplaceAsset } from '~/composables/marketplace/useMarketplaceAssets'

export interface MintInfoFromSettings {
  name: string | null
  symbol: string | null
  decimals: number
  image: string | null
  source: 'collection' | 'currency' | 'spl' | null
}

const _FALLBACK_LABEL_LEN = 8

/**
 * Resolve name, symbol, decimals, and image for a mint from tenant marketplace settings.
 */
export function getMintInfoFromSettings(
  mint: string,
  settings: MarketplaceSettings | null
): MintInfoFromSettings {
  const empty: MintInfoFromSettings = {
    name: null,
    symbol: null,
    decimals: 0,
    image: null,
    source: null,
  }
  if (!settings) return empty

  const coll = settings.collectionMints?.find((c) => c.mint === mint)
  if (coll) {
    return {
      name: coll.name ?? null,
      symbol: null,
      decimals: 0,
      image: coll.image ?? null,
      source: 'collection',
    }
  }

  const curr = settings.currencyMints?.find((c) => c.mint === mint)
  if (curr) {
    const base = isBaseCurrencyMint(mint) ? BASE_CURRENCY_MINTS.find((b) => b.mint === mint) : null
    return {
      name: curr.name ?? base?.name ?? null,
      symbol: curr.symbol ?? base?.symbol ?? null,
      decimals: curr.decimals ?? (base ? (getBaseCurrencyDecimals(mint) ?? 6) : 0),
      image: curr.image ?? null,
      source: 'currency',
    }
  }
  if (isBaseCurrencyMint(mint)) {
    const base = BASE_CURRENCY_MINTS.find((b) => b.mint === mint)
    if (base) {
      return {
        name: base.name,
        symbol: base.symbol,
        decimals: getBaseCurrencyDecimals(mint) ?? 6,
        image: null,
        source: 'currency',
      }
    }
  }

  const spl = settings.splAssetMints?.find((s) => s.mint === mint)
  if (spl) {
    return {
      name: spl.name ?? null,
      symbol: spl.symbol ?? null,
      decimals: spl.decimals ?? 0,
      image: spl.image ?? null,
      source: 'spl',
    }
  }

  return empty
}

/**
 * Display label for a mint (name or symbol or truncated address).
 */
export function getMintDisplayLabel(
  mint: string,
  settings: MarketplaceSettings | null
): string {
  const info = getMintInfoFromSettings(mint, settings)
  const label = info.name ?? info.symbol ?? null
  return label ?? truncateAddress(mint, 8, 4)
}

/**
 * Build a MarketplaceAsset from settings when the mint is not in the API assets list.
 * Returns null if the mint is not in settings (or not a base currency).
 * Base currencies get name, symbol, decimals from core when missing in settings.
 */
export function getMarketplaceAssetFromSettings(
  mint: string,
  settings: MarketplaceSettings | null
): MarketplaceAsset | null {
  const base = isBaseCurrencyMint(mint) ? BASE_CURRENCY_MINTS.find((b) => b.mint === mint) : null
  if (settings) {
    const curr = settings.currencyMints?.find((c) => c.mint === mint)
    if (curr) {
      return {
        assetType: 'CURRENCY',
        mint: curr.mint,
        collectionMint: null,
        metadata: {
          name: curr.name ?? base?.name ?? null,
          symbol: curr.symbol ?? base?.symbol ?? null,
          image: curr.image ?? null,
          decimals: curr.decimals ?? (base ? (getBaseCurrencyDecimals(mint) ?? 6) : undefined) ?? null,
        },
      }
    }
  }
  if (base) {
    return {
      assetType: 'CURRENCY',
      mint: base.mint,
      collectionMint: null,
      metadata: {
        name: base.name,
        symbol: base.symbol,
        image: null,
        decimals: getBaseCurrencyDecimals(mint) ?? 6,
      },
    }
  }
  if (!settings) return null

  const spl = settings.splAssetMints?.find((s) => s.mint === mint)
  if (spl) {
    return {
      assetType: 'SPL_ASSET',
      mint: spl.mint,
      collectionMint: null,
      metadata: {
        name: spl.name ?? null,
        symbol: spl.symbol ?? null,
        image: null,
        decimals: spl.decimals ?? null,
      },
    }
  }

  const coll = settings.collectionMints?.find((c) => c.mint === mint)
  if (coll) {
    return {
      assetType: 'NFT_COLLECTION',
      mint: coll.mint,
      collectionMint: coll.mint,
      metadata: {
        name: coll.name ?? null,
        symbol: null,
        image: coll.image ?? null,
        decimals: null,
      },
    }
  }

  return null
}
