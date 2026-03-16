<template>
  <Dialog :open="modelValue" @update:open="(v: boolean) => emit('update:modelValue', v)">
    <DialogContent
      :class="['mint-modal__panel p-0 gap-0 max-h-[90vh]', display?.kind === 'NFT' ? 'mint-modal__panel--wide' : '']"
      :show-close-button="false"
    >
      <VisuallyHidden>
        <DialogTitle>Mint details</DialogTitle>
        <DialogDescription>Mint metadata, holders, and snapshots</DialogDescription>
      </VisuallyHidden>
      <div v-if="isWatchtower && loading" class="mint-modal__loading">
        <Icon icon="lucide:loader-2" class="mint-modal__spinner" />
        Loading...
      </div>

      <template v-else-if="isWatchtower && error">
        <div class="mint-modal__header">
          <div class="mint-modal__header-text">
            <h3 id="mint-modal-title" class="mint-modal__title">{{ mintAddress ? truncateAddress(mintAddress, 8, 6) : 'Error' }}</h3>
          </div>
          <button type="button" class="mint-modal__close" aria-label="Close" @click="close">
            <Icon icon="lucide:x" />
          </button>
        </div>
        <div class="mint-modal__body">
          <p class="mint-modal__error">{{ error }}</p>
          <p v-if="mintAddress" class="mint-modal__muted">
            <a :href="mintExplorerUrl" target="_blank" rel="noopener" class="mint-modal__link">View on Solscan</a>
          </p>
        </div>
      </template>

      <template v-else-if="display">
        <MintDetailModalHeader
          :display="display"
          :mint-explorer-url="mintExplorerUrl"
          :show-json-toggle="isCatalog"
          :show-json="showJson"
          :copied="copied"
          @toggle-json="showJson = !showJson"
          @copy-mint="copyMint"
          @close="close"
        />

        <div class="mint-modal__body">
          <section v-if="isCatalog && showJson" class="mint-modal__section">
            <pre class="mint-modal__json">{{ jsonPreview }}</pre>
          </section>

          <template v-else>
            <MintDetailModalMetadata
              :display="display"
              :mint-explorer-url="mintExplorerUrl"
              :is-watchtower="isWatchtower"
              :copied="copied"
              @copy-mint="copyMint"
            />
            <MintDetailModalTraitTypes v-if="display.kind === 'NFT'" :display="display" />
            <MintDetailModalHoldersNfts
              v-if="showHoldersAndNftsSection"
              v-model="memberNftView"
              :combined-holders="combinedHolders"
              :holders-updated-at="display.track_holders ? display.holdersUpdatedAt : null"
              :loading="memberNftsLoading"
              :nft-link="nftLink"
              :copied-wallet="copiedWallet"
              :copied-mint="copiedMint"
              :account-url="(addr) => explorerLinks.accountUrl(addr)"
              :token-url="(m) => explorerLinks.tokenUrl(m)"
              @copy="onHoldersCopy"
            />
            <MintDetailModalSnapshots
              v-if="showSnapshotsSection"
              :snapshots="snapshotsForDisplay"
              :loading="snapshotsLoading"
              :expanded-date="expandedSnapshotDate"
              :holders="holdersForSnapshot"
              :wallets-loading="walletsLoading"
              :copied-wallet="copiedWallet"
              :format-holder-amount="formatHolderAmount"
              :account-url="(addr) => explorerLinks.accountUrl(addr)"
              @toggle="toggleSnapshot"
              @copy-wallet="(w) => copyToClipboard(w, display!.mint, 'owner', w)"
            />
            <section v-if="display.track_transactions" class="mint-modal__section mint-modal__section--bordered">
              <h4 class="mint-modal__section-title">Transactions</h4>
              <p class="mint-modal__muted">Coming soon.</p>
            </section>
            <section v-if="display.tier === 'pro' && isCatalog" class="mint-modal__section mint-modal__section--bordered">
              <h4 class="mint-modal__section-title">Transaction data</h4>
              <p class="mint-modal__muted">Live transaction tracking (Pro) coming soon.</p>
            </section>
            <section v-if="isCatalog" class="mint-modal__section mint-modal__section--bordered">
              <h4 class="mint-modal__section-title">Shipment banner</h4>
              <p class="mint-modal__muted">Optional image URL for the Shipments page card background. Shown when members view their shipments.</p>
              <div class="mint-modal__shipment-banner-row">
                <input
                  v-model="shipmentBannerImage"
                  type="url"
                  class="mint-modal__input"
                  placeholder="https://..."
                />
                <Button
                  variant="secondary"
                  size="sm"
                  :disabled="shipmentBannerSaving"
                  @click="saveShipmentBanner"
                >
                  <Icon v-if="shipmentBannerSaving" icon="lucide:loader-2" class="mint-modal__spinner" />
                  Save
                </Button>
              </div>
            </section>
          </template>
        </div>
      </template>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { formatRawTokenAmount, truncateAddress } from '@decentraguild/display'
