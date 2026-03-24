<template>
  <div class="mint-picker">
    <div class="mint-picker__add">
      <AddMintInput
        v-model="newMint"
        v-model:kind="selectedKind"
        :placeholder="inputPlaceholder"
        :error="addError"
        :loading="adding"
        :show-kind-selector="showKindSelector"
        :fine-print="hint"
        @submit="onAddSubmit"
      />
    </div>

    <div v-if="modelValue.nfts.length" class="mint-picker__section">
      <h4 class="mint-picker__section-title">NFT collections ({{ modelValue.nfts.length }})</h4>
      <ul class="mint-picker__list">
        <li
          v-for="(item, idx) in modelValue.nfts"
          :key="item.mint"
          class="mint-picker__item mint-picker__item--clickable"
        >
          <button
            type="button"
            class="mint-picker__row"
            :disabled="!!item._loading || !!item._error"
            @click="$emit('inspect-collection', item)"
          >
            <div class="mint-picker__thumb">
              <img v-if="item.image" :src="item.image" :alt="item.name ?? item.mint" />
              <span v-else class="mint-picker__thumb-placeholder"><Icon icon="lucide:image-off" /></span>
            </div>
            <div class="mint-picker__detail">
              <template v-if="item._loading">
                <Icon icon="lucide:loader-2" class="mint-picker__spinner" />
                <span class="mint-picker__name">{{ truncateAddress(item.mint, 8, 4) }}</span>
                <span class="mint-picker__status">Loading...</span>
              </template>
              <template v-else-if="item._error">
                <span class="mint-picker__name">{{ truncateAddress(item.mint, 8, 4) }}</span>
                <span class="mint-picker__error-text">{{ item._error }}</span>
              </template>
              <template v-else>
                <span class="mint-picker__name">{{ item.name || truncateAddress(item.mint, 8, 4) }}</span>
                <code class="mint-picker__address">{{ truncateAddress(item.mint, 8, 6) }}</code>
                <span class="mint-picker__meta">
                  {{ item.collectionSize ?? 0 }} NFTs, {{ item.uniqueTraitCount ?? 0 }} trait types
                </span>
              </template>
            </div>
          </button>
          <div class="mint-picker__actions">
            <span
              v-if="discordMints?.has(item.mint)"
              class="mint-picker__discord-badge"
              title="Used in Discord rules"
            >
              <Icon icon="ic:baseline-discord" />
            </span>
            <div v-if="showTrackingTiers" class="mint-picker__tier">
              <span class="mint-picker__tier-always">
                <Icon icon="lucide:check" class="mint-picker__tier-icon" />
                <span>Metadata</span>
              </span>
              <label class="mint-picker__check">
                <input
                  type="checkbox"
                  :checked="getTracking(item.mint).trackHolder"
                  @change="toggleHolder(item.mint, ($event.target as HTMLInputElement).checked)"
                />
                <span>Snapshots</span>
              </label>
              <label class="mint-picker__check mint-picker__check--disabled" :title="proTooltip">
                <input type="checkbox" :checked="false" disabled />
                <span>Transactions</span>
              </label>
            </div>
            <Button variant="ghost" :disabled="!!item._loading" @click.stop="removeNft(idx)">
              <Icon icon="lucide:x" />
            </Button>
          </div>
        </li>
      </ul>
    </div>

    <div v-if="modelValue.spl.length" class="mint-picker__section">
      <h4 class="mint-picker__section-title">SPL tokens ({{ modelValue.spl.length }})</h4>
      <ul class="mint-picker__list">
        <li
          v-for="(item, idx) in modelValue.spl"
          :key="item.mint"
          class="mint-picker__item mint-picker__item--clickable"
        >
          <button
            type="button"
            class="mint-picker__row"
            :disabled="!!item._loading || !!item._error"
            @click="$emit('inspect-spl', item)"
          >
            <div class="mint-picker__thumb">
              <img v-if="item.image" :src="item.image" :alt="item.name ?? item.symbol ?? item.mint" />
              <span v-else class="mint-picker__thumb-placeholder"><Icon icon="lucide:circle-dollar-sign" /></span>
            </div>
            <div class="mint-picker__detail">
              <template v-if="item._loading">
                <Icon icon="lucide:loader-2" class="mint-picker__spinner" />
                <span class="mint-picker__name">{{ truncateAddress(item.mint, 8, 4) }}</span>
                <span class="mint-picker__status">Loading...</span>
              </template>
              <template v-else-if="item._error">
                <span class="mint-picker__name">{{ truncateAddress(item.mint, 8, 4) }}</span>
                <span class="mint-picker__error-text">{{ item._error }}</span>
              </template>
              <template v-else>
                <span class="mint-picker__name">{{ (item.symbol || item.name) || truncateAddress(item.mint, 8, 4) }}</span>
                <code class="mint-picker__address">{{ truncateAddress(item.mint, 8, 6) }}</code>
                <span class="mint-picker__meta">
                  {{ item.name || '' }}{{ item.decimals != null ? ` · ${item.decimals} dec` : '' }}
                </span>
              </template>
            </div>
          </button>
          <div class="mint-picker__actions">
            <span
              v-if="discordMints?.has(item.mint)"
              class="mint-picker__discord-badge"
              title="Used in Discord rules"
            >
              <Icon icon="ic:baseline-discord" />
            </span>
            <div v-if="showTrackingTiers" class="mint-picker__tier">
              <span class="mint-picker__tier-always">
                <Icon icon="lucide:check" class="mint-picker__tier-icon" />
                <span>Metadata</span>
              </span>
              <label class="mint-picker__check">
                <input
                  type="checkbox"
                  :checked="getTracking(item.mint).trackHolder"
                  @change="toggleHolder(item.mint, ($event.target as HTMLInputElement).checked)"
                />
                <span>Snapshots</span>
              </label>
              <label class="mint-picker__check mint-picker__check--disabled" :title="proTooltip">
                <input type="checkbox" :checked="false" disabled />
                <span>Transactions</span>
              </label>
            </div>
            <Button variant="ghost" :disabled="!!item._loading" @click.stop="removeSpl(idx)">
              <Icon icon="lucide:x" />
            </Button>
          </div>
        </li>
      </ul>
    </div>

    <p v-if="!modelValue.spl.length && !modelValue.nfts.length" class="mint-picker__empty">
      No mints added yet. Enter a mint address above.
    </p>
  </div>
