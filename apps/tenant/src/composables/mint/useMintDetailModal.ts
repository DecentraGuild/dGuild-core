import { formatRawTokenAmount, truncateAddress } from '@decentraguild/display'
import { invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useCollectionMembers } from '~/composables/mint/useCollectionMembers'
import { useExplorerLinks } from '~/composables/core/useExplorerLinks'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantCatalog } from '~/composables/watchtower/useTenantCatalog'
import type { CatalogMintItem, AddressBookEntry } from '~/types/mints'

const WATCHTOWER_HOLDERS_PAGE = 80

interface DisplayMint {
  mint: string; kind: string; label: string; symbol?: string | null; image?: string | null
  decimals?: number | null; sellerFeeBasisPoints?: number | null; updateAuthority?: string | null
  uri?: string | null; primarySaleHappened?: boolean | null; isMutable?: boolean | null
  editionNonce?: number | null; tokenStandard?: string | null; traitTypes?: string[]
  tier?: string; createdAt?: string; track_holders?: boolean; track_snapshot?: boolean
  track_transactions?: boolean; holders?: Array<{ wallet: string; amount: string }>
  holdersTotal?: number
  holdersUpdatedAt?: string | null
  snapshots?: { date: string; holderCount: number; snapshotAt?: string | null }[]
  memberNfts?: { mint: string; name: string | null; image: string | null; traits: Array<{ trait_type?: string; traitType?: string; value?: string | number }>; owner?: string | null }[]
}

interface FetchedDetail extends DisplayMint {
  memberNfts?: { mint: string; name: string | null; image: string | null; traits: Array<{ trait_type?: string; traitType?: string; value?: string | number }>; owner?: string | null }[]
}

