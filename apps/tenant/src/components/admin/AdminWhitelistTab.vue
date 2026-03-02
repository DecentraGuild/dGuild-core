<template>
  <div class="admin__split">
    <div class="admin__panel">
      <h3>Whitelists</h3>

      <div class="whitelist-tab__list-select">
        <select
          v-model="selectedListAddress"
          class="whitelist-tab__select"
          :disabled="loading || creating"
        >
          <option value="">
            {{ lists.length ? 'Select a list...' : 'No lists yet' }}
          </option>
          <option
            v-for="list in lists"
            :key="list.address"
            :value="list.address"
          >
            {{ list.name }} ({{ list.address.slice(0, 8) }}...)
          </option>
        </select>
        <div class="whitelist-tab__list-actions">
          <Button
            variant="secondary"
            size="sm"
            :disabled="loading || creating"
            @click="showCreateModal = true"
          >
            Create list
          </Button>
          <Button
            v-if="selectedListAddress"
            variant="ghost"
            size="sm"
            :disabled="deleting"
            @click="confirmDelete"
          >
            Delete list
          </Button>
        </div>
      </div>

      <div v-if="selectedList" class="whitelist-tab__entries">
        <h4>Entries</h4>
        <div class="whitelist-tab__add-wallet">
          <TextInput
            v-model="walletToAdd"
            placeholder="Wallet address"
            :error="addError"
            :disabled="adding"
            @keydown.enter.prevent="addWallet"
          />
          <Button
            variant="secondary"
            :disabled="!walletToAdd.trim() || adding"
            @click="addWallet"
          >
            Add
          </Button>
        </div>
        <ul v-if="entries.length" class="whitelist-tab__entry-list">
          <li
            v-for="e in entries"
            :key="e.wallet"
            class="whitelist-tab__entry-item"
          >
            <code class="whitelist-tab__wallet">{{ shortenAddress(e.wallet) }}</code>
            <Button
              variant="ghost"
              size="sm"
              :disabled="removing === e.wallet"
              @click="removeWallet(e.wallet)"
            >
              <Icon v-if="removing === e.wallet" icon="mdi:loading" class="whitelist-tab__spinner" />
              <Icon v-else icon="mdi:close" />
            </Button>
          </li>
        </ul>
        <p v-else class="whitelist-tab__empty">No entries. Add wallet addresses above.</p>
      </div>

      <p v-if="loadError" class="whitelist-tab__error">{{ loadError }}</p>
    </div>

    <AdminPricingWidget
      ref="pricingRef"
      module-id="whitelist"
      :module-state="moduleState"
      :conditions="{ listsCount: lists.length }"
      :subscription="null"
      :saving="false"
      :deploying="creating || props.deploying"
      :save-error="createError"
      @deploy="(p: BillingPeriod) => emit('deploy', p)"
    />
  </div>

  <Modal
    :model-value="showCreateModal"
    title="Create whitelist"
    @update:model-value="(v: boolean) => { showCreateModal = v; if (!v) createError = null; createListName = '' }"
  >
    <div class="whitelist-tab__create-modal">
      <p class="whitelist-tab__create-hint">
        Creates an on-chain list. One-time fee, shown in the pricing card.
      </p>
      <TextInput
        v-model="createListName"
        placeholder="List name (e.g. founders)"
        :error="createError"
        :disabled="creating"
      />
      <div class="whitelist-tab__create-actions">
        <Button variant="secondary" :disabled="creating" @click="showCreateModal = false">
          Cancel
        </Button>
        <Button
          variant="primary"
          :disabled="!createListName.trim() || creating"
          @click="createList"
        >
          <Icon v-if="creating" icon="mdi:loading" class="whitelist-tab__spinner" />
          Create list
        </Button>
      </div>
    </div>
  </Modal>

  <Modal
    :model-value="showDeleteModal"
    title="Delete whitelist?"
    @update:model-value="(v: boolean) => { showDeleteModal = v; if (!v) deletingListAddress = null }"
  >
    <div class="whitelist-tab__delete-modal">
      <p>This will permanently delete the list and all entries on-chain. This cannot be undone.</p>
      <div class="whitelist-tab__delete-actions">
        <Button variant="secondary" :disabled="deleting" @click="showDeleteModal = false">
          Cancel
        </Button>
        <Button variant="primary" :disabled="deleting" @click="doDelete">
          <Icon v-if="deleting" icon="mdi:loading" class="whitelist-tab__spinner" />
          Delete
        </Button>
      </div>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import type { ModuleState } from '@decentraguild/core'
