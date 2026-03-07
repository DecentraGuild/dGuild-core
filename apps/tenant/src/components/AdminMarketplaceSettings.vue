<template>
  <div class="marketplace-settings">
    <Card>
      <h3>Mint catalog</h3>
      <p class="marketplace-settings__hint">NFT collections and SPL tokens available in the marketplace.</p>

      <AdminMintCatalog
        :mints="catalogItems"
        @inspect="onInspectMint"
        @delete="onDeleteMint"
      >
        <template #add>
          <h4 class="marketplace-settings__add-title">Add mint</h4>
          <AddMintInput
            v-model="newMint"
            v-model:kind="newMintKind"
            :error="addMintError"
            :loading="adding"
            :disabled="saving"
            @submit="addMint"
          />
        </template>
      </AdminMintCatalog>
    </Card>

    <Card>
      <h3>Currencies</h3>
      <p class="marketplace-settings__hint">Base: SOL, WBTC, USDC, USDT. Add custom by mint.</p>
      <div class="marketplace-settings__base-toggles">
        <label v-for="b in BASE_CURRENCY_MINTS" :key="b.symbol" class="marketplace-settings__checkbox">
          <input
            :checked="form.currencyMints.some((c) => c.mint === b.mint)"
            type="checkbox"
            @change="onBaseToggle(b.symbol, ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ b.symbol }}</span>
        </label>
      </div>
      <div class="marketplace-settings__custom">
        <p class="marketplace-settings__hint">Custom currencies</p>
        <div class="marketplace-settings__add-mint">
          <TextInput
            v-model="newCurrencyMint"
            placeholder="Mint address"
            :error="addCurrencyError"
            @keydown.enter.prevent="lookupAndAddCurrency"
          />
          <AddressBookBrowser kind="SPL" @select="(mint) => { newCurrencyMint = mint; lookupAndAddCurrency() }" />
          <Button
            variant="secondary"
            :disabled="!newCurrencyMint.trim() || saving"
            @click="lookupAndAddCurrency"
          >
            Add
          </Button>
        </div>
        <ul v-if="customCurrencies.length" class="marketplace-settings__mint-list">
          <li
            v-for="(c, idx) in customCurrencies"
            :key="c.mint"
            class="marketplace-settings__mint-item"
          >
            <div class="marketplace-settings__mint-row marketplace-settings__mint-row--plain">
              <div class="marketplace-settings__mint-thumb">
                <img v-if="c.image" :src="c.image" :alt="c.name ?? c.symbol ?? c.mint" />
                <span v-else class="marketplace-settings__mint-thumb-placeholder"><Icon icon="mdi:cash-multiple" /></span>
              </div>
              <div class="marketplace-settings__mint-detail">
                <template v-if="c._loading">
                  <Icon icon="mdi:loading" class="marketplace-settings__spinner" />
                  <span class="marketplace-settings__mint-name">{{ c.mint.slice(0, 8) + '...' + c.mint.slice(-4) }}</span>
                  <span class="marketplace-settings__mint-status">Loading...</span>
                </template>
                <template v-else-if="c._error">
                  <span class="marketplace-settings__mint-name">{{ c.mint.slice(0, 8) + '...' + c.mint.slice(-4) }}</span>
                  <span class="marketplace-settings__mint-error">{{ c._error }}</span>
                </template>
                <template v-else>
                  <span class="marketplace-settings__mint-name">{{ (c.symbol || c.name) || c.mint.slice(0, 8) + '...' }}</span>
                  <code class="marketplace-settings__mint-address">{{ c.mint.slice(0, 8) }}...{{ c.mint.slice(-6) }}</code>
                  <span class="marketplace-settings__mint-meta">
                    {{ c.name || '' }} {{ c.decimals != null ? `· ${c.decimals} dec` : '' }}
                    {{ c.sellerFeeBasisPoints != null ? `· ${c.sellerFeeBasisPoints} bps` : '' }}
                  </span>
                </template>
              </div>
            </div>
            <Button variant="ghost" :disabled="!!c._loading" @click="removeCustomCurrency(idx)">
              <Icon icon="mdi:close" />
            </Button>
          </li>
        </ul>
      </div>
    </Card>

    <Card>
      <h3>Marketplace fees</h3>
      <p class="marketplace-settings__hint">
        These fees will be enforced at the escrow program level. Fields are shown here for planning but are not yet active.
      </p>
      <div class="marketplace-settings__fees">
        <TextInput
          v-model="form.shopFee.wallet"
          label="Fee wallet"
          placeholder="Wallet to receive marketplace fees"
          disabled
        />
        <div class="marketplace-settings__fee-row">
          <TextInput
            :model-value="String(form.shopFee.makerFlatFee ?? 0)"
            label="Maker flat fee (SOL)"
            type="number"
            min="0"
            step="0.000000001"
            disabled
            @update:model-value="form.shopFee.makerFlatFee = Number($event) || 0"
          />
          <TextInput
            :model-value="String(form.shopFee.takerFlatFee ?? 0)"
            label="Taker flat fee (SOL)"
            type="number"
            min="0"
            step="0.000000001"
            disabled
            @update:model-value="form.shopFee.takerFlatFee = Number($event) || 0"
          />
        </div>
        <div class="marketplace-settings__fee-row">
          <TextInput
            :model-value="String(form.shopFee.makerPercentFee ?? 0)"
            label="Maker fee (bps)"
            type="number"
            min="0"
            step="1"
            disabled
            @update:model-value="form.shopFee.makerPercentFee = Number($event) || 0"
          />
          <TextInput
            :model-value="String(form.shopFee.takerPercentFee ?? 0)"
            label="Taker fee (bps)"
            type="number"
            min="0"
            step="1"
            disabled
            @update:model-value="form.shopFee.takerPercentFee = Number($event) || 0"
          />
        </div>
      </div>
    </Card>

    <Card>
      <h3>Whitelist</h3>
      <p class="marketplace-settings__hint">Escrow program uses these for whitelist-protected trades. Use dGuild default, public, or a specific list.</p>
      <WhitelistSelect
        :slug="slug"
        :model-value="marketplaceWhitelistSelectValue"
        label="Whitelist"
        show-use-default
        @update:model-value="onWhitelistSelectUpdate"
      />
    </Card>

    <div class="marketplace-settings__actions">
      <Button
        variant="primary"
        :disabled="saving || !canSave"
        @click="save"
      >
        {{ saving ? 'Saving...' : saveSuccess ? 'Saved' : canSave ? 'Save Marketplace Settings' : 'Complete loading before saving' }}
      </Button>
      <p v-if="saveSuccess" class="marketplace-settings__success">Settings saved.</p>
      <p v-else-if="saveError" class="marketplace-settings__error">{{ saveError }}</p>
    </div>

    <MintDetailModal v-model="showMintModal" :mint="selectedMint" />
  </div>
