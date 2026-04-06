<template>
  <div class="admin__panel plan-shipment-tab">
    <h3>Plan Shipment</h3>
    <p class="plan-shipment-tab__hint">
      Load JSON, set up ship wallet, fund it, and execute the airdrop.
    </p>

    <div class="plan-shipment-tab__grid admin__card-grid--2">
      <div class="plan-shipment-tab__window plan-shipment-tab__window--plan">
        <h4 class="plan-shipment-tab__window-title">Plan shipment</h4>
        <div class="plan-shipment-tab__json-row">
          <textarea
            v-model="jsonInput"
            class="plan-shipment-tab__textarea"
            :placeholder="JSON_PLACEHOLDER"
          />
          <div class="plan-shipment-tab__json-actions">
            <Button variant="brand" size="sm" @click="openGenerateModal">
              Generate from conditions
            </Button>
            <Button
              v-if="loadedJson"
              variant="brand"
              size="sm"
              @click="copyJson"
            >
              Copy
            </Button>
            <Button
              v-if="loadedJson"
              variant="brand"
              size="sm"
              @click="downloadJson"
            >
              Download
            </Button>
          </div>
        </div>
        <p v-if="loadedJson" class="plan-shipment-tab__meta">
          {{ loadedJson.recipients.length }} recipients, total {{ totalAmount }} tokens, mint {{ truncateAddress(loadedJson.mint, 8, 6) }}
        </p>
        <p v-if="loadedJson" class="plan-shipment-tab__hint-sm">
          Register the mint for compression before shipping (one-time per mint). Creates token pool and ship wallet token account if needed.
        </p>
      </div>

      <div class="plan-shipment-tab__window plan-shipment-tab__window--wallet">
        <h4 class="plan-shipment-tab__window-title">Ship wallet</h4>
        <p class="plan-shipment-tab__wallet-copy">
          Create a ship wallet to carry your shipment. Fund it from your main wallet. Use it only for shipments – we never store or have access to your key.
        </p>
        <p class="plan-shipment-tab__hint-sm">
          The key is kept in this browser only (IndexedDB). Use Export for a backup. Other devices, profiles, or “clear site data” will not have it.
        </p>
        <div v-if="shipWallet.loading.value" class="plan-shipment-tab__loading">
          <Icon icon="lucide:loader-2" class="plan-shipment-tab__spinner" />
          Loading...
        </div>
        <template v-else-if="shipWallet.hasWallet.value">
          <div class="plan-shipment-tab__address-row">
            <code class="plan-shipment-tab__address">{{ truncateAddress(shipWallet.address.value ?? '', 12, 8) }}</code>
            <Button variant="ghost" size="sm" @click="copyAddress">
              <Icon icon="lucide:copy" />
            </Button>
          </div>
          <div class="plan-shipment-tab__balance-row">
            <span>SOL: {{ solBalance ?? '—' }}</span>
            <span v-if="mint">Token: {{ tokenBalance ?? '—' }}</span>
            <Button variant="ghost" size="sm" :disabled="balanceLoading" @click="refreshBalance">
              <Icon v-if="balanceLoading" icon="lucide:loader-2" class="plan-shipment-tab__spinner" />
              <Icon v-else icon="lucide:refresh-cw" />
            </Button>
          </div>
          <div class="plan-shipment-tab__wallet-actions">
            <Button variant="brand" size="sm" @click="exportSecret">
              Export
            </Button>
            <Button variant="ghost" size="sm" @click="removeWallet">
              Remove
            </Button>
          </div>
        </template>
        <template v-else>
          <div class="plan-shipment-tab__create-row">
            <Button
              variant="brand"
              :disabled="!shipWalletScoped || shipWallet.loading.value"
              @click="shipWallet.create()"
            >
              Create ship wallet
            </Button>
            <span class="plan-shipment-tab__or">or</span>
            <FormInput
              v-model="importKey"
              placeholder="Paste private key (Base58)"
              type="password"
              class="plan-shipment-tab__import-input"
            />
            <Button
              variant="brand"
              :disabled="!shipWalletScoped || !importKey.trim() || shipWallet.loading.value"
              @click="doImport"
            >
              Import
            </Button>
          </div>
        </template>
        <p v-if="shipWallet.error.value" class="plan-shipment-tab__error">{{ shipWallet.error.value }}</p>
        <div v-if="shipWallet.hasWallet.value" class="plan-shipment-tab__ship-actions">
          <Button
            variant="default"
            size="sm"
            :disabled="!canRegisterMint || registering"
            @click="registerConfirmOpen = true"
          >
            <Icon v-if="registering" icon="lucide:loader-2" class="plan-shipment-tab__spinner" />
            Register token account
          </Button>
          <Button
            variant="brand"
            :disabled="!canShip || shipping"
            @click="shipConfirmOpen = true"
          >
            <Icon v-if="shipping" icon="lucide:loader-2" class="plan-shipment-tab__spinner" />
            Ship
          </Button>
        </div>
        <p v-if="registerMessage" class="plan-shipment-tab__info">{{ registerMessage }}</p>
        <p v-if="shipError" class="plan-shipment-tab__error">{{ shipError }}</p>
      </div>
    </div>

    <div class="plan-shipment-tab__history-section">
      <h4 class="plan-shipment-tab__window-title">Shipment history</h4>
      <div v-if="historyLoading" class="plan-shipment-tab__loading">
        <Icon icon="lucide:loader-2" class="plan-shipment-tab__spinner" />
        Loading…
      </div>
      <div v-else-if="historyError" class="plan-shipment-tab__history-error-row">
        <p class="plan-shipment-tab__history-error">{{ historyError }}</p>
        <Button variant="outlineBrand" size="sm" @click="fetchHistory">
          Retry
        </Button>
      </div>
      <p v-else-if="historyRecords.length === 0" class="plan-shipment-tab__muted">No shipments yet.</p>
      <ul v-else class="plan-shipment-tab__history-list">
        <li
          v-for="r in historyRecords"
          :key="r.id"
          class="plan-shipment-tab__history-item"
        >
          <button
            type="button"
            class="plan-shipment-tab__history-row"
            @click="toggleExpanded(r.id)"
          >
            <span class="plan-shipment-tab__history-mint">{{ truncateAddress(r.mint, 8, 6) }}</span>
            <span class="plan-shipment-tab__history-meta">{{ r.recipient_count }} recipients</span>
            <span class="plan-shipment-tab__history-date">{{ formatDate(r.created_at) }}</span>
            <Icon :icon="expandedId === r.id ? 'lucide:chevron-down' : 'lucide:chevron-right'" />
          </button>
          <div v-if="expandedId === r.id" class="plan-shipment-tab__history-detail">
            <p class="plan-shipment-tab__history-mint-full"><code>{{ r.mint }}</code></p>
            <p class="plan-shipment-tab__history-amount">Total: {{ formatTotalAmount(r.total_amount) }}</p>
            <p
              v-for="row in shipmentTxRows(r.tx_signature)"
              :key="row.sig"
              class="plan-shipment-tab__history-tx"
            >
              <a :href="explorerLinks.txUrl(row.sig)" target="_blank" rel="noopener" class="plan-shipment-tab__link">
                <Icon icon="lucide:external-link" /> {{ row.label }}
              </a>
            </p>
            <p class="plan-shipment-tab__history-by">By {{ resolveWallet(r.created_by, 8, 6) }}</p>
            <p class="plan-shipment-tab__history-at">{{ formatDateTime(r.created_at) }}</p>
            <div v-if="leavesLoadingId === r.id" class="plan-shipment-tab__history-leaves-loading">
              Loading claim leaf ids…
            </div>
            <template v-else>
              <p v-if="leavesFor(r.id).length === 0" class="plan-shipment-tab__history-leaves-empty">
                No stored claim leaf ids (older shipment or indexer did not return leaves in time).
              </p>
              <ul v-else class="plan-shipment-tab__history-leaf-list">
                <li
                  v-for="(row, leafIdx) in leavesFor(r.id)"
                  :key="`${row.recipient_wallet}-${row.leaf_hash_decimal}-${leafIdx}`"
                  class="plan-shipment-tab__history-leaf-item"
                >
                  <div class="plan-shipment-tab__history-leaf-head">
                    <span>{{ truncateAddress(row.recipient_wallet, 6, 4) }}</span>
                    <span class="plan-shipment-tab__history-leaf-amount">{{ formatLeafAmount(r.mint, row.amount_raw) }}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      class="plan-shipment-tab__history-leaf-copy"
                      @click="copyLeafHash(row.leaf_hash_decimal)"
                    >
                      <Icon icon="lucide:copy" />
                    </Button>
                  </div>
                  <code class="plan-shipment-tab__history-leaf-hash">{{ row.leaf_hash_decimal }}</code>
                </li>
              </ul>
            </template>
          </div>
        </li>
      </ul>
    </div>

    <ConfirmTransactionModal
      v-model="registerConfirmOpen"
      title="Register token account"
      fee="~0.002 SOL"
      :loading="registering"
      @confirm="onRegisterConfirm"
    >
      <p>This will create the token pool for compression and your ship wallet's token account for this mint.</p>
    </ConfirmTransactionModal>

    <ConfirmTransactionModal
      v-model="shipConfirmOpen"
      title="Ship"
      :fee="shipFeeEstimate"
      :loading="shipping"
      @confirm="onShipConfirm"
    >
      <p v-if="loadedJson">
        This will compress and send tokens to {{ loadedJson.recipients.length }} recipient{{ loadedJson.recipients.length === 1 ? '' : 's' }}.
        Total: {{ totalAmount.toLocaleString(undefined, { maximumFractionDigits: 6 }) }} tokens.
      </p>
    </ConfirmTransactionModal>

    <SimpleModal
      v-if="generateModalOpen"
      :model-value="generateModalOpen"
      title="Generate from conditions"
      @update:model-value="updateGenerateModalOpen"
    >
      <div class="plan-shipment-tab__generate-modal">
        <ConditionSetCatalog
          :items="rulesCatalogFilteredItems"
          :loading="rulesCatalogLoading"
          :error="rulesCatalogError"
          :filter="rulesCatalogFilter"
          :show-filter="true"
          :active-id="generateRuleId ?? undefined"
          :hide-create-button="true"
          :hide-delete-button="true"
          @select="(item) => (generateRuleId = item.id)"
          @edit="(item) => goToConditionsEdit(item.id)"
          @delete="() => {}"
          @create="goToConditions"
          @update:filter="setRulesCatalogFilter"
        />
        <div v-if="generateRuleId" class="plan-shipment-tab__generate-form">
          <div v-if="isWeightedRule" class="plan-shipment-tab__generate-row">
            <label class="plan-shipment-tab__generate-label">Total amount to drop</label>
            <FormInput v-model="generateTotalAmountStr" type="number" placeholder="e.g. 10000" min="0" />
          </div>
          <div v-else class="plan-shipment-tab__generate-row">
            <label class="plan-shipment-tab__generate-label">Fixed amount (per recipient)</label>
            <FormInput v-model="generateFixedAmountStr" type="number" placeholder="e.g. 100" min="0" />
          </div>
          <div class="plan-shipment-tab__generate-row">
            <label class="plan-shipment-tab__generate-label">Token mint</label>
            <div class="plan-shipment-tab__generate-mint-row">
              <FormInput v-model="generateMint" placeholder="SPL token mint address" class="plan-shipment-tab__generate-mint-input" />
              <Button variant="outlineBrand" size="sm" @click="addressBookModalOpen = true">
                <Icon icon="lucide:book-open" />
                Browse
              </Button>
            </div>
          </div>
          <div class="plan-shipment-tab__generate-actions">
            <Button
              variant="secondary"
              type="button"
              @click="closeGenerateModal"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              :disabled="!canGenerate || generating"
              @click="generateJson"
            >
              <Icon v-if="generating" icon="lucide:loader-2" class="plan-shipment-tab__spinner" />
              Generate
            </Button>
          </div>
        </div>
        <p class="plan-shipment-tab__generate-link">
          <NuxtLink :to="{ path: route.path, query: { ...route.query, tab: 'conditions' } }" @click="generateModalOpen = false">
            Create new condition set
          </NuxtLink>
        </p>
      </div>
    </SimpleModal>

    <AddressBookModal
      v-if="addressBookModalOpen"
      v-model="addressBookModalOpen"
      kind="SPL"
      @select="(m) => setGenerateMint(m)"
    />
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import AddressBookModal from '~/components/shared/AddressBookModal.vue'
import SimpleModal from '~/components/ui/simple-modal/SimpleModal.vue'
import ConfirmTransactionModal from '~/components/ui/confirm-transaction-modal/ConfirmTransactionModal.vue'
import ConditionSetCatalog from '~/components/gates/ConditionSetCatalog.vue'
import { truncateAddress, formatDate, formatDateTime, formatRawTokenAmount } from '@decentraguild/display'
import { fetchMintMetadataFromChain } from '@decentraguild/web3'
import { useMemberProfiles } from '~/composables/members/useMemberProfiles'
import { useShipWallet } from '~/composables/shipment/useShipWallet'
import { usePlanShipmentForm, JSON_PLACEHOLDER } from '~/composables/shipment/usePlanShipmentForm'
import { invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantStore } from '~/stores/tenant'
import { useShipmentHistory } from '~/composables/shipment/useShipmentHistory'
import { useShipmentGenerateModal } from '~/composables/shipment/useShipmentGenerateModal'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { useExplorerLinks } from '~/composables/core/useExplorerLinks'

