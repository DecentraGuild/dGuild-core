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
            variant="brand"
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

        <div class="gates-tab__primary-row">
          <label class="gates-tab__primary-label">
            <Switch
              :model-value="selectedList.isPrimary"
              @update:model-value="onPrimarySwitchChange($event)"
            />
            <span>Primary list</span>
          </label>
          <p class="gates-tab__primary-hint">
            Members on the primary list can create a profile. Only one list can be primary.
          </p>
        </div>

        <div v-if="selectedList.isPrimary" class="gates-tab__profile-fields gates-tab__profile-fields--under-primary">
          <h4 class="gates-tab__profile-fields-title">Member profile fields</h4>
          <p class="gates-tab__profile-fields-hint">
            Choose which fields members can fill out on their profile. Discord is always shown from verified link data.
          </p>
          <div class="gates-tab__field-checks">
            <label v-for="field in PROFILE_FIELD_OPTIONS" :key="field.key" class="gates-tab__field-check">
              <input
                type="checkbox"
                :checked="editProfileFields[field.key] === true"
                @change="onProfileFieldCheckboxChange(field.key, ($event.target as HTMLInputElement).checked)"
              >
              <span>{{ field.label }}</span>
            </label>
          </div>
          <div class="gates-tab__profile-fields-actions">
            <Button
              variant="brand"
              size="sm"
              :disabled="savingProfileFields"
              @click="saveProfileFields"
            >
              <Icon v-if="savingProfileFields" icon="lucide:loader-2" class="gates-tab__spinner" />
              Save profile fields
            </Button>
            <span v-if="profileFieldsSaved" class="gates-tab__saved-label">Saved</span>
          </div>
        </div>

        <div class="gates-tab__image-row">
          <FormInput
            v-model="editImageUrl"
            placeholder="Image URL for this gate (used for cards)"
            :disabled="updatingImage"
          />
          <Button
            variant="brand"
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
            variant="brand"
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
            <button
              v-if="selectedList.isPrimary"
              type="button"
              class="gates-tab__wallet-btn"
              :title="'View member profile (' + e.wallet + ')'"
              @click="openAdminMemberProfile(e.wallet)"
            >
              {{ resolveWallet(e.wallet, 6, 4) }}
            </button>
            <code v-else class="gates-tab__wallet">{{ resolveWallet(e.wallet, 6, 4) }}</code>
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

  <SimpleModal
    :model-value="showPrimaryModal"
    :title="primaryModalEnabling ? 'Set as primary list' : 'Remove primary status'"
    @update:model-value="(v: boolean) => { if (!v) closePrimaryModal() }"
  >
    <div class="gates-tab__primary-modal">
      <template v-if="primaryModalEnabling">
        <p>
          Only one list per community can be the primary member list. Setting
          <strong>{{ selectedList?.name }}</strong> as primary will unlock
          <strong>Member Profiles</strong> for all wallets on this list.
        </p>
        <p>
          Members on the primary list can create a profile with a nickname,
          avatar, description, and social links. Their nickname will be shown
          across the platform instead of their truncated wallet address.
        </p>
        <p v-if="hasPrimaryList && !selectedList?.isPrimary" class="gates-tab__primary-modal-warn">
          Another list is currently set as primary. Enabling this one will replace it.
        </p>
      </template>
      <template v-else>
        <p>
          Removing primary status from <strong>{{ selectedList?.name }}</strong> will
          disable Member Profiles for this community. Existing profiles will be
          preserved but members won't be able to edit them until a primary list
          is set again.
        </p>
      </template>
      <div class="gates-tab__primary-modal-actions">
        <Button variant="secondary" :disabled="togglingPrimary" @click="closePrimaryModal">
          Cancel
        </Button>
        <Button variant="brand" :disabled="togglingPrimary" @click="confirmPrimaryToggle">
          <Icon v-if="togglingPrimary" icon="lucide:loader-2" class="gates-tab__spinner" />
          {{ primaryModalEnabling ? 'Set as primary' : 'Remove primary' }}
        </Button>
      </div>
    </div>
  </SimpleModal>

  <SimpleModal
    :model-value="showMemberProfileModal"
    wide
    :title="memberProfileModalTitle"
    @update:model-value="onMemberProfileModalClose"
  >
    <div class="gates-tab__member-profile-modal">
      <template v-if="viewingWallet">
        <div class="gates-tab__member-profile-row gates-tab__member-profile-row--wallet">
          <span class="gates-tab__member-profile-label">Wallet</span>
          <div class="gates-tab__member-profile-wallet-line">
            <code class="gates-tab__member-profile-value">{{ viewingWallet }}</code>
            <Button variant="ghost" size="sm" type="button" @click="copyMemberWallet(viewingWallet)">
              <Icon icon="lucide:copy" class="gates-tab__copy-icon" />
              Copy
            </Button>
          </div>
        </div>
        <div v-if="memberProfileLoading" class="gates-tab__member-profile-loading">
          <Icon icon="lucide:loader-2" class="gates-tab__spinner" />
          Loading profile…
        </div>
        <p v-else-if="memberProfileError" class="gates-tab__error">{{ memberProfileError }}</p>
        <template v-else>
          <template v-if="!memberProfile">
            <p class="gates-tab__member-profile-empty">No member profile saved for this wallet yet.</p>
          </template>
          <dl v-else class="gates-tab__member-profile-dl">
            <dt class="gates-tab__member-profile-label">Member ID</dt>
            <dd class="gates-tab__member-profile-value">{{ memberProfile.member_id ?? '—' }}</dd>
            <template v-if="memberProfile.nickname">
              <dt class="gates-tab__member-profile-label">Nickname</dt>
              <dd class="gates-tab__member-profile-value">{{ memberProfile.nickname }}</dd>
            </template>
            <template v-if="memberProfile.description">
              <dt class="gates-tab__member-profile-label">Description</dt>
              <dd class="gates-tab__member-profile-value gates-tab__member-profile-value--multiline">{{ memberProfile.description }}</dd>
            </template>
            <template v-if="memberProfile.avatar_url && isHttpUrl(String(memberProfile.avatar_url))">
              <dt class="gates-tab__member-profile-label">Avatar</dt>
              <dd class="gates-tab__member-profile-value">
                <img
                  :src="String(memberProfile.avatar_url)"
                  alt=""
                  class="gates-tab__member-profile-avatar"
                >
              </dd>
            </template>
            <dt class="gates-tab__member-profile-label">Discord</dt>
            <dd class="gates-tab__member-profile-value">
              {{ memberProfile.discord_user_id != null && String(memberProfile.discord_user_id).trim() !== ''
                ? memberProfile.discord_user_id
                : 'Not linked' }}
            </dd>
            <template v-if="memberProfile.x_handle">
              <dt class="gates-tab__member-profile-label">X</dt>
              <dd class="gates-tab__member-profile-value">{{ memberProfile.x_handle }}</dd>
            </template>
            <template v-if="memberProfile.telegram_handle">
              <dt class="gates-tab__member-profile-label">Telegram</dt>
              <dd class="gates-tab__member-profile-value">{{ memberProfile.telegram_handle }}</dd>
            </template>
            <template v-if="memberProfile.email">
              <dt class="gates-tab__member-profile-label">Email</dt>
              <dd class="gates-tab__member-profile-value">{{ memberProfile.email }}</dd>
            </template>
            <template v-if="memberProfile.phone">
              <dt class="gates-tab__member-profile-label">Phone</dt>
              <dd class="gates-tab__member-profile-value">{{ memberProfile.phone }}</dd>
            </template>
            <template v-if="linkedWalletsForModal.length">
              <dt class="gates-tab__member-profile-label">Linked wallets</dt>
              <dd class="gates-tab__member-profile-value">
                <ul class="gates-tab__member-profile-linked">
                  <li v-for="(w, i) in linkedWalletsForModal" :key="i">
                    <code>{{ w }}</code>
                  </li>
                </ul>
              </dd>
            </template>
          </dl>
        </template>
      </template>
    </div>
  </SimpleModal>
