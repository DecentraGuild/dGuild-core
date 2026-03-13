/**
 * Detail panel state: resolve detail asset from mint, traits, filtered trades, and actions.
 * Used by MarketBrowseView; detailMint is controlled by parent (prop).
 */
import type { Ref } from 'vue'
import { computed } from 'vue'
import type { MarketplaceSettings } from '@decentraguild/core'
import { normaliseAttributes } from '~/utils/nftFilterHelpers'
import { getMarketplaceAssetFromSettings } from '~/utils/mintFromSettings'
import type { MarketplaceAsset } from '~/composables/marketplace/useMarketplaceAssets'
import { useExplorerLinks } from '~/composables/core/useExplorerLinks'

/** Minimal escrow shape for eligibility check. */
interface EscrowForEligibility {
  account: {
    onlyRecipient: boolean
    onlyWhitelist: boolean
    recipient: { toBase58: () => string }
  }
}

export interface UseMarketBrowseDetailOptions {
  detailMint: Ref<string | null>
  assets: Ref<MarketplaceAsset[]>
  marketplaceSettings: Ref<MarketplaceSettings | null>
  /** Map of mint -> { offerTrades, requestTrades } from useEscrowsForMints. */
  byMint: Ref<Map<string, { offerTrades: unknown[]; requestTrades: unknown[] }>>
  /** Map of collection_mint -> member mints (for aggregating trades when viewing a collection). */
  mintsByCollection: Ref<Map<string, string[]>>
  walletAddress: Ref<string | null>
}

const SYSTEM_PROGRAM = '11111111111111111111111111111111'

function isEscrowEligibleToFill(e: EscrowForEligibility, wallet: string | null): boolean {
  if (e.account.onlyWhitelist) return false
  if (!e.account.onlyRecipient) return true
  const rec = e.account.recipient.toBase58()
  if (rec === SYSTEM_PROGRAM) return true
  return wallet !== null && rec === wallet
}

export function useMarketBrowseDetail(options: UseMarketBrowseDetailOptions) {
  const { detailMint, assets, marketplaceSettings, byMint, mintsByCollection, walletAddress } = options
  const { tokenUrl } = useExplorerLinks()

  const detailAsset = computed(() => {
    if (!detailMint.value) return null
    const fromApi = assets.value.find((a) => a.mint === detailMint.value)
    if (fromApi) {
      const meta = (fromApi as { metadata?: { name?: string; image?: string; traits?: unknown } }).metadata
      const decimals = (fromApi as { decimals?: number | null }).decimals ?? (meta as { decimals?: number })?.decimals ?? null
      return {
        ...fromApi,
        metadata: {
          name: meta?.name ?? fromApi.name ?? null,
          symbol: fromApi.symbol ?? null,
          image: meta?.image ?? fromApi.image ?? null,
          traits: meta?.traits ?? undefined,
        },
        decimals,
      }
    }
    const fromSettings = getMarketplaceAssetFromSettings(detailMint.value, marketplaceSettings.value)
    if (fromSettings) {
      const m = fromSettings as { metadata?: { name?: string; symbol?: string; image?: string; decimals?: number | null } }
      return {
        ...fromSettings,
        metadata: {
          name: m.metadata?.name ?? null,
          symbol: m.metadata?.symbol ?? null,
          image: m.metadata?.image ?? null,
          traits: undefined,
        },
        decimals: m.metadata?.decimals ?? null,
      }
    }
    return null
  })

  const detailTraits = computed(() => {
    const asset = detailAsset.value
    if (!asset?.metadata?.traits) return []
    return normaliseAttributes(asset.metadata.traits)
  })

  const detailTrades = computed(() => {
    const m = detailMint.value
    if (!m) return { offerTrades: [], requestTrades: [] }
    const direct = byMint.value.get(m) ?? { offerTrades: [], requestTrades: [] }
    const memberMints = mintsByCollection.value.get(m)
    if (!memberMints?.length) return direct
    const seen = new Set<string>()
    const dedupe = <T extends { publicKey: { toBase58: () => string } }>(list: T[]) =>
      list.filter((e) => {
        const id = e.publicKey.toBase58()
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
    const offerTrades: unknown[] = [...direct.offerTrades]
    const requestTrades: unknown[] = [...direct.requestTrades]
    for (const member of memberMints) {
      const entry = byMint.value.get(member)
      if (entry) {
        offerTrades.push(...entry.offerTrades)
        requestTrades.push(...entry.requestTrades)
      }
    }
    return {
      offerTrades: dedupe(offerTrades as { publicKey: { toBase58: () => string } }[]),
      requestTrades: dedupe(requestTrades as { publicKey: { toBase58: () => string } }[]),
    }
  })

  const detailTradesFiltered = computed(() => {
    const raw = detailTrades.value
    const wallet = walletAddress.value
    const filter = (list: unknown[]) =>
      (list as EscrowForEligibility[]).filter((e) => isEscrowEligibleToFill(e, wallet))
    return {
      offerTrades: filter(raw.offerTrades),
      requestTrades: filter(raw.requestTrades),
    }
  })

  const solscanTokenUrl = computed(() =>
    detailMint.value ? tokenUrl(detailMint.value) : '#'
  )

  function copyDetailMint() {
    if (!detailMint.value) return
    void navigator.clipboard.writeText(detailMint.value)
  }

  return {
    detailAsset,
    detailTraits,
    detailTradesFiltered,
    solscanTokenUrl,
    copyDetailMint,
  }
}