defineProps<{
  slug: string
  moduleState: string
}>()

const route = useRoute()
const tenantStore = useTenantStore()
const { tenantId } = storeToRefs(tenantStore)
const shipWallet = useShipWallet()
const shipWalletScoped = computed(() => shipWallet.scopedToTenant.value)
const { connection, rpcUrl } = useSolanaConnection()
const explorerLinks = useExplorerLinks()
const { resolveWallet } = useMemberProfiles()
const supabase = useSupabase()

const mintDecimalsByMint = ref<Map<string, number>>(new Map())

async function ensureMintDecimals(mint: string) {
  const cur = mintDecimalsByMint.value
  if (cur.has(mint)) return
  const conn = connection.value
  if (!conn) return
  try {
    const meta = await fetchMintMetadataFromChain(conn, mint)
    const d = meta?.decimals
    if (d != null && Number.isFinite(d)) {
      mintDecimalsByMint.value = new Map(cur).set(mint, d)
    }
  } catch {
    void 0
  }
}

function formatLeafAmount(mint: string, raw: string): string {
  const d = mintDecimalsByMint.value.get(mint)
  if (d == null) return '?'
  return formatRawTokenAmount(raw, d, 'SPL')
}

function shipmentTxRows(txSignature: string): Array<{ sig: string; label: string }> {
  const sigs = txSignature
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return sigs.map((sig, i) => ({
    sig,
    label: sigs.length === 1 ? 'Transaction' : `Transaction ${i + 1}`,
  }))
}