import { Icon } from '@iconify/vue'
import { useCollectionMembers } from '~/composables/mint/useCollectionMembers'
import { useExplorerLinks } from '~/composables/core/useExplorerLinks'
import { useSupabase } from '~/composables/core/useSupabase'
import MintDetailModalHeader from './MintDetailModalHeader.vue'
import MintDetailModalMetadata from './MintDetailModalMetadata.vue'
import MintDetailModalTraitTypes from './MintDetailModalTraitTypes.vue'
import MintDetailModalHoldersNfts from './MintDetailModalHoldersNfts.vue'
import MintDetailModalSnapshots from './MintDetailModalSnapshots.vue'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '~/components/ui/dialog'
import { VisuallyHidden } from 'reka-ui'
import { Button } from '~/components/ui/button'
import { useTenantCatalog } from '~/composables/watchtower/useTenantCatalog'
import type { CatalogMintItem, AddressBookEntry } from '~/types/mints'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    mint?: CatalogMintItem | string | null
    entry?: AddressBookEntry | null
    tenantId?: string
  }>(),
  { mint: null, entry: null, tenantId: '' }
)

const emit = defineEmits<{ 'update:modelValue': [v: boolean]; saved: [] }>()

const tenantStore = useTenantStore()
const explorerLinks = useExplorerLinks()
const catalog = useTenantCatalog()

const shipmentBannerImage = ref('')
const shipmentBannerSaving = ref(false)

const isWatchtower = computed(() => typeof props.mint === 'string' && !!props.tenantId)
const isCatalog = computed(() => !isWatchtower.value)

const mintAddress = computed(() => {
  if (typeof props.mint === 'string') return props.mint
  return props.mint?.mint ?? null
})

interface DisplayMint {
  mint: string
  kind: string
  label: string
  symbol?: string | null
  image?: string | null
  decimals?: number | null
  sellerFeeBasisPoints?: number | null
  updateAuthority?: string | null
  uri?: string | null
  primarySaleHappened?: boolean | null
  isMutable?: boolean | null
  editionNonce?: number | null
  tokenStandard?: string | null
  traitTypes?: string[]
  tier?: string
  createdAt?: string
  track_holders?: boolean
  track_snapshot?: boolean
  track_transactions?: boolean
  holders?: Array<{ wallet: string; amount: string }>
  holdersUpdatedAt?: string | null
  snapshots?: { date: string; holderCount: number; holderWallets?: Array<{ wallet: string; amount: string } | string> }[]
  memberNfts?: { mint: string; name: string | null; image: string | null; traits: Array<{ trait_type?: string; traitType?: string; value?: string | number }>; owner?: string | null }[]
}

interface FetchedDetail extends DisplayMint {
  memberNfts?: { mint: string; name: string | null; image: string | null; traits: Array<{ trait_type?: string; traitType?: string; value?: string | number }>; owner?: string | null }[]
}

const loading = ref(false)
const fetchedDetail = ref<FetchedDetail | null>(null)
const error = ref<string | null>(null)