</template>

<script setup lang="ts">
import { truncateAddress } from '@decentraguild/display'
import type { ModuleState, ProfileFieldConfig, ProfileFieldKey } from '@decentraguild/core'
import { normalizeProfileFieldConfig, PROFILE_FIELD_KEYS } from '@decentraguild/core'
import type { Ref } from 'vue'
import { useAdminGating } from '~/composables/admin/useAdminGating'
import GateSelectRow from '~/components/gates/GateSelectRow.vue'
import type { BillingPeriod } from '@decentraguild/billing'
import { Switch } from '~/components/ui/switch'
import {
  resolveWhitelistListPubkey,
  getWhitelistProgramReadOnly,
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
import { invokeEdgeFunction, useSubmitInFlightLock } from '@decentraguild/nuxt-composables'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantStore } from '~/stores/tenant'
import { useMemberProfiles } from '~/composables/members/useMemberProfiles'
import type { BillingSameTxPrepare } from '~/composables/admin/useAdminBilling'
import { ComputeBudgetProgram, Transaction } from '@solana/web3.js'

const BILLING_PLUS_PROGRAM_CU = 400_000

interface GateEntry {
  address: string
  name: string
  authority: string
  imageUrl?: string | null
  isPrimary?: boolean
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
  handleBillingPayment: (
    moduleId: string,
    period: BillingPeriod,
    slugToClaim?: string,
    conditions?: Record<string, number | boolean>,
  ) => Promise<boolean>
  prepareBillingInstructionsForSameTx: (
    moduleId: string,
    period: BillingPeriod,
    slugToClaim?: string,
    conditions?: Record<string, number | boolean>,
  ) => Promise<BillingSameTxPrepare>
  confirmBillingFromTxSignature: (paymentId: string, txSignature: string) => Promise<void>
}>()