const {
  records: historyRecords,
  loading: historyLoading,
  error: historyError,
  expandedId,
  leavesLoadingId,
  leavesFor,
  fetch: fetchHistory,
  toggleExpanded,
  formatTotalAmount,
} = useShipmentHistory(tenantId)

watch(expandedId, (id) => {
  if (id == null) return
  const r = historyRecords.value.find((x) => x.id === id)
  if (r?.mint) void ensureMintDecimals(r.mint)
})

const form = usePlanShipmentForm({
  connection,
  rpcUrl,
  tenantId,
  shipWalletAddress: shipWallet.address,
  hasWallet: shipWallet.hasWallet,
  getKeypair: () => shipWallet.getKeypair(),
  recordShipment: async (params) => {
    await invokeEdgeFunction(supabase, 'shipment', { action: 'record-shipment', tenantId: tenantId.value, ...params } as Record<string, unknown>)
  },
})

const {
  importKey, jsonInput, loadedJson, mint, totalAmount,
  canShip, canRegisterMint, solBalance, tokenBalance, balanceLoading,
  shipping, registering, registerMessage, shipError,
  setJson, refreshBalance, registerMint, ship,
} = form

const registerConfirmOpen = ref(false)
const shipConfirmOpen = ref(false)

const SHIP_FEE_PER_RECIPIENT = 0.0002
const shipFeeEstimate = computed(() => {
  const n = loadedJson.value?.recipients.length ?? 0
  if (n === 0) return ''
  const total = (SHIP_FEE_PER_RECIPIENT * n).toFixed(4)
  return `~${total} SOL (${n} recipient${n === 1 ? '' : 's'})`
})

