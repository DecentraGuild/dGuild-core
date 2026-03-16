<template>
  <div class="admin__split">
    <div class="admin__panel">
      <GateSelectRow
        v-if="slug"
        :slug="slug"
        :model-value="gatesGateValue"
        title="Who can see Member lists"
        hint="Who can see Member lists. Use dGuild default, admins only, public, or a specific list."
        :show-use-default="true"
        show-admin-only
        show-save
        save-label="Save"
        :dirty="gatesGateDirty"
        :loading="gatesGateSaving"
        :save-success="gatesGateSaveSuccess"
        :save-error="gatesGateSaveError"
        class="gates-tab__gate-row"
        @update:model-value="onGatesGateUpdate($event)"
        @save="saveGatesGate()"
      />
      <h3>Member lists</h3>

      <div class="gates-tab__list-select">
        <select
          v-model="selectedListAddress"
          class="gates-tab__select"
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
            {{ list.name ? `${list.name} (${truncateAddress(list.address, 8, 4)})` : truncateAddress(list.address, 8, 4) }}
          </option>
        </select>
        <div class="gates-tab__list-actions">
          <Button
            variant="secondary"
            size="sm"
            :disabled="loading || creating"
            @click="openCreateModal"
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

      <div v-if="selectedList" class="gates-tab__entries">
        <h4>List details</h4>
        <div class="gates-tab__image-row">
          <FormInput
            v-model="editImageUrl"
            placeholder="Image URL for this gate (used for cards)"
            :disabled="updatingImage"
          />
          <Button
            variant="secondary"
            size="sm"
            :disabled="updatingImage"
            @click="saveImage"
          >
            <Icon v-if="updatingImage" icon="lucide:loader-2" class="gates-tab__spinner" />
            Save image
          </Button>
        </div>

        <h4>Entries</h4>
        <div class="gates-tab__add-wallet">
          <FormInput
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
        <ul v-if="entries.length" class="gates-tab__entry-list">
          <li
            v-for="e in entries"
            :key="e.wallet"
            class="gates-tab__entry-item"
          >
            <code class="gates-tab__wallet">{{ truncateAddress(e.wallet, 6, 4) }}</code>
            <Button
              variant="ghost"
              size="sm"
              :disabled="removing === e.wallet"
              @click="removeWallet(e.wallet)"
            >
              <Icon v-if="removing === e.wallet" icon="lucide:loader-2" class="gates-tab__spinner" />
              <Icon v-else icon="lucide:x" />
            </Button>
          </li>
        </ul>
        <p v-else class="gates-tab__empty">No entries. Add wallet addresses above.</p>
      </div>

      <p v-if="loadError" class="gates-tab__error">{{ loadError }}</p>
    </div>

    <AdminPricingWidget
      ref="pricingRef"
      module-id="gates"
      :module-state="moduleState"
      :conditions="{ listsCount: lists.length + 1 }"
      :subscription="subscription"
      :saving="false"
      :deploying="creating || props.deploying"
      :save-error="createError"
      @deploy="(p: BillingPeriod) => emit('deploy', p, { listsCount: lists.length + 1 })"
    />
  </div>

  <SimpleModal
    :model-value="showCreateModal"
    title="Create gate"
    @update:model-value="(v: boolean) => { if (!v) closeCreateModalAndReset() }"
  >
    <div class="gates-tab__create-modal">
      <FormInput
        v-model="createListName"
        placeholder="List name (e.g. founders)"
        :error="createError"
        :disabled="creating"
      />
      <FormInput
        v-model="createListImageUrl"
        placeholder="Optional image URL for this gate (used for cards)"
        :disabled="creating"
      />
      <div class="gates-tab__create-actions">
        <Button variant="secondary" :disabled="creating" @click="closeCreateModalAndReset">
          Cancel
        </Button>
        <Button
          variant="default"
          :disabled="!createListName.trim() || creating"
          @click="createList"
        >
          <Icon v-if="creating" icon="lucide:loader-2" class="gates-tab__spinner" />
          Create list
        </Button>
      </div>
    </div>
  </SimpleModal>

  <SimpleModal
    :model-value="showDeleteModal"
    title="Delete gate?"
    @update:model-value="(v: boolean) => { if (!v) closeDeleteModal() }"
  >
    <div class="gates-tab__delete-modal">
      <p>This will permanently delete the list and all entries on-chain. This cannot be undone.</p>
      <div class="gates-tab__delete-actions">
        <Button variant="secondary" :disabled="deleting" @click="closeDeleteModal">
          Cancel
        </Button>
        <Button variant="default" :disabled="deleting" @click="doDelete">
          <Icon v-if="deleting" icon="lucide:loader-2" class="gates-tab__spinner" />
          Delete
        </Button>
      </div>
    </div>
  </SimpleModal>
</template>