</template>

<script setup lang="ts">
import { truncateAddress } from '@decentraguild/display'
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import { useEnsureCatalogMint } from '~/composables/mint/useEnsureCatalogMint'
import AddMintInput from '~/components/mint/AddMintInput.vue'
import type { MintAssetPickerValue, MintKind, TrackingByMint, AddressBookEntry } from '~/types/mints'

const props = withDefaults(defineProps<{
  modelValue: MintAssetPickerValue
  addressBookEntries?: AddressBookEntry[]
  showTrackingTiers?: boolean
  trackingByMint?: TrackingByMint
  /** Set of mint addresses used in Discord rules. When provided, shows a Discord indicator on matching mints. */
  discordMints?: Set<string>
  maxItems?: number
  showKindSelector?: boolean
  label?: string
  hint?: string
}>(), {
  showKindSelector: true,
  showTrackingTiers: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: MintAssetPickerValue]
  'update:trackingByMint': [value: TrackingByMint]
  'mint-added': [mint: string, kind: MintKind]
  'mint-removed': [mint: string, kind: MintKind]
  /** When showAddressBookBrowser: user picked an entry (parent may upsert/refresh). */
  'address-book-select': [mint: string, entry: AddressBookEntry]
  'inspect-collection': [collection: Record<string, unknown>]
  'inspect-spl': [spl: import('~/types/mints').SplAssetMint]
  'error': [message: string]
}>()

const { ensureMint } = useEnsureCatalogMint()

const newMint = ref('')
const selectedKind = ref<'auto' | 'SPL' | 'NFT'>('auto')
const addError = ref('')
const adding = ref(false)

const proTooltip = 'Pro tier coming soon'

const inputPlaceholder = computed(() =>
  props.label ?? 'Mint or collection address',
)

function allMints(): Set<string> {
  const set = new Set<string>()
  for (const s of props.modelValue.spl) set.add(s.mint)
  for (const n of props.modelValue.nfts) set.add(n.mint)
  return set
}

function getTracking(mint: string) {
  return props.trackingByMint?.[mint] ?? { trackHolder: false, trackTransactions: false }
}

function toggleHolder(mint: string, checked: boolean) {
  const current = props.trackingByMint ?? {}
  const next: TrackingByMint = {
    ...current,
    [mint]: {
      ...(current[mint] ?? { trackHolder: false, trackTransactions: false }),
      trackHolder: checked,
    },
  }
  emit('update:trackingByMint', next)
}

function onAddSubmit(mint: string, kind: 'auto' | 'SPL' | 'NFT', entry?: AddressBookEntry) {
  if (entry) emit('address-book-select', mint, entry)
  void addMint(mint, kind)
}