const emit = defineEmits<{
  deploy: [period: BillingPeriod, conditions?: Record<string, number | boolean>]
  created: []
}>()

const tenantStore = useTenantStore()
const tenantId = computed(() => tenantStore.tenantId)
const gatesChainLock = useSubmitInFlightLock()
const { connection } = useSolanaConnection()
const { resolveWallet } = useMemberProfiles()

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
  if (!tenantId.value) {
    loading.value = false
    lists.value = []
    selectedListAddress.value = ''
    return
  }
  loading.value = true
  loadError.value = null
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase
      .from('gate_lists')
      .select('address, name, authority, image_url, is_primary')
      .eq('tenant_id', tenantId.value)
      .order('name')

    if (error) throw new Error(error.message)
    lists.value = (data ?? []).map((r) => ({
      address: r.address as string,
      name: r.name as string,
      authority: r.authority as string,
      imageUrl: r.image_url as string | null,
      isPrimary: r.is_primary === true,
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
    const data = await invokeEdgeFunction<{ entries?: string[] }>(supabase, 'gates', { action: 'entries', listAddress: selectedListAddress.value })
    const wallets = data.entries ?? []
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

  const exclusive = await gatesChainLock.runExclusive(async () => {
    createError.value = null
    creating.value = true
    const supabase = useSupabase()
    try {
      const listConditions = { listsCount: lists.value.length + 1 }
      const billingPrep = await props.prepareBillingInstructionsForSameTx(
        'gates',
        'monthly',
        undefined,
        listConditions,
      )

      const whitelistTx = await buildInitializeWhitelistTransaction({
        name,
        authority: wallet.publicKey,
        connection: connection.value,
        wallet,
      })

      const tx = new Transaction()
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: BILLING_PLUS_PROGRAM_CU }))
      if (billingPrep.kind === 'usdc') {
        for (const ix of billingPrep.instructions) {
          tx.add(ix)
        }
      }
      for (const ix of whitelistTx.instructions) {
        tx.add(ix)
      }

      const txSignature = await sendAndConfirmTransaction(connection.value, tx, wallet, wallet.publicKey)

      if (billingPrep.kind === 'usdc') {
        await props.confirmBillingFromTxSignature(billingPrep.paymentId, txSignature)
      }

      const wlProgram = getWhitelistProgramReadOnly(connection.value)
      const address = (await resolveWhitelistListPubkey(wlProgram, wallet.publicKey, name)).toBase58()
      await invokeEdgeFunction(supabase, 'gates', {
        action: 'list-create',
        tenantId: tenantId.value,
        address,
        name,
        authority: wallet.publicKey.toBase58(),
        imageUrl: createListImageUrl.value.trim() || null,
      }, { errorFallback: 'Failed to save list' })

      await fetchLists()
      pricingRef.value?.refresh?.()
      emit('created')
      closeCreateModalAndReset()
    } catch (e) {
      createError.value = e instanceof Error ? e.message : 'Failed to create list'
    } finally {
      creating.value = false
    }
  })
  if (!exclusive.ok) return
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
  const exclusive = await gatesChainLock.runExclusive(async () => {
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
  })
  if (!exclusive.ok) return
}

async function addWallet() {
  if (!walletToAdd.value.trim() || !selectedList.value || !connection.value) return
  const exclusive = await gatesChainLock.runExclusive(async () => {
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
  })
  if (!exclusive.ok) return
}

async function removeWallet(walletAddr: string) {
  if (!selectedList.value || !connection.value) return
  const exclusive = await gatesChainLock.runExclusive(async () => {
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
  })
  if (!exclusive.ok) return
}

const showPrimaryModal = ref(false)
const primaryModalEnabling = ref(false)
const togglingPrimary = ref(false)

function onPrimarySwitchChange(checked: boolean) {
  if (!selectedList.value) return
  primaryModalEnabling.value = checked
  showPrimaryModal.value = true
}

function closePrimaryModal() {
  showPrimaryModal.value = false
}