</template>

<script setup lang="ts">
import { API_V1 } from '~/utils/apiBase'
import { Icon } from '@iconify/vue'
import { BASE_CURRENCY_MINTS } from '@decentraguild/core'
import { getModuleCatalogEntry } from '@decentraguild/config'
import type { TieredAddonsPricing } from '@decentraguild/config'
import { Card, TextInput, Button } from '@decentraguild/ui/components'
import AdminMintCatalog from './AdminMintCatalog.vue'
import MintDetailModal from './MintDetailModal.vue'
import AddMintInput from './AddMintInput.vue'
import AddressBookBrowser from './AddressBookBrowser.vue'
import type { CatalogMintItem } from '~/types/mints'
import { reactive, ref, watch, computed, nextTick } from 'vue'

interface CollectionMint {
  mint: string
  name?: string
  image?: string
  sellerFeeBasisPoints?: number
  groupPath?: string[]
  collectionSize?: number
  uniqueTraitCount?: number
  traitTypes?: string[]
  _loading?: boolean
  _error?: string
}

interface SplAssetMint {
  mint: string
  name?: string
  symbol?: string
  image?: string
  decimals?: number | null
  sellerFeeBasisPoints?: number | null
  _loading?: boolean
  _error?: string
}

interface CurrencyMint {
  mint: string
  name: string
  symbol: string
  image?: string
  decimals?: number | null
  sellerFeeBasisPoints?: number | null
  _loading?: boolean
  _error?: string
}

interface ShopFee {
  wallet: string
  makerFlatFee: number
  takerFlatFee: number
  makerPercentFee: number
  takerPercentFee: number
}

interface WhitelistSettings {
  programId: string
  account: string
}


const DEFAULT_WHITELIST: WhitelistSettings = {
  programId: 'whi5uDPWK4rAE9Sus6hdxdHwsG1hjDBn6kXM6pyqwTn',
  account: '',
}

