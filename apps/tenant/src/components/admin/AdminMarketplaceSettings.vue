<template>
  <div class="marketplace-settings">
    <Card>
      <GateSelectRowModule
        layout="stacked"
        :slug="slug"
        :model-value="marketplaceGateSelectValue"
        title="Who can see Marketplace"
        hint="Who can see Marketplace. Use dGuild default, admins only, public, or a specific list."
        show-use-default
        show-admin-only
        @update:model-value="onGateSelectUpdate"
      />
    </Card>
    <Card>
      <h3>Mint catalog</h3>
      <p class="marketplace-settings__hint">
        Paste any mint address or pick from your address book. Only legacy SPL tokens and standard (non-compressed) Metaplex NFTs are supported for trades; Token-2022, Metaplex Core, and compressed NFTs are hidden here until escrow supports them. New mints are added to the address book automatically when you load them here.
      </p>

      <AdminMintCatalog
        :mints="catalogItems"
        @inspect="onInspectMint"
        @delete="onDeleteMint"
      >
        <template #item-extra="{ item }">
          <div class="marketplace-settings__tree-fields">
            <input
              type="text"
              class="marketplace-settings__tree-input"
              :value="groupPathDisplay(item)"
              placeholder="Browse path (A|B|C)"
              :disabled="saving || !!item._loading"
              @change="onGroupPathChange(item, ($event.target as HTMLInputElement).value)"
            />
          </div>
        </template>
        <template #add>
          <h4 class="marketplace-settings__add-title">Add tradable mint</h4>
          <div class="marketplace-settings__add-mint">
            <AddMintInput
              v-model="newMint"
              v-model:kind="newMintKind"
              require-marketplace-escrow-support
              :error="addMintError"
              :loading="adding"
              :disabled="saving"
              @submit="(mint, kind, entry) => addMint(mint, kind, entry)"
            />
          </div>
        </template>
      </AdminMintCatalog>
    </Card>

    <Card>
      <h3>Import / export mint list</h3>
      <p class="marketplace-settings__hint">
        CSV columns: kind (spl, nft, currency), mint, group_path (pipe-separated). Unknown mints are resolved against your tenant catalog when possible; otherwise metadata is fetched.
      </p>
      <div class="marketplace-settings__csv-actions">
        <Button type="button" variant="outline" :disabled="saving" @click="downloadMintListTemplate">
          Download template
        </Button>
        <Button type="button" variant="outline" :disabled="saving" @click="downloadMintListExport">
          Export CSV
        </Button>
        <Button type="button" variant="outline" :disabled="saving || csvImporting" @click="triggerMintListCsvPick">
          {{ csvImporting ? 'Importing…' : 'Import CSV' }}
        </Button>
        <input
          ref="mintListCsvInput"
          type="file"
          accept=".csv,text/csv"
          class="marketplace-settings__csv-file"
          @change="onMintListCsvFile"
        />
      </div>
      <p
        v-if="csvImportSummary"
        :class="csvImportErrors ? 'marketplace-settings__csv-warning' : 'marketplace-settings__success'"
      >
        {{ csvImportSummary }}
      </p>
      <pre v-if="csvImportErrors" class="marketplace-settings__csv-errors">{{ csvImportErrors }}</pre>
    </Card>

    <Card>
      <h3>Currencies</h3>
      <p class="marketplace-settings__hint">Select which trades Royalty and Shop fee bps counts. Base: SOL, WBTC, USDC, USDT. Add custom by mint. Not yet active in the smart contract.</p>
      <fieldset disabled class="marketplace-settings__disabled-fieldset">
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
          <h4 class="marketplace-settings__add-title">Custom currencies</h4>
          <div class="marketplace-settings__add-mint">
            <AddMintInput
              v-model="newCurrencyMint"
              v-model:kind="newCurrencyKind"
              book-kind="SPL"
              hide-book-base-mints
              :error="addCurrencyError"
              :disabled="saving"
              @submit="addCurrencyFromInput"
            />
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
                  <span v-else class="marketplace-settings__mint-thumb-placeholder"><Icon icon="lucide:banknote" /></span>
                </div>
                <div class="marketplace-settings__mint-detail">
                  <template v-if="c._loading">
                    <Icon icon="lucide:loader-2" class="marketplace-settings__spinner" />
                    <span class="marketplace-settings__mint-name">{{ truncateAddress(c.mint, 8, 4) }}</span>
                    <span class="marketplace-settings__mint-status">Loading...</span>
                  </template>
                  <template v-else-if="c._error">
                    <span class="marketplace-settings__mint-name">{{ truncateAddress(c.mint, 8, 4) }}</span>
                    <span class="marketplace-settings__mint-error">{{ c._error }}</span>
                  </template>
                  <template v-else>
                    <span class="marketplace-settings__mint-name">{{ (c.symbol || c.name) || truncateAddress(c.mint, 8, 4) }}</span>
                    <code class="marketplace-settings__mint-address">{{ truncateAddress(c.mint, 8, 6) }}</code>
                    <span class="marketplace-settings__mint-meta">
                      {{ c.name || '' }} {{ c.decimals != null ? `· ${c.decimals} dec` : '' }}
                      {{ c.sellerFeeBasisPoints != null ? `· ${c.sellerFeeBasisPoints} bps` : '' }}
                    </span>
                  </template>
                </div>
              </div>
              <Button variant="ghost" :disabled="!!c._loading" @click="removeCustomCurrency(idx)">
                <Icon icon="lucide:x" />
              </Button>
            </li>
          </ul>
        </div>
      </fieldset>
    </Card>

    <Card>
      <h3>Marketplace fees</h3>
      <p class="marketplace-settings__hint">
        These fees will be enforced at the escrow program level. Fields are shown here for planning but are not yet active.
      </p>
      <div class="marketplace-settings__fees">
        <FormInput
          v-model="form.shopFee.wallet"
          label="Fee wallet"
          placeholder="Wallet to receive marketplace fees"
          disabled
        />
        <div class="marketplace-settings__fee-row admin__card-grid--2-sm">
          <FormInput
            :model-value="String(form.shopFee.makerFlatFee ?? 0)"
            label="Maker flat fee (SOL)"
            type="number"
            disabled
            @update:model-value="form.shopFee.makerFlatFee = Number($event) || 0"
          />
          <FormInput
            :model-value="String(form.shopFee.takerFlatFee ?? 0)"
            label="Taker flat fee (SOL)"
            type="number"
            disabled
            @update:model-value="form.shopFee.takerFlatFee = Number($event) || 0"
          />
        </div>
        <div class="marketplace-settings__fee-row admin__card-grid--2-sm">
          <FormInput
            :model-value="String(form.shopFee.makerPercentFee ?? 0)"
            label="Maker fee (bps)"
            type="number"
            disabled
            @update:model-value="form.shopFee.makerPercentFee = Number($event) || 0"
          />
          <FormInput
            :model-value="String(form.shopFee.takerPercentFee ?? 0)"
            label="Taker fee (bps)"
            type="number"
            disabled
            @update:model-value="form.shopFee.takerPercentFee = Number($event) || 0"
          />
        </div>
      </div>
    </Card>

    <div class="marketplace-settings__actions">
      <Button
        variant="default"
        :disabled="saving || !canSave"
        @click="save"
      >
        {{ saving ? 'Saving...' : saveSuccess ? 'Saved' : canSave ? 'Save Marketplace Settings' : 'Complete loading before saving' }}
      </Button>
      <p v-if="saveSuccess" class="marketplace-settings__success">Settings saved.</p>
      <p v-else-if="saveError" class="marketplace-settings__error">{{ saveError }}</p>
    </div>

    <MintDetailModal v-model="showMintModal" :mint="selectedMint" :tenant-id="tenantId ?? ''" />
  </div>