async function confirmPrimaryToggle() {
  if (!tenantId.value || !selectedList.value) return
  togglingPrimary.value = true
  const supabase = useSupabase()
  try {
    await invokeEdgeFunction(supabase, 'gates', {
      action: 'list-update',
      tenantId: tenantId.value,
      address: selectedList.value.address,
      name: selectedList.value.name,
      imageUrl: selectedList.value.imageUrl ?? null,
      isPrimary: primaryModalEnabling.value,
    }, { errorFallback: 'Failed to update primary status' })
    await fetchLists()
    closePrimaryModal()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to update primary'
  } finally {
    togglingPrimary.value = false
  }
}

const hasPrimaryList = computed(() => lists.value.some((l) => l.isPrimary))

const PROFILE_FIELD_LABELS: Record<ProfileFieldKey, string> = {
  nickname: 'Nickname',
  description: 'Description',
  avatar_url: 'Avatar',
  x_handle: 'X handle',
  telegram_handle: 'Telegram',
  email: 'Email',
  phone: 'Phone',
  linked_wallets: 'Linked wallets',
}

const PROFILE_FIELD_OPTIONS = PROFILE_FIELD_KEYS.map((key) => ({
  key,
  label: PROFILE_FIELD_LABELS[key],
}))

const editProfileFields = reactive<Record<string, boolean>>({})
const savingProfileFields = ref(false)
const profileFieldsSaved = ref(false)
/** When true, do not overwrite checkboxes from tenant store (avoids resets during edits / refetch races). */
const profileFieldsEditorDirty = ref(false)

function applyProfileFieldsToForm(fields: ProfileFieldConfig | undefined) {
  const normalized = normalizeProfileFieldConfig(fields ?? {})
  for (const key of PROFILE_FIELD_KEYS) {
    editProfileFields[key] = normalized[key] === true
  }
}

watch(
  () => tenantStore.tenant?.profileFields,
  (fields) => {
    if (profileFieldsEditorDirty.value) return
    applyProfileFieldsToForm(fields)
  },
  { immediate: true },
)

function onProfileFieldCheckboxChange(key: ProfileFieldKey, checked: boolean) {
  profileFieldsEditorDirty.value = true
  editProfileFields[key] = checked
}

async function saveProfileFields() {
  if (!tenantId.value) return
  savingProfileFields.value = true
  profileFieldsSaved.value = false
  try {
    const supabase = useSupabase()
    const payload: Record<string, boolean> = {}
    for (const key of PROFILE_FIELD_KEYS) {
      payload[key] = editProfileFields[key] === true
    }
    const data = await invokeEdgeFunction<{ ok?: boolean; profileFields?: Record<string, boolean> }>(
      supabase,
      'member-profile',
      {
        action: 'admin-update-profile-fields',
        tenantId: tenantId.value,
        profileFields: payload,
      },
      { errorFallback: 'Failed to save profile fields' },
    )
    await tenantStore.refetchTenantContext()
    profileFieldsEditorDirty.value = false
    applyProfileFieldsToForm(
      data.profileFields != null && typeof data.profileFields === 'object'
        ? data.profileFields
        : tenantStore.tenant?.profileFields,
    )
    profileFieldsSaved.value = true
    setTimeout(() => { profileFieldsSaved.value = false }, 3000)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to save profile fields'
  } finally {
    savingProfileFields.value = false
  }
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\/.+/i.test(s)
}

const showMemberProfileModal = ref(false)
const viewingWallet = ref<string | null>(null)
const memberProfileLoading = ref(false)
const memberProfile = ref<Record<string, unknown> | null>(null)
const memberProfileError = ref<string | null>(null)

const memberProfileModalTitle = computed(() =>
  viewingWallet.value
    ? `Member profile · ${truncateAddress(viewingWallet.value, 8, 6)}`
    : 'Member profile',
)

const linkedWalletsForModal = computed(() => {
  const lw = memberProfile.value?.linked_wallets
  if (!Array.isArray(lw)) return []
  return lw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
})

async function openAdminMemberProfile(wallet: string) {
  if (!tenantId.value) return
  viewingWallet.value = wallet
  showMemberProfileModal.value = true
  memberProfileLoading.value = true
  memberProfile.value = null
  memberProfileError.value = null
  try {
    const supabase = useSupabase()
    const data = await invokeEdgeFunction<{ profile: Record<string, unknown> | null }>(
      supabase,
      'member-profile',
      { action: 'admin-get', tenantId: tenantId.value, wallet },
      { errorFallback: 'Failed to load profile' },
    )
    memberProfile.value = data.profile
  } catch (e) {
    memberProfileError.value = e instanceof Error ? e.message : 'Failed to load profile'
  } finally {
    memberProfileLoading.value = false
  }
}