type WhitelistFormValue = WhitelistSettings | null | 'use-default'

const MARKETPLACE_UI_MINT_CAP_MULTIPLIER = 4

function getMarketplaceUiMintsCap(): number {
  const marketplace = getModuleCatalogEntry('marketplace')
  const pricing = marketplace?.pricing
  if (!pricing || pricing.modelType !== 'tiered_addons') return 1000

  const tiers = (pricing as TieredAddonsPricing).tiers ?? []
  const maxTierIncludedMints = tiers.reduce((max, t) => Math.max(max, (t.included as { mintsCount?: number } | undefined)?.mintsCount ?? 0), 0)
  const base = Math.max(1, maxTierIncludedMints)
  return base * MARKETPLACE_UI_MINT_CAP_MULTIPLIER
}

const MARKETPLACE_UI_MINTS_CAP = getMarketplaceUiMintsCap()

interface MarketplaceForm {
  collectionMints: CollectionMint[]
  splAssetMints: SplAssetMint[]
  currencyMints: CurrencyMint[]
  shopFee: ShopFee
  whitelist: WhitelistFormValue
}

const props = defineProps<{
  slug: string
  settings: Record<string, unknown> | null
}>()

const emit = defineEmits<{
  saved: [settings: Record<string, unknown>]
  saving: [value: boolean]
}>()

const tenantId = computed(() => useTenantStore().tenantId)
const apiBase = useApiBase()

const form = reactive<MarketplaceForm>({
  collectionMints: [],
  splAssetMints: [],
  currencyMints: [],
  shopFee: {
    wallet: '',
    makerFlatFee: 0,
    takerFlatFee: 0,
    makerPercentFee: 0,
    takerPercentFee: 0,
  },
  whitelist: 'use-default' as WhitelistFormValue,
})

const totalMintsCount = computed(() => form.collectionMints.length + form.splAssetMints.length)

const customCurrencies = computed(() => {
  const baseMints = new Set(BASE_CURRENCY_MINTS.map((b) => b.mint))
  return form.currencyMints.filter((c) => !baseMints.has(c.mint))
})

const anyLoading = computed(() => {
  const colLoading = form.collectionMints.some((m) => m._loading)
  const splLoading = form.splAssetMints.some((m) => m._loading)
  const currLoading = customCurrencies.value.some((c) => c._loading)
  return colLoading || splLoading || currLoading
})

const anyError = computed(() => {
  const colErr = form.collectionMints.some((m) => m._error)
  const splErr = form.splAssetMints.some((m) => m._error)
  const currErr = customCurrencies.value.some((c) => c._error)
  return colErr || splErr || currErr
})

const canSave = computed(() => !anyLoading.value && !anyError.value)

const marketplaceWhitelistSelectValue = computed(() => {
  const w = form.whitelist
  if (w === 'use-default') return '__use_default__'
  if (w === null || (typeof w === 'object' && !(w.account?.trim()))) return ''
  return w.account
})

function onWhitelistSelectUpdate(value: WhitelistSettings | null | 'use-default') {
  if (value === 'use-default') {
    form.whitelist = 'use-default'
    return
  }
  if (value === null) {
    form.whitelist = null
    return
  }
  form.whitelist = value
}

const newMint = ref('')
const newMintKind = ref<'auto' | 'SPL' | 'NFT'>('auto')
const addMintError = ref('')
const adding = ref(false)
const newCurrencyMint = ref('')
const addCurrencyError = ref('')
const saving = ref(false)
const saveError = ref<string | null>(null)
const saveSuccess = ref(false)
const selectedMint = ref<CatalogMintItem | null>(null)
const showMintModal = ref(false)

const catalogItems = computed<CatalogMintItem[]>(() => [
  ...form.splAssetMints.map((m) => ({
    id: m.mint,
    mint: m.mint,
    kind: 'SPL' as const,
    label: m.name || m.symbol || m.mint,
    symbol: m.symbol ?? null,
    image: m.image ?? null,
    decimals: m.decimals ?? null,
    sellerFeeBasisPoints: m.sellerFeeBasisPoints ?? null,
    _loading: m._loading,
    _error: m._error,
  })),
  ...form.collectionMints.map((m) => ({
    id: m.mint,
    mint: m.mint,
    kind: 'NFT' as const,
    label: m.name || m.mint,
    image: m.image ?? null,
    sellerFeeBasisPoints: m.sellerFeeBasisPoints ?? null,
    traitTypes: m.traitTypes ?? null,
    _loading: m._loading,
    _error: m._error,
  })),
])