import type { BillingPeriod } from '@decentraguild/billing'
import { PublicKey, Transaction } from '@solana/web3.js'
import {
  deriveWhitelistPda,
  buildBillingTransfer,
  buildInitializeWhitelistTransaction,
  buildAddToWhitelistTransaction,
  buildRemoveFromWhitelistTransaction,
  buildDeleteWhitelistTransaction,
  sendAndConfirmTransaction,
  getEscrowWalletFromConnector,
} from '@decentraguild/web3'
import { Button, TextInput, Modal } from '@decentraguild/ui/components'
import { Icon } from '@iconify/vue'
import AdminPricingWidget from '~/components/AdminPricingWidget.vue'
import { useApiBase } from '~/composables/useApiBase'
import { useSolanaConnection } from '~/composables/useSolanaConnection'
import { API_V1 } from '~/utils/apiBase'

interface WhitelistEntry {
  address: string
  name: string
  authority: string
}

interface ListEntry {
  publicKey: string
  wallet: string
}

const props = defineProps<{
  slug: string
  moduleState: ModuleState
  deploying: boolean
}>()

const emit = defineEmits<{
  deploy: [period: BillingPeriod]
}>()

const apiBase = useApiBase()
const { connection } = useSolanaConnection()

const lists = ref<WhitelistEntry[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const selectedListAddress = ref('')
const entries = ref<ListEntry[]>([])
const walletToAdd = ref('')
const addError = ref<string | null>(null)
const adding = ref(false)
const removing = ref<string | null>(null)

const showCreateModal = ref(false)
const createListName = ref('')
const createError = ref<string | null>(null)
const creating = ref(false)

const showDeleteModal = ref(false)
const deletingListAddress = ref<string | null>(null)
const deleting = ref(false)

const selectedList = computed(() =>
  lists.value.find((l) => l.address === selectedListAddress.value)
)

function shortenAddress(addr: string): string {
  if (addr.length < 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

async function fetchLists() {
  if (!props.slug) return
  loading.value = true
  loadError.value = null
  try {
    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${props.slug}/whitelist/lists`,
      { credentials: 'include' }
    )
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? 'Failed to load lists')
    }
    const data = (await res.json()) as { lists: WhitelistEntry[] }
    lists.value = data.lists ?? []
    if (!lists.value.some((l) => l.address === selectedListAddress.value)) {
      selectedListAddress.value = lists.value[0]?.address ?? ''
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load lists'
    lists.value = []
    selectedListAddress.value = ''
  } finally {
    loading.value = false
  }
}

async function fetchEntries() {
  if (!props.slug || !selectedListAddress.value) {
    entries.value = []
    return
  }
  try {
    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${props.slug}/whitelist/lists/${selectedListAddress.value}/entries`,
      { credentials: 'include' }
    )
    if (!res.ok) {
      entries.value = []
      return
    }
    const data = (await res.json()) as { entries: ListEntry[] }
    entries.value = data.entries ?? []
  } catch {
    entries.value = []
  }
}

watch(selectedListAddress, () => fetchEntries(), { immediate: true })

async function createList() {
  if (!createListName.value.trim() || !props.slug || !connection.value) return
  createError.value = null
  creating.value = true
  try {
    const wallet = getEscrowWalletFromConnector()
    if (!wallet?.publicKey) throw new Error('Wallet not connected')
    const authority = wallet.publicKey
    const name = createListName.value.trim()
    const whitelistPda = deriveWhitelistPda(authority, name)

    const intentRes = await fetch(
      `${apiBase.value}${API_V1}/tenant/${props.slug}/billing/payment-intent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ moduleId: 'whitelist', billingPeriod: 'monthly' }),
      }
    )
    if (!intentRes.ok) {
      const data = (await intentRes.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? 'Failed to create payment intent')
    }
    const intent = (await intentRes.json()) as {
      noPaymentRequired?: boolean
      paymentId?: string
      amountUsdc?: number
      memo?: string
      recipientAta?: string
    }
    if (intent.noPaymentRequired) throw new Error('Payment required to create list')
    if (!intent.paymentId || intent.amountUsdc == null || !intent.memo || !intent.recipientAta) {
      throw new Error('Invalid payment intent response')
    }

    const billingTx = buildBillingTransfer({
      payer: wallet.publicKey,
      amountUsdc: intent.amountUsdc,
      recipientAta: new PublicKey(intent.recipientAta),
      memo: intent.memo,
      connection: connection.value,
    })
    const whitelistTx = await buildInitializeWhitelistTransaction({
      name,
      authority,
      connection: connection.value,
      wallet,
    })
    const combined = new Transaction()
    combined.add(...billingTx.instructions, ...whitelistTx.instructions)

    const sig = await sendAndConfirmTransaction(
      connection.value,
      combined,
      wallet,
      wallet.publicKey
    )
    if (!sig) throw new Error('Transaction failed')

    const confirmRes = await fetch(
      `${apiBase.value}${API_V1}/tenant/${props.slug}/billing/confirm-payment`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ paymentId: intent.paymentId, txSignature: sig }),
      }
    )
    if (!confirmRes.ok) {
      const data = (await confirmRes.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? 'Payment confirmation failed')
    }

    const postRes = await fetch(
      `${apiBase.value}${API_V1}/tenant/${props.slug}/whitelist/lists`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          address: whitelistPda.toBase58(),
          name,
          authority: authority.toBase58(),
        }),
      }
    )
    if (!postRes.ok) {
      const data = (await postRes.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? 'Failed to register list')
    }

    const data = (await postRes.json()) as { lists: WhitelistEntry[] }
    lists.value = data.lists ?? []
    selectedListAddress.value = whitelistPda.toBase58()
    showCreateModal.value = false
    createListName.value = ''
  } catch (e) {
    createError.value = e instanceof Error ? e.message : 'Failed to create list'
  } finally {
    creating.value = false
  }
}

function confirmDelete() {
  deletingListAddress.value = selectedListAddress.value
  showDeleteModal.value = true
}

async function doDelete() {
  const addr = deletingListAddress.value
  const list = lists.value.find((l) => l.address === addr)
  if (!addr || !list || !connection.value) {
    showDeleteModal.value = false
    return
  }
  deleting.value = true
  try {
    const wallet = getEscrowWalletFromConnector()
    if (!wallet?.publicKey) throw new Error('Wallet not connected')

    const tx = await buildDeleteWhitelistTransaction({
      name: list.name,
      authority: list.authority,
      connection: connection.value,
      wallet,
    })
    await sendAndConfirmTransaction(
      connection.value,
      tx,
      wallet,
      wallet.publicKey
    )

    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${props.slug}/whitelist/lists/${addr}`,
      { method: 'DELETE', credentials: 'include' }
    )
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? 'Failed to remove list')
    }
    const data = (await res.json()) as { lists: WhitelistEntry[] }
    lists.value = data.lists ?? []
    if (selectedListAddress.value === addr) selectedListAddress.value = ''
    showDeleteModal.value = false
    deletingListAddress.value = null
  } catch (e) {
    createError.value = e instanceof Error ? e.message : 'Failed to delete list'
  } finally {
    deleting.value = false
  }
}

