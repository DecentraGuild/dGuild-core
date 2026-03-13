/**
 * Data and state for the marketplace browse view: scope, assets, escrows, filters, grid.
 * Use in MarketBrowseView to keep the component thin.
 */
import type { Ref } from 'vue'
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useTenantStore } from '~/stores/tenant'
import { useRpc } from '~/composables/core/useRpc'
import { useMarketplaceScope } from '~/composables/marketplace/useMarketplaceScope'
import { useMarketplaceAssets } from '~/composables/marketplace/useMarketplaceAssets'
import { useCollectionMembers } from '~/composables/mint/useCollectionMembers'
import { useAuth } from '@decentraguild/auth'
import { useEscrowsForMints } from '~/composables/marketplace/useEscrowsForMints'
import { assetWithCounts } from '~/composables/mint/useAssetWithCounts'
import { useMarketBrowseFilters } from './useMarketBrowseFilters'
import { getMarketplaceAssetFromSettings, getMintInfoFromSettings } from '~/utils/mintFromSettings'
import type { TreeNode } from '~/composables/marketplace/useMarketplaceTree'
import type { MarketplaceAsset } from '~/composables/marketplace/useMarketplaceAssets'

const MARKET_GRID_SCALE_KEY = 'market-grid-scale'
const GRID_SCALE_MIN = 6
const GRID_SCALE_MAX = 20
const GRID_SCALE_STEPS = 5
const GRID_SCALE_STEP_SIZE = (GRID_SCALE_MAX - GRID_SCALE_MIN) / (GRID_SCALE_STEPS - 1)
const DEFAULT_GRID_SCALE_REM = 13

function snapToStep(n: number): number {
  const rounded = Math.round((n - GRID_SCALE_MIN) / GRID_SCALE_STEP_SIZE) * GRID_SCALE_STEP_SIZE + GRID_SCALE_MIN
  return Math.max(GRID_SCALE_MIN, Math.min(GRID_SCALE_MAX, rounded))
}

export interface UseMarketBrowseDataOptions {
  selectedNode: Ref<TreeNode | null>
  descendantAssetNodes: Ref<TreeNode[]>
}