function onInspectMint(item: CatalogMintItem) {
  if (item._loading || item._error) return
  selectedMint.value = item
  showMintModal.value = true
}

function onDeleteMint(item: CatalogMintItem) {
  if (item.kind === 'NFT') {
    const idx = form.collectionMints.findIndex((m) => m.mint === item.mint)
    if (idx >= 0) form.collectionMints.splice(idx, 1)
  } else {
    const idx = form.splAssetMints.findIndex((m) => m.mint === item.mint)
    if (idx >= 0) form.splAssetMints.splice(idx, 1)
  }
}

async function addMint(mint: string, kind: 'auto' | 'SPL' | 'NFT') {
  const trimmed = mint.trim()
  if (!trimmed || trimmed.length < 32) {
    addMintError.value = 'Invalid mint address'
    return
  }
  if (form.collectionMints.some((m) => m.mint === trimmed) || form.splAssetMints.some((m) => m.mint === trimmed)) {
    addMintError.value = 'Mint already added'
    return
  }
  if (totalMintsCount.value >= MARKETPLACE_UI_MINTS_CAP) {
    addMintError.value = `Maximum ${MARKETPLACE_UI_MINTS_CAP} mints (collections + SPL assets)`
    return
  }
  addMintError.value = ''
  adding.value = true
  try {
    const tryCollection = kind === 'auto' || kind === 'NFT'
    const trySpl = kind === 'auto' || kind === 'SPL'
    if (tryCollection) {
      const colRes = await fetch(`${apiBase.value}${API_V1}/marketplace/asset-preview/collection/${encodeURIComponent(trimmed)}`)
      if (colRes.ok) {
        const data = (await colRes.json()) as {
          name?: string; image?: string; sellerFeeBasisPoints?: number
          collectionSize?: number; uniqueTraitCount?: number; traitTypes?: string[]
        }
        form.collectionMints.push({
          mint: trimmed,
          name: data.name,
          image: data.image,
          sellerFeeBasisPoints: data.sellerFeeBasisPoints,
          collectionSize: data.collectionSize ?? 0,
          uniqueTraitCount: data.uniqueTraitCount ?? 0,
          traitTypes: data.traitTypes ?? [],
        })
        newMint.value = ''
        newMintKind.value = 'auto'
        return
      }
    }
    if (trySpl) {
      const splRes = await fetch(`${apiBase.value}${API_V1}/marketplace/asset-preview/spl/${encodeURIComponent(trimmed)}`)
      if (splRes.ok) {
        const data = (await splRes.json()) as {
          name?: string; symbol?: string; image?: string
          decimals?: number; sellerFeeBasisPoints?: number
        }
        form.splAssetMints.push({
          mint: trimmed,
          name: data.name,
          symbol: data.symbol,
          image: data.image,
          decimals: data.decimals,
          sellerFeeBasisPoints: data.sellerFeeBasisPoints,
        })
        newMint.value = ''
        newMintKind.value = 'auto'
        return
      }
    }
    addMintError.value = 'Could not resolve mint as NFT collection or SPL token.'
  } catch (e) {
    addMintError.value = e instanceof Error ? e.message : 'Failed to resolve mint'
  } finally {
    adding.value = false
  }
}