const {
  open: generateModalOpen,
  addressBookModalOpen,
  generateRuleId,
  generateFixedAmountStr,
  generateTotalAmountStr,
  generateMint,
  generating,
  rulesCatalogFilteredItems,
  rulesCatalogFilter,
  setRulesCatalogFilter,
  rulesCatalogLoading,
  rulesCatalogError,
  isWeightedRule,
  canGenerate,
  openModal: openGenerateModal,
  closeModal: closeGenerateModal,
  setGenerateMint,
  generateJson,
} = useShipmentGenerateModal(tenantId, (json) => setJson(json as Parameters<typeof setJson>[0]))

function updateGenerateModalOpen(v: boolean) {
  if (!v) closeGenerateModal()
  else generateModalOpen.value = v
}

function goToConditions() {
  closeGenerateModal()
  navigateTo({ path: route.path, query: { ...route.query, tab: 'conditions' } })
}

function goToConditionsEdit(setId: number) {
  closeGenerateModal()
  navigateTo({ path: route.path, query: { ...route.query, tab: 'conditions', edit: String(setId) } })
}

function copyJson() {
  if (!loadedJson.value) return
  navigator.clipboard.writeText(JSON.stringify(loadedJson.value, null, 2))
}

function downloadJson() {
  if (!loadedJson.value) return
  const blob = new Blob([JSON.stringify(loadedJson.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `shipment-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

watch(
  () => [shipWallet.address.value, mint.value],
  () => { if (shipWallet.hasWallet.value) refreshBalance() },
  { immediate: true },
)

function copyLeafHash(leafHashDecimal: string) {
  void navigator.clipboard.writeText(leafHashDecimal)
}

function copyAddress() {
  const addr = shipWallet.address.value
  if (addr) navigator.clipboard.writeText(addr)
}

async function exportSecret() {
  const secret = await shipWallet.exportSecret()
  if (secret) navigator.clipboard.writeText(secret)
}

async function removeWallet() {
  if (confirm('Remove ship wallet? You will need to create or import again.')) {
    await shipWallet.remove()
  }
}

async function doImport() {
  await shipWallet.importWallet(importKey.value.trim())
  if (shipWallet.error.value) return
  importKey.value = ''
}

async function onRegisterConfirm() {
  await registerMint()
  if (!shipError.value) registerConfirmOpen.value = false
}

async function onShipConfirm() {
  await ship(fetchHistory)
  if (!shipError.value) shipConfirmOpen.value = false
}

onMounted(() => void fetchHistory())
</script>

<style scoped>
.plan-shipment-tab__hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin-bottom: var(--theme-space-lg);
  line-height: 1.5;
}
.plan-shipment-tab__grid {
  align-items: stretch;
}
.plan-shipment-tab__history-section {
  margin-top: var(--theme-space-lg);
  padding: var(--theme-space-lg);
  background: var(--theme-bg-card);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
}
.plan-shipment-tab__window {
  padding: var(--theme-space-lg);
  background: var(--theme-bg-card);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
  min-height: 0;
}
.plan-shipment-tab__window-title {
  font-size: var(--theme-font-md);
  font-weight: 600;
  margin: 0 0 var(--theme-space-xs);
}
.plan-shipment-tab__wallet-copy {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin: 0;
  line-height: 1.5;
}
.plan-shipment-tab__loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  font-size: var(--theme-font-sm);
}
.plan-shipment-tab__address-row,
.plan-shipment-tab__balance-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  margin-bottom: var(--theme-space-xs);
}
.plan-shipment-tab__address {
  font-size: var(--theme-font-sm);
  background: var(--theme-bg-secondary);
  padding: 2px var(--theme-space-xs);
  border-radius: var(--theme-radius-sm);
}
.plan-shipment-tab__wallet-actions {
  display: flex;
  gap: var(--theme-space-sm);
  margin-top: var(--theme-space-sm);
}
.plan-shipment-tab__create-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--theme-space-sm);
}
.plan-shipment-tab__or {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}
.plan-shipment-tab__import-input {
  max-width: 20rem;
  margin: 0;
}
.plan-shipment-tab__json-row {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
  margin-bottom: var(--theme-space-sm);
  flex: 1;
  min-height: 0;
}
.plan-shipment-tab__json-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-sm);
}
.plan-shipment-tab__generate-modal {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-lg);
  min-width: 20rem;
}
.plan-shipment-tab__generate-form {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}
.plan-shipment-tab__generate-row {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
}
.plan-shipment-tab__generate-label {
  font-size: var(--theme-font-sm);
  font-weight: 500;
  color: var(--theme-text-secondary);
}
.plan-shipment-tab__generate-mint-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
}
.plan-shipment-tab__generate-mint-input {
  flex: 1;
  min-width: 0;
}
.plan-shipment-tab__generate-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-sm);
  align-items: center;
}
.plan-shipment-tab__generate-link {
  font-size: var(--theme-font-sm);
  margin: 0;
}
.plan-shipment-tab__generate-link a {
  color: var(--theme-primary);
  text-decoration: none;
}
.plan-shipment-tab__generate-link a:hover {
  text-decoration: underline;
}
.plan-shipment-tab__textarea {
  width: 100%;
  flex: 1;
  min-height: 8rem;
  padding: var(--theme-space-sm);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background: var(--theme-bg-primary);
  color: var(--theme-text-primary);
  font-family: ui-monospace, monospace;
  font-size: var(--theme-font-sm);
  overflow-y: auto;
  resize: none;
}
.plan-shipment-tab__meta {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin: 0;
}
.plan-shipment-tab__hint-sm {
  font-size: var(--theme-font-xs, 0.75rem);
  color: var(--theme-text-muted);
  margin: var(--theme-space-xs) 0;
}
.plan-shipment-tab__ship-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-sm);
  margin-top: var(--theme-space-md);
}
.plan-shipment-tab__info {
  color: var(--theme-text-secondary);
  font-size: var(--theme-font-sm);
  margin-top: var(--theme-space-sm);
}
.plan-shipment-tab__error {
  color: var(--theme-error);
  font-size: var(--theme-font-sm);
  margin-top: var(--theme-space-sm);
}
.plan-shipment-tab__spinner {
  animation: plan-shipment-spin 1s linear infinite;
}
@keyframes plan-shipment-spin {
  to { transform: rotate(360deg); }
}

.plan-shipment-tab__history-error-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--theme-space-sm);
}
.plan-shipment-tab__history-error,
.plan-shipment-tab__muted {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin: 0;
}
.plan-shipment-tab__history-error {
  color: var(--theme-error);
}
.plan-shipment-tab__history-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.plan-shipment-tab__history-item {
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}
.plan-shipment-tab__history-item:last-child {
  border-bottom: none;
}
.plan-shipment-tab__history-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  width: 100%;
  padding: var(--theme-space-sm) 0;
  text-align: left;
  background: none;
  border: none;
  font: inherit;
  color: var(--theme-text-primary);
  cursor: pointer;
}
.plan-shipment-tab__history-row:hover {
  color: var(--theme-text-primary);
}
.plan-shipment-tab__history-mint {
  font-family: var(--theme-font-mono, monospace);
  font-size: var(--theme-font-xs);
  flex-shrink: 0;
}
.plan-shipment-tab__history-meta {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  flex: 1;
  min-width: 0;
}
.plan-shipment-tab__history-date {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}
.plan-shipment-tab__history-detail {
  padding: var(--theme-space-sm) 0 var(--theme-space-md);
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
}
.plan-shipment-tab__history-detail p {
  margin: 0 0 var(--theme-space-xs);
}
.plan-shipment-tab__history-mint-full code {
  font-size: 10px;
  word-break: break-all;
}
.plan-shipment-tab__link {
  color: var(--theme-primary);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.plan-shipment-tab__link:hover {
  text-decoration: underline;
}
.plan-shipment-tab__history-leaves-loading,
.plan-shipment-tab__history-leaves-empty {
  margin-top: var(--theme-space-sm);
  color: var(--theme-text-muted);
}
.plan-shipment-tab__history-leaf-list {
  list-style: none;
  margin: var(--theme-space-sm) 0 0;
  padding: 0;
}
.plan-shipment-tab__history-leaf-item {
  margin-bottom: var(--theme-space-sm);
  font-size: 10px;
}
.plan-shipment-tab__history-leaf-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--theme-space-xs);
}
.plan-shipment-tab__history-leaf-amount {
  color: var(--theme-text-muted);
}
.plan-shipment-tab__history-leaf-hash {
  display: block;
  margin-top: 2px;
  word-break: break-all;
  font-size: 9px;
  color: var(--theme-text-secondary);
}
.plan-shipment-tab__history-leaf-copy {
  margin-left: auto;
}

</style>