export function useMarketBrowseData(options: UseMarketBrowseDataOptions) {
  const { selectedNode, descendantAssetNodes } = options
  const tenantStore = useTenantStore()
  const { slug, marketplaceSettings } = storeToRefs(tenantStore)
  const { rpcUrl, rpcError } = useRpc()

  const _collectionRef = computed(() => {
    const node = selectedNode.value
    if (!node || node.kind !== 'asset' || !node.mint) return null
    if (node.mint === node.collectionMint) return node.mint
    return null
  })

  const {
    entries,
    mintsSet: scopeMintsSet,
    mintsByCollection,
    loading: scopeLoading,
    error: scopeError,
    retry: scopeRetry,
  } = useMarketplaceScope()

  const scopeMints = computed(() => entries.value.map((e) => e.mint))

  const { assets, loading: assetsLoading, fetchPage: assetsFetchPage } = useMarketplaceAssets()

  const selectedCollectionMint = computed(() => {
    const node = selectedNode.value
    if (node?.kind === 'asset' && node.mint === node.collectionMint) return node.mint
    return null
  })
  const { assets: collectionMemberAssets, loading: collectionMemberLoading } = useCollectionMembers(selectedCollectionMint)

  const assetsMintsByCollection = computed(() => {
    const list = assets.value
    const map = new Map<string, string[]>()
    for (const a of list) {
      const key = a.collectionMint ?? a.mint
      const existing = map.get(key) ?? []
      if (!existing.includes(a.mint)) existing.push(a.mint)
      map.set(key, existing)
    }
    return map
  })

  onMounted(() => {
    assetsFetchPage(true)
  })

  const auth = useAuth()
  const walletRef = computed(() => auth.wallet.value ?? null)
  const { byMint, retry: escrowsRetry } = useEscrowsForMints(scopeMintsSet, rpcUrl, {
    wallet: walletRef,
  })

  onMounted(() => {
    escrowsRetry()
  })

  watch(scopeLoading, (loading, wasLoading) => {
    if (wasLoading && !loading) escrowsRetry()
  })

  const isCollectionSelected = computed(
    () =>
      selectedNode.value?.kind === 'asset' &&
      selectedNode.value?.mint &&
      selectedNode.value?.mint === selectedNode.value?.collectionMint
  )

  const descendantAssetMints = computed(() =>
    new Set(
      descendantAssetNodes.value
        .filter((n): n is TreeNode & { mint: string } => n.kind === 'asset' && Boolean(n.mint))
        .map((n) => n.mint)
    )
  )

  function withAssetType(a: MarketplaceAsset & { assetType?: string }): MarketplaceAsset & { assetType: string } {
    const t = a.assetType ?? (a.mint === a.collectionMint ? 'NFT_COLLECTION' : (a.collectionMint ? 'NFT' : 'SPL_ASSET'))
    return { ...a, assetType: t }
  }

  const assetCardsAll = computed(() => {
    const targetMints = descendantAssetMints.value
    const list = assets.value
    const selectedCollection = selectedCollectionMint.value
    if (isCollectionSelected.value && selectedCollection) {
      const members = collectionMemberAssets.value
      return members.map((m) => {
        const base = {
          mint: m.mint,
          source: 'collection' as const,
          collectionMint: selectedCollection,
          name: m.metadata?.name ?? null,
          symbol: null,
          image: m.metadata?.image ?? null,
          decimals: null,
          metadata: { traits: m.metadata?.traits ?? [] },
        }
        return withAssetType(base)
      })
    }
    if (targetMints.size === 0) return []
    const fromAssets = list.filter((a) => targetMints.has(a.mint)).map(withAssetType)
    const missing = [...targetMints].filter((m) => !list.some((a) => a.mint === m))
    if (missing.length === 0) return fromAssets
    const settings = marketplaceSettings.value
    if (!settings) return fromAssets
    const augmented = [...fromAssets]
    for (const mint of missing) {
      const fromSettings = getMarketplaceAssetFromSettings(mint, settings)
      if (fromSettings) augmented.push(fromSettings)
    }
    return augmented
  })

  const {
    browseSearchQuery,
    browseSelectedTraits,
    browseFiltersOpen,
    browseUniqueTraits,
    hasAnyTraits,
    browseActiveFilterCount,
    assetCardsFiltered,
    toggleBrowseTraitFilter,
    clearBrowseTraitFilters,
    resetFilters,
  } = useMarketBrowseFilters({ assetCardsAll })

  const gridScaleRem = ref(DEFAULT_GRID_SCALE_REM)
  onMounted(() => {
    try {
      const stored = localStorage.getItem(MARKET_GRID_SCALE_KEY)
      if (stored != null) {
        const n = parseFloat(stored)
        if (Number.isFinite(n) && n >= GRID_SCALE_MIN && n <= GRID_SCALE_MAX) gridScaleRem.value = snapToStep(n)
      }
    } catch {
      // ignore
    }
  })
  watch(gridScaleRem, (v) => {
    try {
      localStorage.setItem(MARKET_GRID_SCALE_KEY, String(v))
    } catch {
      // ignore
    }
  }, { immediate: false })

  const mintsByCollectionMerged = computed(() => {
    const s = mintsByCollection.value
    const a = assetsMintsByCollection.value
    const merged = new Map(s)
    if (a) {
      for (const [k, v] of a) {
        if (!merged.has(k)) merged.set(k, v)
      }
    }
    return merged
  })

  const assetCards = computed(() => {
    const merged = mintsByCollectionMerged.value
    const withCounts = assetCardsFiltered.value.map((a) => assetWithCounts(a, byMint.value, merged))
    return [...withCounts].sort((a, b) => {
      const aHasTrade = (a.offerCount ?? 0) + (a.requestCount ?? 0) > 0 ? 1 : 0
      const bHasTrade = (b.offerCount ?? 0) + (b.requestCount ?? 0) > 0 ? 1 : 0
      if (bHasTrade !== aHasTrade) return bHasTrade - aHasTrade
      const aName = (a.metadata?.name ?? a.mint).toLowerCase()
      const bName = (b.metadata?.name ?? b.mint).toLowerCase()
      return aName.localeCompare(bName)
    })
  })

  const emptyGridMessage = computed(() => {
    if (scopeMints.value.length === 0) return 'No assets in scope.'
    if (browseActiveFilterCount.value || browseSearchQuery.value) return 'No items match your filters.'
    return 'No items to display.'
  })

  watch(
    () => selectedNode.value?.id,
    () => { resetFilters() }
  )

  function getDisplayName(asset: {
    metadata?: { name?: string | null } | null
    name?: string | null
    collectionMint?: string | null
    mint?: string
  }): string | null {
    if (asset.metadata?.name) return asset.metadata.name
    if ((asset as { name?: string | null }).name) return (asset as { name: string }).name
    const mint = (asset as { collectionMint?: string | null }).collectionMint ?? (asset as { mint?: string }).mint
    if (mint) {
      const info = getMintInfoFromSettings(mint, marketplaceSettings.value)
      return info.name ?? info.symbol ?? null
    }
    return null
  }

  function getDisplaySymbol(asset: {
    metadata?: { symbol?: string | null } | null
    symbol?: string | null
    collectionMint?: string | null
    mint?: string
  }): string | null {
    if (asset.metadata?.symbol) return asset.metadata.symbol
    if ((asset as { symbol?: string | null }).symbol) return (asset as { symbol: string }).symbol
    const mint = asset.collectionMint ?? asset.mint
    if (mint) {
      const info = getMintInfoFromSettings(mint, marketplaceSettings.value)
      return info.symbol ?? info.name ?? null
    }
    return null
  }

  function getDisplayImage(asset: {
    metadata?: { image?: string | null } | null
    image?: string | null
    collectionMint?: string | null
    mint?: string
  }): string | null {
    if (asset.metadata?.image) return asset.metadata.image
    if ((asset as { image?: string | null }).image) return (asset as { image: string }).image
    const mint = asset.collectionMint ?? asset.mint
    if (!mint) return null
    const info = getMintInfoFromSettings(mint, marketplaceSettings.value)
    return info.image ?? null
  }

  const effectiveAssetsLoading = computed(() =>
    isCollectionSelected.value ? collectionMemberLoading.value : assetsLoading.value,
  )

  const detailAssets = computed(() => {
    if (isCollectionSelected.value) {
      const members = collectionMemberAssets.value
      return members.map((m) => ({
        mint: m.mint,
        source: 'collection' as const,
        collectionMint: selectedCollectionMint.value,
        name: m.metadata?.name ?? null,
        symbol: null,
        image: m.metadata?.image ?? null,
        metadata: m.metadata ?? undefined,
      }))
    }
    return assets.value
  })

  return {
    slug,
    marketplaceSettings,
    rpcUrl,
    rpcError,
    scopeLoading,
    scopeError,
    scopeRetry,
    scopeMints,
    assets,
    detailAssets,
    assetsLoading: effectiveAssetsLoading,
    byMint,
    mintsByCollectionMerged,
    isCollectionSelected,
    browseSearchQuery,
    browseSelectedTraits,
    browseFiltersOpen,
    browseUniqueTraits,
    hasAnyTraits,
    browseActiveFilterCount,
    assetCardsFiltered,
    toggleBrowseTraitFilter,
    clearBrowseTraitFilters,
    resetFilters,
    gridScaleRem,
    assetCards,
    emptyGridMessage,
    getDisplayName,
    getDisplaySymbol,
    getDisplayImage,
  }
}
