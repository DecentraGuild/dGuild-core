<template>
  <div class="admin__split">
    <div class="admin__panel">
      <Card>
        <h3>Member access</h3>
        <p class="admin__hint">
          Control who can view the address book. Admins always have access.
        </p>
        <WhitelistSelect
          :slug="slug"
          :model-value="memberAccessValue"
          label="Who can view"
          show-admin-only
          @update:model-value="onMemberAccessChange"
        />
      </Card>

      <Card>
        <h3>Address book</h3>
        <p class="addressbook-tab__hint">
          Add SPL tokens and NFT collections. Toggle Grow to enable daily holder snapshots and weekly metadata refresh.
        </p>

        <div v-if="loading" class="addressbook-tab__loading">
          <Icon icon="mdi:loading" class="addressbook-tab__spinner" />
          Loading address book...
        </div>

        <template v-else>
          <MintAssetPicker
            :model-value="pickerValue"
            :show-tracking-tiers="true"
            :tracking-by-mint="trackingByMint"
            :discord-mints="discordMintSet"
            :show-kind-selector="true"
            hint="Enter a mint address or pick from the address book to add it."
            @update:model-value="onPickerUpdate"
            @update:tracking-by-mint="onTrackingUpdate"
            @mint-added="onMintAdded"
            @mint-removed="onMintRemoved"
            @address-book-select="onAddressBookSelect"
            @inspect-collection="onInspectCollection"
            @inspect-spl="onInspectSpl"
            @error="onError"
          />

          <div v-if="saveError" class="addressbook-tab__error">{{ saveError }}</div>
        </template>
      </Card>
    </div>

    <AdminPricingWidget
      module-id="addressbook"
      :module-state="moduleState"
      :conditions="liveConditions"
      :stored-conditions="storedConditionsSnapshot"
      :subscription="subscription"
      :saving="saving"
      :deploying="deploying"
      :save-error="saveError"
      @save="(p: BillingPeriod) => emit('save', p)"
      @deploy="(p: BillingPeriod) => emit('deploy', p)"
      @reactivate="(p: BillingPeriod) => emit('reactivate', p)"
    />

    <MintDetailModal v-model="showMintModal" :mint="selectedMint" />
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Card } from '@decentraguild/ui/components'
import type { ModuleState } from '@decentraguild/core'
import type { BillingPeriod } from '@decentraguild/billing'
import { API_V1 } from '~/utils/apiBase'
import MintAssetPicker from '~/components/MintAssetPicker.vue'
import AdminPricingWidget from '~/components/AdminPricingWidget.vue'
import MintDetailModal from '~/components/MintDetailModal.vue'
import WhitelistSelect from '~/components/WhitelistSelect.vue'
import type { WhitelistSelectValue } from '~/components/WhitelistSelect.vue'
import type {
  MintAssetPickerValue,
  MintKind,
  TrackingByMint,
  AddressBookEntry,
  CollectionMint,
  SplAssetMint,
  CatalogMintItem,
} from '~/types/mints'

const props = defineProps<{
  slug: string
  moduleState: ModuleState
  subscription: { periodEnd?: string } | null
  saving: boolean
  deploying: boolean
  saveError: string | null
}>()

const emit = defineEmits<{
  save: [period: BillingPeriod]
  deploy: [period: BillingPeriod]
  reactivate: [period: BillingPeriod]
  'conditions-changed': [conditions: { mintsBase: number; mintsGrow: number; mintsPro: number }]
}>()

const tenantId = computed(() => useTenantStore().tenantId)
const apiBase = useApiBase()

const loading = ref(true)
const saveError2 = ref<string | null>(null)

const addressBook = ref<AddressBookEntry[]>([])
/** Snapshot of condition counts when we last loaded (or deployed). Used for "dirty vs stored" in pricing widget. */
const storedConditionsSnapshot = ref<{ mintsBase: number; mintsGrow: number; mintsPro: number } | null>(null)
const memberAccessValue = ref<WhitelistSelectValue>('admin-only')

const pickerValue = ref<MintAssetPickerValue>({ spl: [], nfts: [] })
const trackingByMint = ref<TrackingByMint>({})

const showMintModal = ref(false)
const selectedMint = ref<CatalogMintItem | null>(null)

/** Set of mint addresses used in Discord rules for this tenant. */
const discordMintSet = ref<Set<string>>(new Set())