watch(
  () => props.settings,
  (s) => {
    if (!s) return
    const cm = (s.collectionMints as Array<{ mint: string; name?: string; image?: string; sellerFeeBasisPoints?: number; groupPath?: string[]; collectionSize?: number; uniqueTraitCount?: number; traitTypes?: string[] }>) ?? []
    form.collectionMints = cm.map((m) => ({
      mint: m.mint ?? '',
      name: m.name,
      image: m.image,
      sellerFeeBasisPoints: m.sellerFeeBasisPoints,
      groupPath: m.groupPath,
      collectionSize: m.collectionSize,
      uniqueTraitCount: m.uniqueTraitCount,
      traitTypes: m.traitTypes,
    }))
    const spl = (s.splAssetMints as Array<{ mint: string; name?: string; symbol?: string; image?: string; decimals?: number | null; sellerFeeBasisPoints?: number | null }>) ?? []
    form.splAssetMints = spl.map((m) => ({
      mint: m.mint ?? '',
      name: m.name,
      symbol: m.symbol,
      image: m.image,
      decimals: m.decimals,
      sellerFeeBasisPoints: m.sellerFeeBasisPoints,
    }))
    const cmu = (s.currencyMints as CurrencyMint[]) ?? []
    form.currencyMints = cmu.length > 0 ? cmu.map((c) => ({ ...c, _loading: false, _error: undefined })) : [...BASE_CURRENCY_MINTS]
    const sf = s.shopFee as Partial<ShopFee> | undefined
    if (sf) {
      form.shopFee.wallet = sf.wallet ?? ''
      form.shopFee.makerFlatFee = Number(sf.makerFlatFee) || 0
      form.shopFee.takerFlatFee = Number(sf.takerFlatFee) || 0
      form.shopFee.makerPercentFee = Number(sf.makerPercentFee) || 0
      form.shopFee.takerPercentFee = Number(sf.takerPercentFee) || 0
    }
    const wl = s.whitelist as Partial<WhitelistSettings> | undefined | null
    if (wl === undefined) {
      form.whitelist = 'use-default'
    } else if (wl === null || (typeof wl === 'object' && !(wl.account?.trim()))) {
      form.whitelist = null
    } else {
      form.whitelist = {
        programId: (wl.programId as string) || DEFAULT_WHITELIST.programId,
        account: (wl.account as string) ?? '',
      }
    }
    nextTick(() => fillMissingCollectionCounts())
  },
  { immediate: true }
)

async function fillMissingCollectionCounts() {
  for (let i = 0; i < form.collectionMints.length; i++) {
    const m = form.collectionMints[i]
    if (m._loading || m._error || (m.collectionSize != null && m.collectionSize > 0)) continue
    try {
      const res = await fetch(`${apiBase.value}${API_V1}/marketplace/asset-preview/collection/${encodeURIComponent(m.mint)}`)
      if (!res.ok) continue
      const data = (await res.json()) as { collectionSize?: number; uniqueTraitCount?: number; traitTypes?: string[] }
      const existing = form.collectionMints[i]
      if (existing && existing.mint === m.mint) {
        existing.collectionSize = data.collectionSize ?? 0
        existing.uniqueTraitCount = data.uniqueTraitCount ?? 0
        existing.traitTypes = data.traitTypes ?? []
      }
    } catch {
      // ignore per-mint errors
    }
  }
}

function onBaseToggle(symbol: string, checked: boolean) {
  const base = BASE_CURRENCY_MINTS.find((b) => b.symbol === symbol)
  if (!base) return
  if (checked) {
    if (!form.currencyMints.some((c) => c.mint === base.mint)) {
      form.currencyMints = [...form.currencyMints, base]
    }
  } else {
    form.currencyMints = form.currencyMints.filter((c) => c.mint !== base.mint)
  }
}


