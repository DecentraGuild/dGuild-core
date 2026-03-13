<template>
  <div class="admin__panel plan-shipment-tab">
    <h3>Plan Shipment</h3>
    <p class="plan-shipment-tab__hint">
      Load JSON, set up ship wallet, fund it, and execute the airdrop.
    </p>

    <div class="plan-shipment-tab__layout">
      <div class="plan-shipment-tab__plan">
        <div class="plan-shipment-tab__ship-wallet">
          <h4>Ship wallet</h4>
          <p class="plan-shipment-tab__wallet-copy">
            Create a ship wallet to carry your shipment. Fund it from your main wallet. Use it only for shipments – we never store or have access to your key.
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
              <Button variant="secondary" size="sm" @click="exportSecret">
                Export
              </Button>
              <Button variant="ghost" size="sm" @click="removeWallet">
                Remove
              </Button>
            </div>
          </template>
          <template v-else>
            <div class="plan-shipment-tab__create-row">
              <Button variant="secondary" :disabled="shipWallet.loading.value" @click="shipWallet.create()">
                Create ship wallet
              </Button>
              <span class="plan-shipment-tab__or">or</span>
              <FormInput
                v-model="importKey"
                placeholder="Paste private key (Base58)"
                type="password"
                class="plan-shipment-tab__import-input"
              />
              <Button variant="secondary" :disabled="!importKey.trim() || shipWallet.loading.value" @click="doImport">
                Import
              </Button>
            </div>
          </template>
          <p v-if="shipWallet.error.value" class="plan-shipment-tab__error">{{ shipWallet.error.value }}</p>
        </div>

        <div class="plan-shipment-tab__json-section">
          <h4>Recipient list</h4>
          <div class="plan-shipment-tab__json-row">
            <textarea
              v-model="jsonInput"
              class="plan-shipment-tab__textarea"
              :placeholder="JSON_PLACEHOLDER"
              rows="4"
            />
            <Button variant="secondary" size="sm" @click="loadFromSession">
              Load from Shipment List
            </Button>
          </div>
          <p v-if="loadedJson" class="plan-shipment-tab__meta">
            {{ loadedJson.recipients.length }} recipients, total {{ totalAmount }} tokens, mint {{ truncateAddress(loadedJson.mint, 8, 6) }}
          </p>
          <p v-if="loadedJson" class="plan-shipment-tab__hint-sm">
            If you get "No active state tree infos", register the mint for compression first (one-time per mint).
          </p>
          <Button
            v-if="loadedJson && canRegisterMint"
            variant="outline"
            size="sm"
            :disabled="registering"
            @click="registerMint"
          >
            <Icon v-if="registering" icon="lucide:loader-2" class="plan-shipment-tab__spinner" />
            Register mint for compression
          </Button>
        </div>

        <div class="plan-shipment-tab__ship-actions">
          <Button
            variant="default"
            :disabled="!canShip || shipping"
            @click="onShip"
          >
            <Icon v-if="shipping" icon="lucide:loader-2" class="plan-shipment-tab__spinner" />
            Ship
          </Button>
        </div>
        <p v-if="registerMessage" class="plan-shipment-tab__info">{{ registerMessage }}</p>
        <p v-if="shipError" class="plan-shipment-tab__error">{{ shipError }}</p>
      </div>

      <aside class="plan-shipment-tab__history">
        <h4>Shipment history</h4>
        <div v-if="history.loading" class="plan-shipment-tab__loading">
          <Icon icon="lucide:loader-2" class="plan-shipment-tab__spinner" />
          Loading…
        </div>
        <p v-else-if="history.error" class="plan-shipment-tab__history-error">{{ history.error }}</p>
        <p v-else-if="history.records.length === 0" class="plan-shipment-tab__muted">No shipments yet.</p>
        <ul v-else class="plan-shipment-tab__history-list">
          <li
            v-for="r in history.records"
            :key="r.id"
            class="plan-shipment-tab__history-item"
          >
            <button
              type="button"
              class="plan-shipment-tab__history-row"
              @click="expandedId = expandedId === r.id ? null : r.id"
            >
              <span class="plan-shipment-tab__history-mint">{{ truncateAddress(r.mint, 8, 6) }}</span>
              <span class="plan-shipment-tab__history-meta">{{ r.recipient_count }} recipients</span>
              <span class="plan-shipment-tab__history-date">{{ formatDate(r.created_at) }}</span>
              <Icon :icon="expandedId === r.id ? 'lucide:chevron-down' : 'lucide:chevron-right'" />
            </button>
            <div v-if="expandedId === r.id" class="plan-shipment-tab__history-detail">
              <p class="plan-shipment-tab__history-mint-full"><code>{{ r.mint }}</code></p>
              <p class="plan-shipment-tab__history-amount">Total: {{ formatTotalAmount(r.total_amount) }}</p>
              <p class="plan-shipment-tab__history-tx">
                <a :href="explorerLinks.txUrl(r.tx_signature)" target="_blank" rel="noopener" class="plan-shipment-tab__link">
                  <Icon icon="lucide:external-link" /> Transaction
                </a>
              </p>
              <p class="plan-shipment-tab__history-by">By {{ truncateAddress(r.created_by, 8, 6) }}</p>
              <p class="plan-shipment-tab__history-at">{{ formatDateTime(r.created_at) }}</p>
            </div>
          </li>
        </ul>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import { truncateAddress } from '@decentraguild/display'