const display = computed<DisplayMint | null>(() => {
  if (isWatchtower.value) return fetchedDetail.value
  const m = props.mint as CatalogMintItem | null | undefined
  if (!m || typeof m === 'string') return null
  return {
    mint: m.mint,
    kind: m.kind,
    label: m.label ?? m.mint,
    symbol: m.symbol ?? null,
    image: m.image ?? null,
    decimals: m.decimals ?? null,
    sellerFeeBasisPoints: m.sellerFeeBasisPoints ?? null,
    updateAuthority: m.updateAuthority ?? null,
    uri: m.uri ?? null,
    primarySaleHappened: m.primarySaleHappened ?? null,
    isMutable: m.isMutable ?? null,
    editionNonce: m.editionNonce ?? null,
    tokenStandard: m.tokenStandard ?? null,
    traitTypes: m.traitTypes ?? m.traitKeys ?? [],
    tier: props.entry?.tier,
    createdAt: props.entry?.createdAt,
    track_holders: m.track_holders ?? false,
    track_snapshot: m.track_snapshot ?? false,
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
    .sort((a, b) => {
      const na = BigInt(a.amount)
      const nb = BigInt(b.amount)
      return nb > na ? 1 : nb < na ? -1 : 0
    })
}

const displayHolders = computed(() => toHoldersWithAmount(display.value?.holders))

const memberNfts = computed(() => {
  if (isWatchtower.value && fetchedDetail.value?.memberNfts?.length) {
    return fetchedDetail.value.memberNfts.map((n) => ({
      mint: n.mint,
      name: n.name,
      image: n.image,
      traits: n.traits ?? [],
      owner: (n as { owner?: string | null }).owner ?? null,
    }))
  }
  if (isCatalog.value && assets.value?.length) {
    return assets.value.map((a) => ({
      mint: a.mint,
      name: a.metadata?.name ?? null,
      image: a.metadata?.image ?? null,
      traits: (a.metadata?.traits ?? []).map((t) => ({ trait_type: t.trait_type, traitType: t.trait_type, value: t.value })),
      owner: a.metadata?.owner ?? null,
    }))
  }
  return []
})

const nftMintForCollection = computed(() =>
  props.modelValue && isCatalog.value && display.value?.kind === 'NFT' ? display.value.mint : null
)
const { assets, loading: assetsLoading } = useCollectionMembers(nftMintForCollection)

const combinedHolders = computed(() => {
  if (display.value?.kind !== 'NFT') return []
  const holders = displayHolders.value
  const nfts = memberNfts.value
  const byWallet = new Map<string, { count: number; nfts: typeof nfts }>()
  for (const h of holders) {
    byWallet.set(h.wallet, { count: Number(h.amount) || 0, nfts: [] })
  }
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

const showHoldersAndNftsSection = computed(
  () => display.value?.kind === 'NFT' && (memberNfts.value.length > 0 || (display.value?.track_holders && displayHolders.value.length > 0))
)

const mintExplorerUrl = computed(() => {
  const m = mintAddress.value ?? display.value?.mint
  if (!m) return '#'
  return explorerLinks.tokenUrl(m)
})

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

const memberNftsLoading = computed(() => (isCatalog.value ? assetsLoading.value : false))
const nftLink = computed(() => isWatchtower.value)

const showSnapshotsSection = computed(() => {
  if (isWatchtower.value) return display.value?.track_snapshot ?? false
  return !!props.entry && props.entry.tier !== 'base'
})

const expandedSnapshotDate = computed(() => (isWatchtower.value ? expandedSnapshot.value : selectedSnapshotDate.value))

const snapshotsForDisplay = computed(() => {
  if (isWatchtower.value) return display.value?.snapshots ?? []
  return catalogSnapshots.value
})

const holdersForSnapshot = computed(() => {
  if (isWatchtower.value) {
    const s = display.value?.snapshots?.find((x) => x.date === expandedSnapshot.value)
    return toHoldersWithAmount(s?.holderWallets)
  }
  return selectedSnapshotDate.value ? holdersFromSupabase.value : []
})

function close() {
  emit('update:modelValue', false)
}

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
    setTimeout(() => {
      copiedMint.value = null
      copiedWallet.value = null
    }, 2000)
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

const jsonPreview = computed(() => {
  const m = props.mint as CatalogMintItem | null | undefined
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
  if (m.traitTypes?.length) data.traitTypes = m.traitTypes
  if (props.entry) {
    data.tier = props.entry.tier
    if (props.entry.trait_options) data.traitOptions = props.entry.trait_options
    if (props.entry.createdAt) data.createdAt = props.entry.createdAt
  }
  return JSON.stringify(data, null, 2)
})

async function fetchWatchtowerDetail() {
  if (!props.mint || typeof props.mint !== 'string' || !props.tenantId) {
    fetchedDetail.value = null
    return
  }
  loading.value = true
  error.value = null
  fetchedDetail.value = null
  expandedSnapshot.value = null
  try {
    const supabase = useSupabase()
    const { data, err } = await supabase.functions.invoke('watchtower', {
      body: { action: 'mint-detail', tenantId: props.tenantId, mint: props.mint },
    })
    if (err) throw new Error(err.message ?? 'Request failed')
    const raw = (data ?? {}) as Record<string, unknown>
    const snapshots = Array.isArray(raw.snapshots)
      ? (raw.snapshots as Record<string, unknown>[]).map((s) => {
          const hw = Array.isArray(s.holderWallets) ? (s.holderWallets as unknown[]) : []
          const holders = hw.map((h) =>
            typeof h === 'string' ? { wallet: h, amount: '1' } : { wallet: (h as { wallet?: string }).wallet ?? '', amount: (h as { amount?: string }).amount ?? '1' }
          ).filter((x) => x.wallet)
          return {
            date: (s.date as string) ?? '',
            holderCount: holders.length,
            holderWallets: holders,
          }
        })
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
    fetchedDetail.value = {
      mint: (raw.mint as string) ?? props.mint ?? '',
      kind: (raw.kind as string) ?? 'SPL',
      label: (raw.label as string) ?? (raw.name as string) ?? props.mint ?? '',
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
      holders: Array.isArray(raw.holders)
        ? (raw.holders as unknown[]).map((h) =>
            typeof h === 'string' ? { wallet: h, amount: '1' } : { wallet: (h as { wallet?: string }).wallet ?? '', amount: (h as { amount?: string }).amount ?? '1' }
          ).filter((h) => h.wallet)
        : [],
      holdersUpdatedAt: (raw.holdersUpdatedAt as string) ?? null,
      snapshots,
      memberNfts: memberNftsRaw,
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load'
  } finally {
    loading.value = false
  }
}

async function fetchCatalogSnapshots() {
  const m = props.mint as CatalogMintItem | null | undefined
  if (!props.entry || !m || typeof m === 'string' || props.entry.tier === 'base') return
  const tenantId = tenantStore.tenantId
  if (!tenantId) return
  snapshotsLoading.value = true
  catalogSnapshots.value = []
  selectedSnapshotDate.value = null
  holdersFromSupabase.value = []
  try {
    const supabase = useSupabase()
    const { data, err } = await supabase
      .from('holder_snapshots')
      .select('snapshot_date, snapshot_at, holder_wallets')
      .eq('mint', m.mint)
      .order('snapshot_at', { ascending: false })
      .limit(100)
    if (!err && data) {
      catalogSnapshots.value = data.map((r) => {
        const snapshotAt = r.snapshot_at as string
        const date = snapshotAt ? new Date(snapshotAt).toISOString().slice(0, 16).replace('T', ' ') : (r.snapshot_date as string)
        return {
          date,
          holderCount: Array.isArray(r.holder_wallets) ? (r.holder_wallets as unknown[]).length : 0,
          snapshotAt,
        }
      }).slice(0, 30)
    }
  } catch {
    catalogSnapshots.value = []
  } finally {
    snapshotsLoading.value = false
  }
}

async function selectCatalogSnapshot(snapshotAt: string) {
  const m = props.mint as CatalogMintItem | null | undefined
  if (!m || typeof m === 'string') return
  walletsLoading.value = true
  try {
    const supabase = useSupabase()
    const { data, err } = await supabase
      .from('holder_snapshots')
      .select('holder_wallets')
      .eq('mint', m.mint)
      .eq('snapshot_at', snapshotAt)
      .maybeSingle()
    if (!err && data) {
      const hw = (data as { holder_wallets?: unknown }).holder_wallets
      const arr = Array.isArray(hw) ? hw : []
      holdersFromSupabase.value = arr.map((h) =>
        typeof h === 'string' ? { wallet: h, amount: '1' } : { wallet: (h as { wallet?: string }).wallet ?? '', amount: (h as { amount?: string }).amount ?? '1' }
      ).filter((x) => x.wallet)
    } else {
      holdersFromSupabase.value = []
    }
  } catch {
    holdersFromSupabase.value = []
  } finally {
    walletsLoading.value = false
  }
}

async function saveShipmentBanner() {
  const m = mintAddress.value ?? display.value?.mint
  if (!m) return
  shipmentBannerSaving.value = true
  try {
    await catalog.updateShipmentDisplay(m, { image: shipmentBannerImage.value || null })
    emit('saved')
  } finally {
    shipmentBannerSaving.value = false
  }
}

function toggleSnapshot(date: string, snapshotAtForQuery?: string) {
  if (isWatchtower.value) {
    expandedSnapshot.value = expandedSnapshot.value === date ? null : date
  } else {
    if (selectedSnapshotDate.value === date) {
      selectedSnapshotDate.value = null
      holdersFromSupabase.value = []
    } else {
      selectedSnapshotDate.value = date
      selectCatalogSnapshot(snapshotAtForQuery ?? date.replace(' ', 'T'))
    }
  }
}

watch(
  () => [props.modelValue, props.mint, props.entry],
  () => {
    if (props.modelValue && isCatalog.value) {
      const m = props.mint as CatalogMintItem | null | undefined
      const e = props.entry as AddressBookEntry | null | undefined
      shipmentBannerImage.value = (m as { shipment_banner_image?: string | null })?.shipment_banner_image ?? e?.shipment_banner_image ?? ''
    }
    if (props.modelValue) {
      if (isWatchtower.value && props.mint && typeof props.mint === 'string' && props.tenantId) {
        fetchWatchtowerDetail()
      } else if (isCatalog.value) {
        showJson.value = false
        fetchCatalogSnapshots()
      }
    } else {
      fetchedDetail.value = null
      error.value = null
      expandedSnapshot.value = null
      catalogSnapshots.value = []
      selectedSnapshotDate.value = null
      holdersFromSupabase.value = []
    }
  },
  { immediate: true }
)

watch(
  () => (props.mint as CatalogMintItem)?.mint,
  () => {
    if (props.modelValue && isCatalog.value) fetchCatalogSnapshots()
  }
)
</script>

<style src="./MintDetailModal.css"></style>