function onMemberProfileModalClose(open: boolean) {
  if (open) return
  showMemberProfileModal.value = false
  viewingWallet.value = null
  memberProfile.value = null
  memberProfileError.value = null
  memberProfileLoading.value = false
}

async function copyMemberWallet(addr: string) {
  try {
    await navigator.clipboard.writeText(addr)
  } catch {
    /* ignore */
  }
}

watch(
  tenantId,
  (id) => {
    if (id) void fetchLists()
    else {
      loading.value = false
      lists.value = []
      selectedListAddress.value = ''
      entries.value = []
    }
  },
  { immediate: true },
)
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
.gates-tab__wallet-btn {
  font-family: ui-monospace, monospace;
  font-size: var(--theme-font-sm);
  text-align: left;
  padding: 2px var(--theme-space-xs);
  border: none;
  border-radius: var(--theme-radius-sm);
  background: var(--theme-bg-secondary);
  color: var(--theme-primary);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--theme-primary) 40%, transparent);
  text-underline-offset: 2px;
  cursor: pointer;
}
.gates-tab__wallet-btn:hover {
  color: var(--theme-text-primary);
  text-decoration-color: currentColor;
}
.gates-tab__member-profile-modal {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
  min-width: 0;
}
.gates-tab__member-profile-loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
.gates-tab__member-profile-empty {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}
.gates-tab__member-profile-row--wallet {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
}
.gates-tab__member-profile-wallet-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--theme-space-sm);
}
.gates-tab__member-profile-dl {
  margin: 0;
  display: grid;
  grid-template-columns: minmax(6rem, 9rem) 1fr;
  gap: var(--theme-space-sm) var(--theme-space-md);
  font-size: var(--theme-font-sm);
}
.gates-tab__member-profile-dl dt {
  margin: 0;
}
.gates-tab__member-profile-dl dd {
  margin: 0;
  min-width: 0;
}
.gates-tab__member-profile-label {
  font-weight: 600;
  color: var(--theme-text-secondary);
}
.gates-tab__member-profile-value {
  color: var(--theme-text-primary);
  word-break: break-all;
}
.gates-tab__member-profile-value--multiline {
  white-space: pre-wrap;
}
.gates-tab__member-profile-avatar {
  max-width: 5rem;
  max-height: 5rem;
  border-radius: var(--theme-radius-md);
  object-fit: cover;
  border: var(--theme-border-thin) solid var(--theme-border);
}
.gates-tab__member-profile-linked {
  margin: 0;
  padding-left: 1.25rem;
}
.gates-tab__member-profile-linked li {
  margin: var(--theme-space-xs) 0;
}
.gates-tab__copy-icon {
  font-size: 1rem;
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
.gates-tab__primary-row {
  margin-bottom: var(--theme-space-md);
  padding-bottom: var(--theme-space-md);
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}
.gates-tab__primary-label {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  font-weight: 500;
  cursor: pointer;
}
.gates-tab__primary-hint {
  margin: var(--theme-space-xs) 0 0;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}
.gates-tab__profile-fields {
  margin-top: var(--theme-space-lg);
  padding-top: var(--theme-space-lg);
  border-top: var(--theme-border-thin) solid var(--theme-border);
}
.gates-tab__profile-fields--under-primary {
  margin-top: 0;
  margin-bottom: var(--theme-space-md);
  padding: var(--theme-space-md);
  border-top: none;
  border-radius: var(--theme-radius-md);
  background: var(--theme-bg-secondary);
}
.gates-tab__profile-fields-title {
  font-size: var(--theme-font-md);
  font-weight: 600;
  margin: 0 0 var(--theme-space-xs);
}
.gates-tab__profile-fields-hint {
  margin: 0 0 var(--theme-space-md);
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}
.gates-tab__field-checks {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-sm) var(--theme-space-lg);
  margin-bottom: var(--theme-space-md);
}
.gates-tab__field-check {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  font-size: var(--theme-font-sm);
  cursor: pointer;
}
.gates-tab__profile-fields-actions {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
}
.gates-tab__saved-label {
  font-size: var(--theme-font-sm);
  color: var(--theme-status-success);
}
.gates-tab__primary-modal {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}
.gates-tab__primary-modal p {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  line-height: 1.5;
}
.gates-tab__primary-modal-warn {
  color: var(--theme-status-warning, var(--theme-text-secondary));
  font-weight: 500;
}
.gates-tab__primary-modal-actions {
  display: flex;
  gap: var(--theme-space-sm);
  justify-content: flex-end;
}
</style>