import { useShipWallet } from '~/composables/shipment/useShipWallet'
import { usePlanShipmentForm, JSON_PLACEHOLDER } from '~/composables/shipment/usePlanShipmentForm'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantStore } from '~/stores/tenant'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { useShipmentHistory } from '~/composables/shipment/useShipmentHistory'
import { useExplorerLinks } from '~/composables/core/useExplorerLinks'

defineProps<{
  slug: string
  moduleState: string
}>()

const tenantStore = useTenantStore()
const tenantId = computed(() => tenantStore.tenantId)
const shipWallet = useShipWallet()
const { connection, rpcUrl } = useSolanaConnection()
const explorerLinks = useExplorerLinks()
const supabase = useSupabase()

const history = useShipmentHistory(tenantId)
const expandedId = ref<number | null>(null)

const form = usePlanShipmentForm({
  connection,
  rpcUrl,
  tenantId,
  shipWalletAddress: shipWallet.address,
  hasWallet: shipWallet.hasWallet,
  getKeypair: () => shipWallet.getKeypair(),
  recordShipment: async (params) => {
    await supabase.functions.invoke('shipment', {
      body: {
        action: 'record-shipment',
        tenantId: tenantId.value,
        ...params,
      },
    })
  },
})

const {
  importKey,
  jsonInput,
  loadedJson,
  mint,
  totalAmount,
  canShip,
  canRegisterMint,
  solBalance,
  tokenBalance,
  balanceLoading,
  shipping,
  registering,
  registerMessage,
  shipError,
  loadFromSession,
  refreshBalance,
  registerMint,
  ship,
} = form

watch(
  () => [shipWallet.address.value, mint.value],
  () => {
    if (shipWallet.hasWallet.value) refreshBalance()
  },
  { immediate: true }
)

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

async function onShip() {
  await ship(history.fetch)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatTotalAmount(raw: string): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

watch(
  tenantId,
  (id) => {
    if (id) history.fetch()
  },
  { immediate: true }
)

onMounted(() => {
  loadFromSession()
})
</script>

<style scoped>
.plan-shipment-tab__hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin-bottom: var(--theme-space-lg);
  line-height: 1.5;
}
.plan-shipment-tab__ship-wallet,
.plan-shipment-tab__json-section {
  margin-bottom: var(--theme-space-lg);
}
.plan-shipment-tab__ship-wallet h4,
.plan-shipment-tab__json-section h4 {
  font-size: var(--theme-font-md);
  margin: 0 0 var(--theme-space-sm);
}
.plan-shipment-tab__wallet-copy {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin: 0 0 var(--theme-space-md);
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
}
.plan-shipment-tab__textarea {
  width: 100%;
  max-width: 36rem;
  padding: var(--theme-space-sm);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background: var(--theme-bg-primary);
  color: var(--theme-text-primary);
  font-family: ui-monospace, monospace;
  font-size: var(--theme-font-sm);
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

.plan-shipment-tab__layout {
  display: grid;
  grid-template-columns: 1fr minmax(280px, 320px);
  gap: var(--theme-space-xl);
  align-items: start;
}
.plan-shipment-tab__plan {
  min-width: 0;
}
.plan-shipment-tab__history {
  padding: var(--theme-space-lg);
  background: var(--theme-bg-card);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  position: sticky;
  top: var(--theme-space-md);
}
.plan-shipment-tab__history h4 {
  font-size: var(--theme-font-md);
  margin: 0 0 var(--theme-space-md);
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

@media (max-width: 900px) {
  .plan-shipment-tab__layout {
    grid-template-columns: 1fr;
  }
}
</style>