async function addWallet() {
  if (!walletToAdd.value.trim() || !selectedList.value || !connection.value) return
  addError.value = null
  adding.value = true
  try {
    const wallet = getEscrowWalletFromConnector()
    if (!wallet?.publicKey) throw new Error('Wallet not connected')

    const tx = await buildAddToWhitelistTransaction({
      whitelist: selectedList.value.address,
      accountToAdd: walletToAdd.value.trim(),
      authority: selectedList.value.authority,
      connection: connection.value,
      wallet,
    })
    await sendAndConfirmTransaction(
      connection.value,
      tx,
      wallet,
      wallet.publicKey
    )
    walletToAdd.value = ''
    await fetchEntries()
  } catch (e) {
    addError.value = e instanceof Error ? e.message : 'Failed to add wallet'
  } finally {
    adding.value = false
  }
}

async function removeWallet(walletAddr: string) {
  if (!selectedList.value || !connection.value) return
  removing.value = walletAddr
  try {
    const wallet = getEscrowWalletFromConnector()
    if (!wallet?.publicKey) throw new Error('Wallet not connected')

    const tx = await buildRemoveFromWhitelistTransaction({
      whitelist: selectedList.value.address,
      accountToDelete: walletAddr,
      authority: selectedList.value.authority,
      connection: connection.value,
      wallet,
    })
    await sendAndConfirmTransaction(
      connection.value,
      tx,
      wallet,
      wallet.publicKey
    )
    await fetchEntries()
  } catch (e) {
    addError.value = e instanceof Error ? e.message : 'Failed to remove wallet'
  } finally {
    removing.value = null
  }
}