</template>

<script setup lang="ts">
import { truncateAddress } from '@decentraguild/display'
import { BASE_CURRENCY_MINTS } from '@decentraguild/core'
import { Card } from '~/components/ui/card'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import { Button } from '~/components/ui/button'
import { Icon } from '@iconify/vue'
import { computed, ref } from 'vue'
import { useMarketplaceSettings } from '~/composables/marketplace/useMarketplaceSettings'
import { parsePipeGroupPath, serializeGroupPathForCsv, serializeMarketplaceMintCsv } from '~/utils/marketplaceMintCsv'
import type { CatalogMintItem } from '~/types/mints'
import AdminMintCatalog from './AdminMintCatalog.vue'
import MintDetailModal from '~/components/mint/MintDetailModal/index.vue'
import AddMintInput from '~/components/mint/AddMintInput.vue'

const props = defineProps<{
  slug: string
  settings: Record<string, unknown> | null
}>()

const emit = defineEmits<{
  saved: [settings: Record<string, unknown>]
  saving: [value: boolean]
}>()

const tenantId = computed(() => useTenantStore().tenantId ?? null)
const {
  form,
  catalogItems,
  customCurrencies,
  canSave,
  marketplaceGateSelectValue,
  newMint,
  newMintKind,
  addMintError,
  adding,
  newCurrencyMint,
  newCurrencyKind,
  addCurrencyError,
  saving,
  saveError,
  saveSuccess,
  selectedMint,
  showMintModal,
  onGateSelectUpdate,
  onInspectMint,
  onDeleteMint,
  addMint,
  onBaseToggle,
  addCurrencyFromInput,
  removeCustomCurrency,
  save,
  exportMintListCsv,
  importMintListCsv,
} = useMarketplaceSettings({
  slug: () => props.slug,
  settings: () => props.settings,
  emit: (_, payload) => emit('saved', payload),
  emitSaving: (value) => emit('saving', value),
})