const liveConditions = computed(() => {
  let mintsBase = 0
  let mintsGrow = 0
  let mintsPro = 0
  for (const entry of addressBook.value) {
    if (entry.tier === 'base') mintsBase++
    else if (entry.tier === 'grow') mintsGrow++
    else if (entry.tier === 'pro') mintsPro++
  }
  return { mintsBase, mintsGrow, mintsPro }
})

watch(liveConditions, (c) => emit('conditions-changed', c), { immediate: true })

async function fetchAddressBook() {
  loading.value = true
  try {
    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${tenantId.value}/addressbook/address-book`,
      { credentials: 'include' },
    )
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? `HTTP ${res.status}`)
    }
    const data = (await res.json()) as { entries: AddressBookEntry[] }
    addressBook.value = data.entries

    let mintsBase = 0
    let mintsGrow = 0
    let mintsPro = 0
    for (const entry of data.entries) {
      if (entry.tier === 'base') mintsBase++
      else if (entry.tier === 'grow') mintsGrow++
      else if (entry.tier === 'pro') mintsPro++
    }
    storedConditionsSnapshot.value = { mintsBase, mintsGrow, mintsPro }

    const spl = data.entries.filter((e) => e.kind === 'SPL').map((e) => ({
      mint: e.mint,
      name: e.name ?? e.label ?? undefined,
      symbol: (e as { symbol?: string | null }).symbol ?? undefined,
      image: e.image ?? undefined,
    }))
    const nfts = data.entries.filter((e) => e.kind === 'NFT').map((e) => ({
      mint: e.mint,
      name: e.name ?? e.label ?? undefined,
      image: e.image ?? undefined,
    }))
    pickerValue.value = { spl, nfts }

    const tracking: TrackingByMint = {}
    for (const entry of data.entries) {
      tracking[entry.mint] = {
        trackHolder: entry.tier === 'grow' || entry.tier === 'pro',
        trackTransactions: entry.tier === 'pro',
      }
    }
    trackingByMint.value = tracking
  } catch (e) {
    saveError2.value = e instanceof Error ? e.message : 'Failed to load address book'
  } finally {
    loading.value = false
  }
}

async function fetchSettings() {
  try {
    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${tenantId.value}/addressbook/settings`,
      { credentials: 'include' },
    )
    if (!res.ok) return
    const data = (await res.json()) as {
      settings?: {
        access?: string
        whitelist?: { programId?: string; account?: string } | null
      }
    }
    const access = data.settings?.access ?? 'admin_only'
    const wl = data.settings?.whitelist
    if (access === 'admin_only') {
      memberAccessValue.value = 'admin-only'
    } else if (access === 'whitelist' && wl && typeof wl === 'object' && (wl as { account?: string }).account) {
      memberAccessValue.value = wl as { programId: string; account: string }
    } else {
      memberAccessValue.value = null
    }
  } catch {
    // ignore
  }
}

async function onMemberAccessChange(value: WhitelistSelectValue) {
  memberAccessValue.value = value
  const access = value === 'admin-only' ? 'admin_only' : value === null ? 'public' : 'whitelist'
  const wlBody =
    access !== 'whitelist' || value === null || value === 'use-default' || value === 'admin-only' ||
    (typeof value === 'object' && !value.account?.trim())
      ? null
      : value
  try {
    await fetch(
      `${apiBase.value}${API_V1}/tenant/${tenantId.value}/addressbook/settings`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ access, whitelist: wlBody }),
      },
    )
  } catch (e) {
    saveError2.value = e instanceof Error ? e.message : 'Failed to save access settings'
  }
}

async function fetchDiscordMints() {
  try {
    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${tenantId.value}/discord/mints`,
      { credentials: 'include' },
    )
    if (!res.ok) return
    const data = (await res.json()) as { mints?: Array<{ asset_id: string }> }
    discordMintSet.value = new Set((data.mints ?? []).map((m) => m.asset_id))
  } catch {
    // ignore — Discord may not be configured
  }
}

onMounted(() => {
  fetchAddressBook()
  fetchSettings()
  fetchDiscordMints()
})

function tierFromTracking(mint: string): 'base' | 'grow' {
  const t = trackingByMint.value[mint]
  if (t?.trackHolder) return 'grow'
  return 'base'
}

async function apiAdd(mint: string, kind: MintKind, name?: string | null, image?: string | null) {
  const tier = tierFromTracking(mint)
  try {
    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${tenantId.value}/addressbook/address-book`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mint, kind, tier, label: name ?? undefined, name: name ?? undefined, image: image ?? undefined }),
      },
    )
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? `HTTP ${res.status}`)
    }
    const data = (await res.json()) as { entry: AddressBookEntry }
    addressBook.value = [...addressBook.value.filter((e) => e.mint !== mint), data.entry]
  } catch (e) {
    saveError2.value = e instanceof Error ? e.message : 'Failed to add mint'
  }
}