onMounted(() => fetchLists())
</script>

<style scoped>
.whitelist-tab__list-select {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--theme-space-sm);
  margin-bottom: var(--theme-space-lg);
}
.whitelist-tab__select {
  flex: 1;
  min-width: 12rem;
  padding: var(--theme-space-xs) var(--theme-space-sm);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background: var(--theme-bg-primary);
  color: var(--theme-text-primary);
  font-size: var(--theme-font-sm);
}
.whitelist-tab__list-actions {
  display: flex;
  gap: var(--theme-space-xs);
}
.whitelist-tab__entries {
  margin-top: var(--theme-space-lg);
  padding-top: var(--theme-space-lg);
  border-top: var(--theme-border-thin) solid var(--theme-border);
}
.whitelist-tab__entries h4 {
  font-size: var(--theme-font-md);
  margin-bottom: var(--theme-space-sm);
}
.whitelist-tab__add-wallet {
  display: flex;
  gap: var(--theme-space-sm);
  margin-bottom: var(--theme-space-md);
}
.whitelist-tab__add-wallet .text-input {
  flex: 1;
  margin-bottom: 0;
}
.whitelist-tab__entry-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.whitelist-tab__entry-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--theme-space-xs) 0;
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}
.whitelist-tab__entry-item:last-child {
  border-bottom: none;
}
.whitelist-tab__wallet {
  font-size: var(--theme-font-sm);
  background: var(--theme-bg-secondary);
  padding: 2px var(--theme-space-xs);
  border-radius: var(--theme-radius-sm);
}
.whitelist-tab__empty,
.whitelist-tab__error {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}
.whitelist-tab__error {
  color: var(--theme-error);
  margin-top: var(--theme-space-sm);
}
.whitelist-tab__create-modal,
.whitelist-tab__delete-modal {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}
.whitelist-tab__create-hint,
.whitelist-tab__delete-modal p {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
.whitelist-tab__create-actions,
.whitelist-tab__delete-actions {
  display: flex;
  gap: var(--theme-space-sm);
  justify-content: flex-end;
}
.whitelist-tab__spinner {
  animation: whitelist-spin 1s linear infinite;
}
@keyframes whitelist-spin {
  to { transform: rotate(360deg); }
}
</style>