async function lookupAndAddCurrency() {
  const mint = newCurrencyMint.value.trim()
  if (!mint || mint.length < 32) {
    addCurrencyError.value = 'Invalid mint address'
    return
  }
  const baseMints = new Set(BASE_CURRENCY_MINTS.map((b) => b.mint))
  if (baseMints.has(mint)) {
    addCurrencyError.value = 'Already in base currencies'
    return
  }
  if (form.currencyMints.some((c) => c.mint === mint)) {
    addCurrencyError.value = 'Currency already added'
    return
  }
  addCurrencyError.value = ''
  const item: CurrencyMint = {
    mint,
    name: '',
    symbol: '',
    _loading: true,
  }
  form.currencyMints.push(item)
  newCurrencyMint.value = ''
  const idx = form.currencyMints.length - 1
  try {
    const res = await fetch(`${apiBase.value}${API_V1}/marketplace/asset-preview/spl/${encodeURIComponent(mint)}`)
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`)
    }
    const data = (await res.json()) as { name?: string; symbol?: string; image?: string; decimals?: number; sellerFeeBasisPoints?: number }
    form.currencyMints[idx] = {
      mint,
      name: data.name ?? '',
      symbol: data.symbol ?? '',
      image: data.image ?? undefined,
      decimals: data.decimals ?? undefined,
      sellerFeeBasisPoints: data.sellerFeeBasisPoints ?? undefined,
    }
  } catch (e) {
    form.currencyMints[idx] = { ...item, _loading: false, _error: e instanceof Error ? e.message : 'Failed to load' }
  }
}

function removeCustomCurrency(idx: number) {
  const baseMints = new Set(BASE_CURRENCY_MINTS.map((b) => b.mint))
  const custom = form.currencyMints.filter((c) => !baseMints.has(c.mint))
  const removed = custom[idx]
  if (removed) {
    const i = form.currencyMints.indexOf(removed)
    if (i >= 0) form.currencyMints.splice(i, 1)
  }
}

function buildPayload(): Record<string, unknown> {
  return {
    collectionMints: form.collectionMints
      .filter((m) => !m._error)
      .map((m) => ({
        mint: m.mint,
        name: m.name,
        image: m.image,
        sellerFeeBasisPoints: m.sellerFeeBasisPoints,
        groupPath: m.groupPath,
        collectionSize: m.collectionSize,
        uniqueTraitCount: m.uniqueTraitCount,
        traitTypes: m.traitTypes,
      })),
    splAssetMints: form.splAssetMints
      .filter((m) => !m._error)
      .map((m) => ({ mint: m.mint, name: m.name, symbol: m.symbol, decimals: m.decimals, image: m.image, sellerFeeBasisPoints: m.sellerFeeBasisPoints })),
    currencyMints: form.currencyMints
      .filter((c) => !('_error' in c && c._error))
      .map((c) => ({ mint: c.mint, name: c.name ?? '', symbol: c.symbol ?? '', decimals: c.decimals, image: c.image, sellerFeeBasisPoints: c.sellerFeeBasisPoints })),
    shopFee: form.shopFee,
    whitelist: form.whitelist === 'use-default' ? 'use-default' : form.whitelist,
  }
}

const SAVE_TIMEOUT_MS = 30000

async function save(): Promise<boolean> {
  if (!props.slug || !canSave.value) return false
  saving.value = true
  emit('saving', true)
  saveError.value = null
  saveSuccess.value = false
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS)
    const res = await fetch(`${apiBase.value}${API_V1}/tenant/${tenantId.value}/marketplace-settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(buildPayload()),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      let msg = data.error ?? 'Failed to save'
      if (res.status === 401) msg = 'Sign in with your wallet to save. Session may have expired.'
      if (res.status === 403) msg = 'Admin access required.'
      throw new Error(msg)
    }
    const data = (await res.json()) as { settings?: Record<string, unknown> }
    saveSuccess.value = true
    setTimeout(() => { saveSuccess.value = false }, 3000)
    emit('saved', data.settings ?? {})
    return true
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      saveError.value = 'Request timed out. Check the server and try again.'
    } else {
      saveError.value = e instanceof Error ? e.message : 'Failed to save'
    }
    return false
  } finally {
    saving.value = false
    emit('saving', false)
  }
}

defineExpose({ save, form })
</script>

<style scoped>
.marketplace-settings {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-lg);
}

.marketplace-settings__hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin-bottom: var(--theme-space-md);
}

.marketplace-settings__add-title {
  font-size: var(--theme-font-md);
  margin-bottom: var(--theme-space-sm);
}

.marketplace-settings__add-mint {
  display: flex;
  gap: var(--theme-space-sm);
  align-items: flex-start;
  margin-bottom: var(--theme-space-md);
}

.marketplace-settings__add-mint .text-input {
  flex: 1;
}

.marketplace-settings__base-toggles {
  display: flex;
  gap: var(--theme-space-lg);
  flex-wrap: wrap;
  margin-bottom: var(--theme-space-md);
}

.marketplace-settings__checkbox {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  cursor: pointer;
  font-size: var(--theme-font-sm);
}

.marketplace-settings__custom {
  margin-top: var(--theme-space-md);
}

.marketplace-settings__spinner {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.marketplace-settings__fees {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.marketplace-settings__fee-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--theme-space-md);
}

@media (max-width: var(--theme-breakpoint-sm)) {
  .marketplace-settings__fee-row {
    grid-template-columns: minmax(0, 1fr);
  }
}

.marketplace-settings__actions {
  margin-top: var(--theme-space-md);
}

.marketplace-settings__error {
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
  margin-top: var(--theme-space-sm);
}

.marketplace-settings__success {
  font-size: var(--theme-font-sm);
  color: var(--theme-success, #22c55e);
  margin-top: var(--theme-space-sm);
}
</style>
