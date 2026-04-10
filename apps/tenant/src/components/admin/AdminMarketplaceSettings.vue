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
        Paste any mint address or pick from your address book. Add payment tokens (for example USDC) as SPL assets here so they appear in trades and in the request list. Only legacy SPL tokens and standard (non-compressed) Metaplex NFTs are supported; Token-2022, Metaplex Core, and compressed NFTs are not supported until escrow is updated. New mints are added to the address book when you load them.
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
        CSV columns: kind (spl, nft; currency is treated as spl), mint, group_path (pipe-separated), store_bps (optional). Unknown mints are resolved against your tenant catalog when possible; otherwise metadata is fetched.
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
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
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
  canSave,
  marketplaceGateSelectValue,
  newMint,
  newMintKind,
  addMintError,
  adding,
  saving,
  saveError,
  saveSuccess,
  selectedMint,
  showMintModal,
  onGateSelectUpdate,
  onInspectMint,
  onDeleteMint,
  addMint,
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