async function addMint(mintArg?: string, kindArg?: 'auto' | 'SPL' | 'NFT') {
  const mint = (mintArg ?? newMint.value.trim()).trim()
  const kind = kindArg ?? selectedKind.value
  if (!mint || mint.length < 32) {
    addError.value = 'Invalid mint address'
    return
  }
  if (allMints().has(mint)) {
    addError.value = 'Mint already added'
    return
  }
  if (props.maxItems && (props.modelValue.spl.length + props.modelValue.nfts.length) >= props.maxItems) {
    addError.value = `Maximum ${props.maxItems} mints`
    return
  }

  addError.value = ''
  adding.value = true

  try {
    const ensured = await ensureMint(mint, kind === 'auto' ? undefined : kind)
    if (kind !== 'auto' && kind !== ensured.kind) {
      addError.value =
        ensured.kind === 'NFT'
          ? 'This mint is an NFT collection. Choose NFT or Auto-detect.'
          : 'This mint is an SPL token. Choose SPL or Auto-detect.'
      return
    }

    if (ensured.kind === 'SPL') {
      emit('update:modelValue', {
        ...props.modelValue,
        spl: [
          ...props.modelValue.spl,
          {
            mint,
            name: ensured.name ?? undefined,
            symbol: ensured.symbol ?? undefined,
            image: ensured.image ?? undefined,
            decimals: ensured.decimals ?? undefined,
          },
        ],
      })
      emit('mint-added', mint, 'SPL')
    } else {
      emit('update:modelValue', {
        ...props.modelValue,
        nfts: [
          ...props.modelValue.nfts,
          {
            mint,
            name: ensured.name ?? undefined,
            image: ensured.image ?? undefined,
            collectionSize: ensured.collectionSize ?? 0,
            uniqueTraitCount: ensured.uniqueTraitCount ?? 0,
            traitTypes: [],
          },
        ],
      })
      emit('mint-added', mint, 'NFT')
    }

    newMint.value = ''
    selectedKind.value = 'auto'
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to resolve mint'
    addError.value = msg
    emit('error', msg)
  } finally {
    adding.value = false
  }
}

function removeSpl(idx: number) {
  const removed = props.modelValue.spl[idx]
  const next = [...props.modelValue.spl]
  next.splice(idx, 1)
  emit('update:modelValue', { ...props.modelValue, spl: next })
  if (removed) emit('mint-removed', removed.mint, 'SPL')
}

function removeNft(idx: number) {
  const removed = props.modelValue.nfts[idx]
  const next = [...props.modelValue.nfts]
  next.splice(idx, 1)
  emit('update:modelValue', { ...props.modelValue, nfts: next })
  if (removed) emit('mint-removed', removed.mint, 'NFT')
}
</script>

<style scoped>
.mint-picker {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.mint-picker__section {
  margin-top: var(--theme-space-sm);
}

.mint-picker__section-title {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  color: var(--theme-text-secondary);
  margin-bottom: var(--theme-space-xs);
}

.mint-picker__list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.mint-picker__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--theme-space-sm);
  padding: var(--theme-space-sm) 0;
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.mint-picker__item:last-child {
  border-bottom: none;
}

.mint-picker__item--clickable .mint-picker__row {
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.mint-picker__item--clickable .mint-picker__row:hover:not(:disabled) {
  opacity: 0.9;
}

.mint-picker__row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-md);
  flex: 1;
  min-width: 0;
}

.mint-picker__row--plain {
  cursor: default;
}

button.mint-picker__row {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  color: inherit;
}

.mint-picker__thumb {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--theme-radius-sm, 4px);
  overflow: hidden;
  background: var(--theme-bg-muted);
}

.mint-picker__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mint-picker__thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--theme-text-muted);
  font-size: 1.25rem;
}

.mint-picker__detail {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mint-picker__name {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  font-family: var(--theme-font-mono, monospace);
}

.mint-picker__address {
  display: block;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  font-family: var(--theme-font-mono, monospace);
  word-break: break-all;
}

.mint-picker__meta {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.mint-picker__status {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.mint-picker__error-text {
  font-size: var(--theme-font-xs);
  color: var(--theme-error);
}

.mint-picker__actions {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  flex-shrink: 0;
}

.mint-picker__tier {
  display: flex;
  gap: var(--theme-space-md);
}

.mint-picker__check {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  font-size: var(--theme-font-xs);
  cursor: pointer;
  white-space: nowrap;
}

.mint-picker__check--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mint-picker__tier-always {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  white-space: nowrap;
}

.mint-picker__tier-icon {
  color: var(--theme-success, #22c55e);
  font-size: 0.85rem;
}

.mint-picker__discord-badge {
  display: flex;
  align-items: center;
  color: #5865f2;
  font-size: 1rem;
  flex-shrink: 0;
}

.mint-picker__empty {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.mint-picker__spinner {
  animation: mint-picker-spin 0.8s linear infinite;
}

@keyframes mint-picker-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