const mintListCsvInput = ref<HTMLInputElement | null>(null)
const csvImporting = ref(false)
const csvImportSummary = ref<string | null>(null)
const csvImportErrors = ref<string | null>(null)

function downloadMintListTemplate() {
  const csv = serializeMarketplaceMintCsv([])
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'marketplace-mints-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function downloadMintListExport() {
  const csv = exportMintListCsv()
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'marketplace-mints.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function triggerMintListCsvPick() {
  mintListCsvInput.value?.click()
}

async function onMintListCsvFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  csvImporting.value = true
  csvImportSummary.value = null
  csvImportErrors.value = null
  try {
    const text = await file.text()
    const r = await importMintListCsv(text)
    const n = r.errors.length
    if (n) {
      csvImportSummary.value =
        r.applied > 0
          ? `Imported ${r.applied} row(s). ${n} issue${n === 1 ? '' : 's'} (skipped lines or unresolved mints) — see list below.`
          : `No rows imported. ${n} issue${n === 1 ? '' : 's'} — see list below.`
    } else {
      csvImportSummary.value = `Imported ${r.applied} row(s).`
    }
    csvImportErrors.value = n ? r.errors.join('\n') : null
  } catch (e) {
    csvImportErrors.value = e instanceof Error ? e.message : 'Import failed'
  } finally {
    csvImporting.value = false
    input.value = ''
  }
}

function groupPathDisplay(item: CatalogMintItem): string {
  if (item.kind === 'NFT') {
    const m = form.collectionMints.find((x) => x.mint === item.mint)
    return m?.groupPath?.length ? serializeGroupPathForCsv(m.groupPath) : ''
  }
  const m = form.splAssetMints.find((x) => x.mint === item.mint)
  return m?.groupPath?.length ? serializeGroupPathForCsv(m.groupPath) : ''
}

function onGroupPathChange(item: CatalogMintItem, raw: string) {
  const path = parsePipeGroupPath(raw)
  if (item.kind === 'NFT') {
    const m = form.collectionMints.find((x) => x.mint === item.mint)
    if (m) m.groupPath = path.length ? path : undefined
  } else {
    const m = form.splAssetMints.find((x) => x.mint === item.mint)
    if (m) m.groupPath = path.length ? path : undefined
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
  width: 100%;
  margin-bottom: var(--theme-space-md);
}

.marketplace-settings__add-mint :deep(.add-mint-input) {
  width: 100%;
  min-width: 0;
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

.marketplace-settings__mint-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.marketplace-settings__mint-item {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  padding: var(--theme-space-xs) 0;
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.marketplace-settings__mint-item:last-child {
  border-bottom: none;
}

.marketplace-settings__mint-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-md);
  flex: 1;
  min-width: 0;
}

.marketplace-settings__mint-thumb {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--theme-radius-sm);
  overflow: hidden;
  background: var(--theme-bg-muted);
}

.marketplace-settings__mint-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.marketplace-settings__mint-thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--theme-text-muted);
}

.marketplace-settings__mint-detail {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
  min-width: 0;
}

.marketplace-settings__mint-name {
  font-size: var(--theme-font-sm);
  font-weight: 500;
}

.marketplace-settings__mint-address {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.marketplace-settings__mint-meta,
.marketplace-settings__mint-status,
.marketplace-settings__mint-error {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.marketplace-settings__mint-error {
  color: var(--theme-error);
}

.marketplace-settings__spinner {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.marketplace-settings__disabled-fieldset {
  border: none;
  padding: 0;
  margin: 0;
  opacity: 0.5;
  cursor: not-allowed;
}

.marketplace-settings__fees {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
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

.marketplace-settings__csv-warning {
  font-size: var(--theme-font-sm);
  color: var(--theme-warning);
  margin-top: var(--theme-space-sm);
}

.marketplace-settings__tree-fields {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-xs);
  align-items: center;
  max-width: min(360px, 100%);
}

.marketplace-settings__tree-input {
  font-size: var(--theme-font-xs);
  padding: var(--theme-space-2xs) var(--theme-space-xs);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  background: var(--theme-bg);
  color: var(--theme-text-primary);
  min-width: 0;
  flex: 1 1 12rem;
}

.marketplace-settings__csv-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-sm);
  align-items: center;
  margin-bottom: var(--theme-space-sm);
}

.marketplace-settings__csv-file {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.marketplace-settings__csv-errors {
  font-size: var(--theme-font-xs);
  color: var(--theme-error);
  margin-top: var(--theme-space-sm);
  white-space: pre-wrap;
  max-height: 12rem;
  overflow-y: auto;
}
</style>