<script setup lang="ts">
import { truncateAddress } from '@decentraguild/display'
import type { ModuleState } from '@decentraguild/core'
import type { Ref } from 'vue'
import { useAdminGating } from '~/composables/admin/useAdminGating'
import GateSelectRow from '~/components/gates/GateSelectRow.vue'
import type { BillingPeriod } from '@decentraguild/billing'
import { PublicKey } from '@solana/web3.js'
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
import { Button } from '~/components/ui/button'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import SimpleModal from '~/components/ui/simple-modal/SimpleModal.vue'
import { Icon } from '@iconify/vue'
import AdminPricingWidget from '~/components/admin/AdminPricingWidget.vue'
import { useAdminGateModals } from '~/composables/admin/useAdminGateModals'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantStore } from '~/stores/tenant'

interface GateEntry {
  address: string
  name: string
  authority: string
  imageUrl?: string | null
}

interface ListEntry {
  publicKey: string
  wallet: string
}

const props = defineProps<{
  slug: string
  moduleState: ModuleState
  subscription: { periodEnd?: string } | null
  deploying: boolean
}>()

const emit = defineEmits<{
  deploy: [period: BillingPeriod, conditions?: Record<string, number | boolean>]
  created: []
}>()

const tenantStore = useTenantStore()
const tenantId = computed(() => tenantStore.tenantId)
const { connection } = useSolanaConnection()

const { getValue, dirty, rowState, onUpdate, save } = useAdminGating(
  ref(null) as Ref<import('@decentraguild/core').MarketplaceGateSettings | null>
)
const gatesGateValue = computed(() => getValue('gates'))
const gatesGateDirty = computed(() => dirty.gates)
const gatesGateSaving = computed(() => rowState.gates.saving)
const gatesGateSaveSuccess = computed(() => rowState.gates.saveSuccess)
const gatesGateSaveError = computed(() => rowState.gates.saveError)
function onGatesGateUpdate(value: Parameters<typeof onUpdate>[1]) {
  onUpdate('gates', value)
}
async function saveGatesGate() {
  await save('gates')
}

const lists = ref<GateEntry[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const selectedListAddress = ref('')
const entries = ref<ListEntry[]>([])
const walletToAdd = ref('')
const addError = ref<string | null>(null)
const adding = ref(false)
const removing = ref<string | null>(null)

const {
  showCreateModal,
  showDeleteModal,
  deletingListAddress,
  openCreateModal,
  closeCreateModal,
  openDeleteModal,
  closeDeleteModal,
} = useAdminGateModals()
const createListName = ref('')
const createListImageUrl = ref('')
const createError = ref<string | null>(null)
const creating = ref(false)
const deleting = ref(false)

function closeCreateModalAndReset() {
  closeCreateModal()
  createError.value = null
  createListName.value = ''
  createListImageUrl.value = ''
}

const selectedList = computed(() =>
  lists.value.find((l) => l.address === selectedListAddress.value)
)

const editImageUrl = ref('')
const updatingImage = ref(false)

async function fetchLists() {
  if (!tenantId.value) return
  loading.value = true
  loadError.value = null
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase
      .from('gate_lists')
      .select('address, name, authority, image_url')
      .eq('tenant_id', tenantId.value)
      .order('name')

    if (error) throw new Error(error.message)
    lists.value = (data ?? []).map((r) => ({
      address: r.address as string,
      name: r.name as string,
      authority: r.authority as string,
      imageUrl: r.image_url as string | null,
    }))
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
  if (!selectedListAddress.value) {
    entries.value = []
    return
  }
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('gates', {
      body: { action: 'entries', listAddress: selectedListAddress.value },
    })
    if (error) { entries.value = []; return }
    const wallets = (data as { entries?: string[] }).entries ?? []
    entries.value = wallets.map((wallet) => ({ publicKey: '', wallet }))
  } catch {
    entries.value = []
  }
}

watch(selectedListAddress, () => fetchEntries(), { immediate: true })

watch(selectedList, (list) => {
  editImageUrl.value = list?.imageUrl ?? ''
})