export function useMintDetailModal(
  props: {
    modelValue: Ref<boolean>
    mint: Ref<CatalogMintItem | string | null | undefined>
    entry: Ref<AddressBookEntry | null | undefined>
    tenantId: Ref<string | undefined>
  },
  emit: (event: 'update:modelValue' | 'saved', ...args: unknown[]) => void,
) {
  const tenantStore = useTenantStore()
  const explorerLinks = useExplorerLinks()
  const catalog = useTenantCatalog()

  const isWatchtower = computed(() => typeof props.mint.value === 'string' && !!props.tenantId.value)
  const isCatalog = computed(() => !isWatchtower.value)

  const mintAddress = computed(() => {
    if (typeof props.mint.value === 'string') return props.mint.value
    return props.mint.value?.mint ?? null
  })

  const loading = ref(false)
  const fetchedDetail = ref<FetchedDetail | null>(null)
  const error = ref<string | null>(null)
  const showJson = ref(false)
  const copied = ref(false)
  const expandedSnapshot = ref<string | null>(null)
  const memberNftView = ref<'list' | 'card'>('list')
  const copiedMint = ref<string | null>(null)
  const copiedWallet = ref<string | null>(null)
  const catalogSnapshots = ref<{ date: string; holderCount: number; holderWallets?: string[]; snapshotAt?: string }[]>([])
  const snapshotsLoading = ref(false)
  const selectedSnapshotDate = ref<string | null>(null)
  const holdersFromSupabase = ref<Array<{ wallet: string; amount: string }>>([])
  const walletsLoading = ref(false)
  const holdersLoadingMore = ref(false)
  const watchtowerSnapshotHolders = ref<Array<{ wallet: string; amount: string }>>([])
  const shipmentBannerImage = ref('')
  const shipmentBannerSaving = ref(false)

  const display = computed<DisplayMint | null>(() => {
    if (isWatchtower.value) return fetchedDetail.value
    const m = props.mint.value as CatalogMintItem | null | undefined
    if (!m || typeof m === 'string') return null
    return {
      mint: m.mint, kind: m.kind, label: m.label ?? m.mint, symbol: m.symbol ?? null,
      image: m.image ?? null, decimals: m.decimals ?? null, sellerFeeBasisPoints: m.sellerFeeBasisPoints ?? null,
      updateAuthority: m.updateAuthority ?? null, uri: m.uri ?? null,
      primarySaleHappened: m.primarySaleHappened ?? null, isMutable: m.isMutable ?? null,
      editionNonce: m.editionNonce ?? null, tokenStandard: m.tokenStandard ?? null,
      traitTypes: m.traitTypes ?? (m as { traitKeys?: string[] }).traitKeys ?? [],
      tier: props.entry.value?.tier, createdAt: props.entry.value?.createdAt,
      track_holders: m.track_holders ?? false, track_snapshot: m.track_snapshot ?? false,
      track_transactions: m.track_transactions ?? false,
    }
  })

  function toHoldersWithAmount(raw: unknown): Array<{ wallet: string; amount: string }> {
    if (!Array.isArray(raw)) return []
    return raw
      .map((h) => {
        if (typeof h === 'string') return { wallet: h, amount: '1' }
        const o = h as { wallet?: string; amount?: string }
        return { wallet: o.wallet ?? '', amount: o.amount ?? '1' }
      })
      .filter((h) => h.wallet)
      .sort((a, b) => { const na = BigInt(a.amount), nb = BigInt(b.amount); return nb > na ? 1 : nb < na ? -1 : 0 })
  }

  const displayHolders = computed(() => toHoldersWithAmount(display.value?.holders))

  const nftMintForCollection = computed(() =>
    props.modelValue.value && isCatalog.value && display.value?.kind === 'NFT' ? display.value.mint : null
  )
  const { assets, loading: assetsLoading } = useCollectionMembers(nftMintForCollection)

  const memberNfts = computed(() => {
    if (isWatchtower.value && fetchedDetail.value?.memberNfts?.length) {
      return fetchedDetail.value.memberNfts.map((n) => ({
        mint: n.mint, name: n.name, image: n.image, traits: n.traits ?? [],
        owner: (n as { owner?: string | null }).owner ?? null,
      }))
    }
    if (isCatalog.value && assets.value?.length) {
      return assets.value.map((a) => ({
        mint: a.mint, name: a.metadata?.name ?? null, image: a.metadata?.image ?? null,
        traits: (a.metadata?.traits ?? []).map((t) => ({ trait_type: t.trait_type, traitType: t.trait_type, value: t.value })),
        owner: a.metadata?.owner ?? null,
      }))
    }
    return []
  })

  const combinedHolders = computed(() => {
    const d = display.value
    if (!d) return []
    if (d.kind === 'SPL') {
      const holders = displayHolders.value
      if (!holders.length) return []
      return holders.map((h) => ({
        wallet: h.wallet,
        count: 0,
        nfts: [],
        splAmount: h.amount,
      }))
    }
    if (d.kind !== 'NFT') return []
    const holders = displayHolders.value
    const nfts = memberNfts.value
    const byWallet = new Map<string, { count: number; nfts: typeof nfts }>()
    for (const h of holders) byWallet.set(h.wallet, { count: Number(h.amount) || 0, nfts: [] })
    for (const nft of nfts) {
      const owner = nft.owner
      if (!owner) continue
      if (!byWallet.has(owner)) byWallet.set(owner, { count: 0, nfts: [] })
      const entry = byWallet.get(owner)!
      entry.nfts.push(nft)
    }
    for (const entry of byWallet.values()) {
      if (entry.count === 0 && entry.nfts.length > 0) entry.count = entry.nfts.length
    }
    return [...byWallet.entries()]
      .filter(([, e]) => e.count > 0 || e.nfts.length > 0)
      .map(([wallet, entry]) => ({ wallet, count: entry.count, nfts: entry.nfts }))
      .sort((a, b) => b.count - a.count)
  })

  const showHoldersAndNftsSection = computed(() => {
    const d = display.value
    if (!d) return false
    if (d.kind === 'SPL') {
      const total = typeof d.holdersTotal === 'number' ? d.holdersTotal : displayHolders.value.length
      return !!(d.track_holders && total > 0)
    }
    if (d.kind === 'NFT') {
      return memberNfts.value.length > 0 || !!(d.track_holders && displayHolders.value.length > 0)
    }
    return false
  })

  const mintExplorerUrl = computed(() => {
    const m = mintAddress.value ?? display.value?.mint
    if (!m) return '#'
    return explorerLinks.tokenUrl(m)
  })

  const memberNftsLoading = computed(() => (isCatalog.value ? assetsLoading.value : false))
  const nftLink = computed(() => isWatchtower.value)

  const showSnapshotsSection = computed(() => {
    if (isWatchtower.value) return display.value?.track_snapshot ?? false
    return !!props.entry.value && props.entry.value.tier !== 'base'
  })

  const expandedSnapshotDate = computed(() => (isWatchtower.value ? expandedSnapshot.value : selectedSnapshotDate.value))

  const snapshotsForDisplay = computed(() => {
    if (isWatchtower.value) return display.value?.snapshots ?? []
    return catalogSnapshots.value
  })

  const holdersForSnapshot = computed(() => {
    if (isWatchtower.value) return watchtowerSnapshotHolders.value
    return selectedSnapshotDate.value ? holdersFromSupabase.value : []
  })

  async function loadWatchtowerSnapshotWallets(snapshotAt: string) {
    const m = mintAddress.value
    if (!m) return
    walletsLoading.value = true
    watchtowerSnapshotHolders.value = []
    try {
      const supabase = useSupabase()
      const { data, error: err } = await supabase
        .from('holder_snapshots')
        .select('holder_wallets')
        .eq('mint', m)
        .eq('snapshot_at', snapshotAt)
        .maybeSingle()
      if (!err && data) {
        watchtowerSnapshotHolders.value = toHoldersWithAmount(
          (data as { holder_wallets?: unknown }).holder_wallets,
        )
      }
    } finally {
      walletsLoading.value = false
    }
  }

  const jsonPreview = computed(() => {
    const m = props.mint.value as CatalogMintItem | null | undefined
    if (!m || typeof m === 'string') return ''
    const data: Record<string, unknown> = { mint: m.mint, kind: m.kind, label: m.label }
    if (m.symbol != null) data.symbol = m.symbol
    if (m.image != null) data.image = m.image
    if (m.decimals != null) data.decimals = m.decimals
    if (m.sellerFeeBasisPoints != null) data.sellerFeeBasisPoints = m.sellerFeeBasisPoints
    if (m.updateAuthority != null) data.updateAuthority = m.updateAuthority
    if (m.uri != null) data.uri = m.uri
    if (m.primarySaleHappened != null) data.primarySaleHappened = m.primarySaleHappened
    if (m.isMutable != null) data.isMutable = m.isMutable
    if (m.editionNonce != null) data.editionNonce = m.editionNonce
    if (m.tokenStandard != null) data.tokenStandard = m.tokenStandard
    if ((m.traitTypes as string[] | undefined)?.length) data.traitTypes = m.traitTypes
    if (props.entry.value) {
      data.tier = props.entry.value.tier
      if (props.entry.value.trait_options) data.traitOptions = props.entry.value.trait_options
      if (props.entry.value.createdAt) data.createdAt = props.entry.value.createdAt
    }
    return JSON.stringify(data, null, 2)
  })

  function close() { emit('update:modelValue', false) }

  function copyMint() {
    const m = display.value?.mint ?? mintAddress.value
    if (!m) return
    navigator.clipboard.writeText(m).then(() => {
      copied.value = true
      setTimeout(() => { copied.value = false }, 2000)
    })
  }

  function copyToClipboard(text: string, mint: string, field: 'owner' | 'mint', wallet?: string) {
    navigator.clipboard.writeText(text).then(() => {
      copiedMint.value = mint
      copiedWallet.value = wallet ?? null
      setTimeout(() => { copiedMint.value = null; copiedWallet.value = null }, 2000)
    })
  }

  function onHoldersCopy(text: string, field: 'owner' | 'mint', wallet?: string) {
    copyToClipboard(text, field === 'mint' ? text : (display.value?.mint ?? ''), field, wallet)
  }

  function formatHolderAmount(amountStr: string): string {
    const kind = display.value?.kind === 'NFT' ? 'NFT' : 'SPL'
    const decimals = kind === 'NFT' ? 0 : (display.value?.decimals ?? null)
    return formatRawTokenAmount(amountStr, decimals, kind)
  }

  function parseWatchtowerHoldersFromRaw(raw: unknown): Array<{ wallet: string; amount: string }> {
    if (!Array.isArray(raw)) return []
    return raw
      .map((h) =>
        typeof h === 'string' ? { wallet: h, amount: '1' } : { wallet: (h as { wallet?: string }).wallet ?? '', amount: (h as { amount?: string }).amount ?? '1' },
      )
      .filter((h) => h.wallet)
  }

  async function fetchWatchtowerDetail(appendHolders = false) {
    const mint = props.mint.value
    const tenantId = props.tenantId.value
    if (!mint || typeof mint !== 'string' || !tenantId) { fetchedDetail.value = null; return }
    if (!appendHolders) {
      loading.value = true
      fetchedDetail.value = null
      expandedSnapshot.value = null
      watchtowerSnapshotHolders.value = []
    } else {
      holdersLoadingMore.value = true
    }
    error.value = null
    try {
      const supabase = useSupabase()
      const offset = appendHolders && fetchedDetail.value?.holders?.length
        ? fetchedDetail.value.holders.length
        : 0
      const data = await invokeEdgeFunction<Record<string, unknown>>(supabase, 'watchtower', {
        action: 'mint-detail',
        tenantId,
        mint,
        holdersOffset: offset,
        holdersLimit: WATCHTOWER_HOLDERS_PAGE,
      }, { errorFallback: 'Request failed' })
      const raw = (data ?? {}) as Record<string, unknown>
      const pageHolders = parseWatchtowerHoldersFromRaw(raw.holders)
      const holdersTotalParsed = typeof raw.holdersTotal === 'number' ? raw.holdersTotal : pageHolders.length
      const snapshots = Array.isArray(raw.snapshots)
        ? (raw.snapshots as Record<string, unknown>[]).map((s) => ({
            date: (s.date as string) ?? '',
            holderCount: Number(s.holderCount) || 0,
            snapshotAt: (s.snapshotAt as string) ?? null,
          }))
        : []
      const memberNftsRaw = Array.isArray(raw.memberNfts)
        ? (raw.memberNfts as Record<string, unknown>[]).map((m) => ({
            mint: (m.mint as string) ?? '',
            name: (m.name as string) ?? null,
            image: (m.image as string) ?? null,
            traits: (Array.isArray(m.traits) ? m.traits : []) as Array<{ trait_type?: string; traitType?: string; value?: string | number }>,
            owner: (m.owner as string) ?? null,
          }))
        : []
      const kindParsed = (raw.kind as string) ?? 'SPL'
      const mergedHolders = appendHolders && fetchedDetail.value?.holders?.length
        ? [...fetchedDetail.value.holders, ...pageHolders]
        : pageHolders

      fetchedDetail.value = {
        mint: (raw.mint as string) ?? mint ?? '',
        kind: kindParsed,
        label: (raw.label as string) ?? (raw.name as string) ?? mint ?? '',
        name: (raw.name as string) ?? null,
        image: (raw.image as string) ?? null,
        symbol: (raw.symbol as string) ?? null,
        decimals: (raw.decimals as number) ?? null,
        sellerFeeBasisPoints: (raw.sellerFeeBasisPoints as number) ?? null,
        updateAuthority: (raw.updateAuthority as string) ?? null,
        uri: (raw.uri as string) ?? null,
        primarySaleHappened: typeof raw.primarySaleHappened === 'boolean' ? raw.primarySaleHappened : null,
        isMutable: typeof raw.isMutable === 'boolean' ? raw.isMutable : null,
        editionNonce: typeof raw.editionNonce === 'number' ? raw.editionNonce : null,
        tokenStandard: (raw.tokenStandard as string) ?? null,
        traitTypes: Array.isArray(raw.traitTypes) ? (raw.traitTypes as string[]) : [],
        track_holders: Boolean(raw.track_holders),
        track_snapshot: Boolean(raw.track_snapshot),
        track_transactions: Boolean(raw.track_transactions),
        holders: mergedHolders,
        ...(kindParsed === 'SPL' ? { holdersTotal: holdersTotalParsed } : {}),
        holdersUpdatedAt: (raw.holdersUpdatedAt as string) ?? null,
        snapshots,
        memberNfts: memberNftsRaw,
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load'
    } finally {
      loading.value = false
      holdersLoadingMore.value = false
    }
  }

  function loadMoreWatchtowerHolders() {
    if (!isWatchtower.value || fetchedDetail.value?.kind !== 'SPL') return
    const d = fetchedDetail.value
    const cap = typeof d.holdersTotal === 'number' ? d.holdersTotal : d.holders.length
    if (d.holders.length >= cap) return
    void fetchWatchtowerDetail(true)
  }

  async function fetchCatalogSnapshots() {
    const m = props.mint.value as CatalogMintItem | null | undefined
    if (!props.entry.value || !m || typeof m === 'string' || props.entry.value.tier === 'base') return
    const tenantId = tenantStore.tenantId
    if (!tenantId) return
    snapshotsLoading.value = true; catalogSnapshots.value = []; selectedSnapshotDate.value = null; holdersFromSupabase.value = []
    try {
      const supabase = useSupabase()
      const { data, err } = await supabase.from('holder_snapshots').select('snapshot_date, snapshot_at, holder_wallets').eq('mint', m.mint).order('snapshot_at', { ascending: false }).limit(100)
      if (!err && data) {
        catalogSnapshots.value = data.map((r) => {
          const snapshotAt = r.snapshot_at as string
          const date = snapshotAt ? new Date(snapshotAt).toISOString().slice(0, 16).replace('T', ' ') : (r.snapshot_date as string)
          return { date, holderCount: Array.isArray(r.holder_wallets) ? (r.holder_wallets as unknown[]).length : 0, snapshotAt }
        }).slice(0, 30)
      }
    } catch { catalogSnapshots.value = [] }
    finally { snapshotsLoading.value = false }
  }

  async function selectCatalogSnapshot(snapshotAt: string) {
    const m = props.mint.value as CatalogMintItem | null | undefined
    if (!m || typeof m === 'string') return
    walletsLoading.value = true
    try {
      const supabase = useSupabase()
      const { data, err } = await supabase.from('holder_snapshots').select('holder_wallets').eq('mint', m.mint).eq('snapshot_at', snapshotAt).maybeSingle()
      if (!err && data) {
        const hw = (data as { holder_wallets?: unknown }).holder_wallets
        const arr = Array.isArray(hw) ? hw : []
        holdersFromSupabase.value = arr.map((h) =>
          typeof h === 'string' ? { wallet: h, amount: '1' } : { wallet: (h as { wallet?: string }).wallet ?? '', amount: (h as { amount?: string }).amount ?? '1' }
        ).filter((x) => x.wallet)
      } else { holdersFromSupabase.value = [] }
    } catch { holdersFromSupabase.value = [] }
    finally { walletsLoading.value = false }
  }

  async function saveShipmentBanner() {
    const m = mintAddress.value ?? display.value?.mint
    if (!m) return
    shipmentBannerSaving.value = true
    try { await catalog.updateShipmentDisplay(m, { image: shipmentBannerImage.value || null }); emit('saved') }
    finally { shipmentBannerSaving.value = false }
  }

  function toggleSnapshot(date: string, snapshotAtForQuery?: string) {
    if (isWatchtower.value) {
      const closing = expandedSnapshot.value === date
      expandedSnapshot.value = closing ? null : date
      if (closing) {
        watchtowerSnapshotHolders.value = []
      } else if (snapshotAtForQuery) {
        void loadWatchtowerSnapshotWallets(snapshotAtForQuery)
      }
    } else {
      if (selectedSnapshotDate.value === date) {
        selectedSnapshotDate.value = null; holdersFromSupabase.value = []
      } else {
        selectedSnapshotDate.value = date
        selectCatalogSnapshot(snapshotAtForQuery ?? date.replace(' ', 'T'))
      }
    }
  }

  watch(
    () => [props.modelValue.value, props.mint.value, props.entry.value],
    () => {
      if (props.modelValue.value && isCatalog.value) {
        const m = props.mint.value as CatalogMintItem | null | undefined
        const e = props.entry.value
        shipmentBannerImage.value = (m as { shipment_banner_image?: string | null })?.shipment_banner_image ?? e?.shipment_banner_image ?? ''
      }
      if (props.modelValue.value) {
        if (isWatchtower.value && props.mint.value && typeof props.mint.value === 'string' && props.tenantId.value) {
          fetchWatchtowerDetail()
        } else if (isCatalog.value) {
          showJson.value = false; fetchCatalogSnapshots()
        }
      } else {
        fetchedDetail.value = null; error.value = null; expandedSnapshot.value = null
        catalogSnapshots.value = []; selectedSnapshotDate.value = null; holdersFromSupabase.value = []
        watchtowerSnapshotHolders.value = []
      }
    },
    { immediate: true },
  )

  watch(
    () => (props.mint.value as CatalogMintItem)?.mint,
    () => { if (props.modelValue.value && isCatalog.value) fetchCatalogSnapshots() },
  )

  const holdersSectionSplMode = computed(() => display.value?.kind === 'SPL')

  const watchtowerHoldersTotal = computed(() => {
    const d = display.value
    if (!d || d.kind !== 'SPL') return undefined
    return typeof d.holdersTotal === 'number' ? d.holdersTotal : d.holders?.length
  })

  return {
    display, loading, error, isWatchtower, isCatalog, mintAddress, mintExplorerUrl,
    showJson, copied, expandedSnapshotDate, memberNftView, copiedMint, copiedWallet,
    combinedHolders, showHoldersAndNftsSection, holdersSectionSplMode, memberNftsLoading, nftLink,
    snapshotsForDisplay, snapshotsLoading, holdersForSnapshot, walletsLoading, showSnapshotsSection,
    holdersLoadingMore, watchtowerHoldersTotal, loadMoreWatchtowerHolders,
    shipmentBannerImage, shipmentBannerSaving, jsonPreview,
    close, copyMint, copyToClipboard, onHoldersCopy, formatHolderAmount, toggleSnapshot, saveShipmentBanner,
    explorerLinks, truncateAddress,
  }
}