async function apiRemove(mint: string) {
  try {
    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${tenantId.value}/addressbook/address-book/${encodeURIComponent(mint)}`,
      { method: 'DELETE', credentials: 'include' },
    )
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? `HTTP ${res.status}`)
    }
    addressBook.value = addressBook.value.filter((e) => e.mint !== mint)
  } catch (e) {
    saveError2.value = e instanceof Error ? e.message : 'Failed to remove mint'
  }
}

async function apiUpdateTier(mint: string, tier: 'base' | 'grow') {
  try {
    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${tenantId.value}/addressbook/address-book/${encodeURIComponent(mint)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tier }),
      },
    )
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? `HTTP ${res.status}`)
    }
    const data = (await res.json()) as { entry: AddressBookEntry }
    addressBook.value = addressBook.value.map((e) => e.mint === mint ? data.entry : e)
  } catch (e) {
    saveError2.value = e instanceof Error ? e.message : 'Failed to update tier'
  }
}

function onPickerUpdate(value: MintAssetPickerValue) {
  pickerValue.value = value
}

function onMintAdded(mint: string, kind: MintKind) {
  const item = kind === 'SPL'
    ? pickerValue.value.spl.find((s) => s.mint === mint)
    : pickerValue.value.nfts.find((n) => n.mint === mint)
  apiAdd(mint, kind, item?.name ?? null, (item as { image?: string | null })?.image ?? null)
}

async function onAddressBookSelect(mint: string, entry: AddressBookEntry) {
  trackingByMint.value = {
    ...trackingByMint.value,
    [mint]: {
      trackHolder: entry.tier === 'grow',
      trackTransactions: false,
    },
  }
  await apiAdd(mint, entry.kind, entry.name ?? entry.label ?? null, entry.image ?? null)
  await fetchAddressBook()
}

function onMintRemoved(mint: string, _kind: MintKind) {
  apiRemove(mint)
  const next = { ...trackingByMint.value }
  delete next[mint]
  trackingByMint.value = next
}

function onTrackingUpdate(value: TrackingByMint) {
  const previous = trackingByMint.value
  trackingByMint.value = value

  for (const [mint, tracking] of Object.entries(value)) {
    const prev = previous[mint]
    if (prev && prev.trackHolder !== tracking.trackHolder) {
      const tier = tracking.trackHolder ? 'grow' : 'base'
      apiUpdateTier(mint, tier)
      const idx = addressBook.value.findIndex((e) => e.mint === mint)
      if (idx >= 0) {
        addressBook.value = addressBook.value.map((e, i) => i === idx ? { ...e, tier } : e)
      }
    }
  }
}

function onInspectCollection(collection: Record<string, unknown>) {
  const c = collection as CollectionMint
  selectedMint.value = {
    id: c.mint,
    mint: c.mint,
    kind: 'NFT',
    label: c.name || c.mint,
    image: c.image ?? null,
    sellerFeeBasisPoints: c.sellerFeeBasisPoints ?? null,
    traitTypes: c.traitTypes ?? null,
  }
  showMintModal.value = true
}

function onInspectSpl(spl: SplAssetMint) {
  selectedMint.value = {
    id: spl.mint,
    mint: spl.mint,
    kind: 'SPL',
    label: spl.name || spl.symbol || spl.mint,
    image: spl.image ?? null,
    symbol: spl.symbol ?? null,
    decimals: spl.decimals ?? null,
    sellerFeeBasisPoints: spl.sellerFeeBasisPoints ?? null,
  }
  showMintModal.value = true
}

function onError(msg: string) {
  saveError2.value = msg
}
</script>

<style scoped>
.addressbook-tab__hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin-bottom: var(--theme-space-md);
}

.addressbook-tab__loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  color: var(--theme-text-muted);
  font-size: var(--theme-font-sm);
}

.addressbook-tab__spinner {
  animation: addressbook-spin 1s linear infinite;
}

@keyframes addressbook-spin {
  to { transform: rotate(360deg); }
}

.addressbook-tab__error {
  margin-top: var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}
</style>