async function createList() {
  const name = createListName.value.trim()
  if (!name) return
  const wallet = getEscrowWalletFromConnector()
  if (!wallet?.publicKey || !connection.value) {
    createError.value = 'Connect your wallet'
    return
  }

  createError.value = null
  creating.value = true
  const supabase = useSupabase()
  try {
    const currentCount = lists.value.length
    const { data: quoteData, error: quoteErr } = await supabase.functions.invoke('billing', {
      body: {
        action: 'quote',
        tenantId: tenantId.value,
        productKey: 'gates',
        meterOverrides: { gate_lists: currentCount + 1 },
        durationDays: 30,
      },
    })
    if (quoteErr) throw new Error(quoteErr.message ?? 'Quote failed')
    const quote = quoteData as { quoteId?: string; priceUsdc?: number }
    if (!quote?.quoteId) throw new Error('No quote returned')

    if (quote.priceUsdc != null && quote.priceUsdc > 0) {
      const payerWallet = wallet.publicKey.toBase58()
      const { data: chargeData, error: chargeErr } = await supabase.functions.invoke('billing', {
        body: {
          action: 'charge',
          quoteId: quote.quoteId,
          payerWallet,
          paymentMethod: 'usdc',
        },
      })
      if (chargeErr) throw new Error(chargeErr.message ?? 'Charge failed')
      const charge = chargeData as { paymentId?: string; amountUsdc?: number; memo?: string; recipientAta?: string }
      if (!charge?.paymentId || !charge?.memo || !charge?.recipientAta) throw new Error('Invalid charge response')

      const tx = buildBillingTransfer({
        payer: wallet.publicKey,
        amountUsdc: charge.amountUsdc ?? 0,
        recipientAta: new PublicKey(charge.recipientAta),
        memo: charge.memo,
        connection: connection.value,
      })
      const txSignature = await sendAndConfirmTransaction(connection.value, tx, wallet, wallet.publicKey)

      const { error: confirmErr } = await supabase.functions.invoke('billing', {
        body: { action: 'confirm', paymentId: charge.paymentId, txSignature },
      })
      if (confirmErr) throw new Error(confirmErr.message ?? 'Confirm failed')
    }

    const tx = await buildInitializeWhitelistTransaction({
      name,
      authority: wallet.publicKey,
      connection: connection.value,
      wallet,
    })
    await sendAndConfirmTransaction(connection.value, tx, wallet, wallet.publicKey)

    const address = deriveWhitelistPda(wallet.publicKey, name).toBase58()
    const { error } = await supabase.functions.invoke('gates', {
      body: {
        action: 'list-create',
        tenantId: tenantId.value,
        address,
        name,
        authority: wallet.publicKey.toBase58(),
        imageUrl: createListImageUrl.value.trim() || null,
      },
    })
    if (error) throw new Error(error.message ?? 'Failed to save list')

    await fetchLists()
    pricingRef.value?.refresh?.()
    emit('created')
    closeCreateModalAndReset()
  } catch (e) {
    createError.value = e instanceof Error ? e.message : 'Failed to create list'
  } finally {
    creating.value = false
  }
}

async function saveImage() {
  if (!tenantId.value || !selectedList.value) return
  updatingImage.value = true
  try {
    const supabase = useSupabase()
    const { error } = await supabase
      .from('gate_lists')
      .update({ image_url: editImageUrl.value.trim() || null })
      .eq('address', selectedList.value.address)
      .eq('tenant_id', tenantId.value)
    if (error) throw new Error(error.message)
    await fetchLists()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to update image'
  } finally {
    updatingImage.value = false
  }
}

function confirmDelete() {
  openDeleteModal(selectedListAddress.value)
}

async function doDelete() {
  const addr = deletingListAddress.value
  const list = lists.value.find((l) => l.address === addr)
  if (!addr || !list || !connection.value) {
    closeDeleteModal()
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

    const supabase = useSupabase()
    const { error } = await supabase
      .from('gate_lists')
      .delete()
      .eq('address', addr)
      .eq('tenant_id', tenantId.value)
    if (error) throw new Error(error.message ?? 'Failed to remove list')
    await fetchLists()
    if (selectedListAddress.value === addr) selectedListAddress.value = ''
    closeDeleteModal()
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
.gates-tab__gate-row {
  margin-bottom: var(--theme-space-lg);
  padding-bottom: var(--theme-space-lg);
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.gates-tab__list-select {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--theme-space-sm);
  margin-bottom: var(--theme-space-lg);
}
.gates-tab__select {
  flex: 1;
  min-width: 12rem;
  padding: var(--theme-space-xs) var(--theme-space-sm);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background: var(--theme-bg-primary);
  color: var(--theme-text-primary);
  font-size: var(--theme-font-sm);
}
.gates-tab__list-actions {
  display: flex;
  gap: var(--theme-space-xs);
}
.gates-tab__entries {
  margin-top: var(--theme-space-lg);
  padding-top: var(--theme-space-lg);
  border-top: var(--theme-border-thin) solid var(--theme-border);
}
.gates-tab__entries h4 {
  font-size: var(--theme-font-md);
  margin-bottom: var(--theme-space-sm);
}
.gates-tab__add-wallet {
  display: flex;
  gap: var(--theme-space-sm);
  margin-bottom: var(--theme-space-md);
}
.gates-tab__add-wallet .form-input {
  flex: 1;
  margin-bottom: 0;
}
.gates-tab__entry-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.gates-tab__entry-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--theme-space-xs) 0;
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}
.gates-tab__entry-item:last-child {
  border-bottom: none;
}
.gates-tab__wallet {
  font-size: var(--theme-font-sm);
  background: var(--theme-bg-secondary);
  padding: 2px var(--theme-space-xs);
  border-radius: var(--theme-radius-sm);
}
.gates-tab__empty,
.gates-tab__error {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}
.gates-tab__error {
  color: var(--theme-error);
  margin-top: var(--theme-space-sm);
}
.gates-tab__create-modal,
.gates-tab__delete-modal {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}
.gates-tab__delete-modal p {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
.gates-tab__create-actions,
.gates-tab__delete-actions {
  display: flex;
  gap: var(--theme-space-sm);
  justify-content: flex-end;
}
.gates-tab__spinner {
  animation: gates-spin 1s linear infinite;
}
@keyframes gates-spin {
  to { transform: rotate(360deg); }
}
</style>
