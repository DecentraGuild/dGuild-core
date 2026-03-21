<template>
  <div class="admin-raffle-tab">
    <div class="admin__split">
      <div class="admin__panel">
        <Card>
          <GateSelectRowModule
            layout="stacked"
            :slug="slug"
            :model-value="whitelistFormValue"
            title="Who can see Raffles"
            hint="Who can see Raffles. Use dGuild default, admins only, public, or a specific list."
            show-use-default
            show-admin-only
            show-save
            save-label="Save"
            :dirty="whitelistDirty"
            :loading="savingWhitelist"
            :save-success="whitelistSaveSuccess"
            :save-error="whitelistSaveError"
            @update:model-value="onWhitelistUpdate"
            @save="saveWhitelist"
          />
        </Card>

        <Card>
          <RaffleSlotList
            :slot-cards="slotCards"
            :slots-loading="slotsLoading"
            :can-create-more="canCreateMore"
            :action-tx-status="actionTxStatus"
            :action-submitting="actionSubmitting"
            :action-error="actionError"
            :action-error-raffle="actionErrorRaffle"
            :mint-metadata-by-ticket-mint="mintMetadataByTicketMint"
            @add-reward="openAddRewardModal"
            @start="openStartRaffleModal"
            @pause="onPauseRaffle"
            @resume="onResumeRaffle"
            @edit="openEditRaffleModal"
            @reveal-winner="onRevealWinner"
            @distribute-reward="onDistributeReward"
            @claim-proceeds="onClaimProceeds"
            @close="onCloseRaffle"
            @create="openCreateModal"
            @upgrade="openUpgradeModal"
          />
        </Card>
      </div>

      <div id="raffle-pricing-widget" class="raffle-pricing-wrapper">
        <AdminPricingWidget
          ref="pricingRef"
          module-id="raffles"
          :module-state="moduleState"
          :conditions="liveConditions"
          :subscription="subscription"
          :saving="Boolean(savingWhitelist || saving)"
          :deploying="deploying"
          :save-error="saveError"
          @save="onSave"
          @deploy="onDeploy"
        />
      </div>
    </div>

    <SimpleModal
      :model-value="!!raffleModalMode"
      :title="raffleModalTitle"
      :wide="raffleModalWide"
      @update:model-value="closeRaffleModal"
    >
      <RaffleUpgradeModal
        v-if="raffleModalMode === 'upgrade'"
        :effective-tier-id="effectiveTierId"
        @select-tier="selectUpgradeTier"
      />
      <RaffleAddRewardForm
        v-else-if="raffleModalMode === 'addReward' && selectedRaffleForReward"
        v-model:form="addRewardForm"
        :prize-mint-meta="prizeMintMeta"
        :submitting="addRewardSubmitting"
        :error="addRewardError"
        @submit="onAddRewardSubmit"
        @cancel="closeRaffleModal"
      />
      <RaffleStartConfirm
        v-else-if="raffleModalMode === 'start' && selectedRaffleForStart"
        :raffle-name="selectedRaffleForStart.chainData?.name"
        @confirm="onConfirmStartRaffle"
        @cancel="onCancelStartRaffle"
      />
      <RaffleEditForm
        v-else-if="raffleModalMode === 'edit' && selectedRaffleForEdit"
        v-model:form="editForm"
        :submitting="actionSubmitting === selectedRaffleForEdit?.raffle?.rafflePubkey"
        @submit="onEditRaffleSubmit"
        @cancel="closeRaffleModal"
      />
      <RaffleCreateForm
        v-else-if="raffleModalMode === 'create'"
        :form="createForm"
        :slug="slug"
        :show-gate-select="isDefaultGatePublic"
        :submitting="createSubmitting"
        :error="createError"
        @submit="onCreateSubmit"
        @cancel="closeRaffleModal"
      />
    </SimpleModal>
  </div>
</template>

<script setup lang="ts">
import type { ModuleState } from '@decentraguild/core'
import type { BillingPeriod, ConditionSet } from '@decentraguild/billing'
import { Card } from '~/components/ui/card'
import SimpleModal from '~/components/ui/simple-modal/SimpleModal.vue'
import AdminPricingWidget from '~/components/admin/AdminPricingWidget.vue'
import RaffleSlotList from '~/components/admin/RaffleSlotList.vue'
import RaffleAddRewardForm from '~/components/admin/RaffleAddRewardForm.vue'
import RaffleStartConfirm from '~/components/admin/RaffleStartConfirm.vue'
import RaffleEditForm from '~/components/admin/RaffleEditForm.vue'
import RaffleCreateForm from '~/components/admin/RaffleCreateForm.vue'
import RaffleUpgradeModal from '~/components/admin/RaffleUpgradeModal.vue'
import { useTenantStore } from '~/stores/tenant'
import { nextTick, watch } from 'vue'
import { useQuote } from '~/composables/core/useQuote'
import { useMintMetadataForInput } from '~/composables/mint/useMintMetadataForInput'
import { useAdminRaffleActions } from '~/composables/admin/useAdminRaffleActions'
import { useAdminRaffleModals } from '~/composables/admin/useAdminRaffleModals'
import { useRaffleSlots, type SlotCard, type RaffleItem } from '~/composables/raffles/useRaffleSlots'
import { toRef } from 'vue'
import { resolveGateForTransaction } from '@decentraguild/core'
import { useEffectiveGate } from '~/composables/gates/useEffectiveGate'
import {
  getEscrowWalletFromConnector,
  sendAndConfirmTransaction,
  buildInitializeRaffleTransaction,
  buildPrepareRaffleTransaction,
  buildCloseRaffleTransaction,
  buildEnableRaffleTransaction,
  buildDisableRaffleTransaction,
  buildEditRaffleTransaction,
  buildRevealWinnersTransaction,
  buildClaimPrizeTransaction,
  buildClaimTicketsTransaction,
  deriveRafflePda,
} from '@decentraguild/web3'
import { ComputeBudgetProgram, PublicKey, Transaction } from '@solana/web3.js'
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { useSupabase } from '~/composables/core/useSupabase'
import type { BillingSameTxPrepare } from '~/composables/admin/useAdminBilling'

const BILLING_PLUS_PROGRAM_CU = 400_000

const props = defineProps<{
  slug: string
  moduleState: ModuleState
  subscription: { periodEnd?: string; selectedTierId?: string } | null
  saving?: boolean
  deploying?: boolean
  saveError?: string | null
  handleBillingPayment?: (
    moduleId: string,
    period: BillingPeriod,
    slugToClaim?: string,
    conditions?: ConditionSet,
  ) => Promise<boolean>
  prepareBillingInstructionsForSameTx?: (
    moduleId: string,
    period: BillingPeriod,
    slugToClaim?: string,
    conditions?: ConditionSet,
  ) => Promise<BillingSameTxPrepare>
  confirmBillingFromTxSignature?: (
    paymentId: string,
    txSignature: string,
    slugToClaim?: string,
  ) => Promise<void>
}>()

const emit = defineEmits<{
  save: [period: BillingPeriod, conditions?: ConditionSet]
  deploy: [period: BillingPeriod, conditions?: ConditionSet]
  created: []
}>()

const tenantStore = useTenantStore()
const { connection } = useSolanaConnection()
const tenantRef = computed(() => tenantStore.tenant)
const raffleSettingsRef = computed(() => tenantStore.raffleSettings)
const effectiveRaffleGate = useEffectiveGate(tenantRef, 'raffles', {
  raffleSettings: raffleSettingsRef,
})

const conditions = ref<ConditionSet | null>(null)
const {
  raffleModalMode,
  selectedRaffleForReward,
  selectedRaffleForStart,
  selectedRaffleForEdit,
  raffleModalTitle,
  raffleModalWide,
  closeRaffleModal,
  openCreateModal: openCreateModalBase,
  openEditRaffleModal: openEditRaffleModalBase,
  openAddRewardModal: openAddRewardModalBase,
  openStartRaffleModal: openStartRaffleModalBase,
  openUpgradeModal: openUpgradeModalBase,
} = useAdminRaffleModals()
const addRewardSubmitting = ref(false)
const addRewardError = ref<string | null>(null)
const editForm = reactive({ name: '', description: '', url: '' })
const addRewardForm = reactive({
  prizeMint: '',
  amountDisplay: '',
  imageUrl: '',
})
const upgradeConditionsOverride = ref<ConditionSet | null>(null)
const createSubmitting = ref(false)
const createError = ref<string | null>(null)

const createForm = reactive({
  name: '',
  description: '',
  ticketMint: '',
  ticketPriceDisplay: '',
  maxTicketsDisplay: '',
  gate: null as { programId: string; account: string } | null | 'use-default',
})

const createTicketMeta = useMintMetadataForInput(
  toRef(createForm, 'ticketMint'),
  toRef(createForm, 'ticketPriceDisplay'),
  { fieldLabel: 'Ticket price' }
)

const tenantIdRef = computed(() => tenantStore.tenantId)
const moduleIdRef = ref('raffles')
const { quote, fetchQuote } = useQuote({
  moduleId: moduleIdRef,
  durationDays: ref(30),
})

watch(quote, (q) => {
  if (!q?.meters) {
    conditions.value = null
    return
  }
  conditions.value = { raffleSlotsUsed: q.meters.raffle_slots?.used ?? 0 }
}, { immediate: true })

/** For pricing widget: show price for adding next raffle (raffle_slots target). */
const rafflePricingConditions = computed(() => ({
  raffleSlotsUsed: activeRaffles.value.length + 1,
}))

const liveConditions = computed(() => upgradeConditionsOverride.value ?? rafflePricingConditions.value)

/** Slot limit from grants or tier. Base 1 (default), Grow 3, Pro 10. */
const slotLimit = computed(() => {
  const limit = quote.value?.meters?.raffle_slots?.limit
  if (limit != null && limit >= 1) return limit
  const tierId = props.subscription?.selectedTierId
  return tierId === 'pro' ? 10 : tierId === 'grow' ? 3 : 1
})

/** Tier id for upgrade modal display. */
const effectiveTierId = computed(() =>
  slotLimit.value >= 10 ? 'pro' : slotLimit.value >= 3 ? 'grow' : 'base',
)

function refresh() {
  fetchQuote()
}

const {
  slotCards,
  slotsLoading,
  chainDataByRaffle: _chainDataByRaffle,
  mintMetadataByTicketMint,
  activeRaffles,
  fetchRaffles,
  fetchChainDataForRaffles,
} = useRaffleSlots(tenantIdRef, connection, slotLimit)

function openUpgradeModal() {
  upgradeConditionsOverride.value = null
  openUpgradeModalBase()
}

function selectUpgradeTier(tier: 'grow' | 'pro') {
  upgradeConditionsOverride.value = { raffleSlotsUsed: tier === 'pro' ? 10 : 3 }
  closeRaffleModal()
  nextTick(() => {
    document.getElementById('raffle-pricing-widget')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

const canCreateMore = computed(() => {
  const used = (conditions.value?.raffleSlotsUsed as number) ?? activeRaffles.value.length
  return used < slotLimit.value
})

const raffleSettings = computed(() => tenantStore.raffleSettings)
const whitelistFormValue = computed(() => {
  const rw = raffleSettings.value?.defaultGate
  if (rw === undefined) return 'use-default'
  if (rw === null || rw === 'public') return null
  if (rw === 'use-default') return 'use-default'
  if (rw === 'admin-only') return 'admin-only'
  if (typeof rw === 'object' && rw.account) return rw
  return null
})

const isDefaultGatePublic = computed(() => whitelistFormValue.value === null)

function whitelistToCompareStr(v: typeof whitelistFormValue.value): string {
  if (v === 'use-default') return '__use_default__'
  if (v === 'admin-only') return '__admin_only__'
  return (v && typeof v === 'object' ? v.account : '') ?? ''
}

const initialWhitelist = ref<string | null>(null)
const whitelistDirty = computed(() => whitelistToCompareStr(whitelistFormValue.value) !== (initialWhitelist.value ?? ''))

const savingWhitelist = ref(false)
const whitelistSaveSuccess = ref(false)
const whitelistSaveError = ref<string | null>(null)

function onWhitelistUpdate(value: { programId: string; account: string } | null | 'use-default' | 'admin-only') {
  const next = { ...(raffleSettings.value ?? {}), defaultGate: value === 'use-default' ? 'use-default' : value }
  tenantStore.setRaffleSettings(next)
}

async function saveWhitelist(): Promise<boolean> {
  const id = tenantIdRef.value
  if (!id) return false
  savingWhitelist.value = true
  whitelistSaveError.value = null
  whitelistSaveSuccess.value = false
  try {
    const wl = whitelistFormValue.value
    const settings = { defaultGate: wl === 'use-default' ? 'use-default' : (wl === null ? 'public' : wl) }

    const supabase = useSupabase()
    const { error } = await supabase
      .from('raffle_settings')
      .upsert({ tenant_id: id, settings, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })
    if (error) throw new Error(error.message)

    tenantStore.setRaffleSettings(settings)
    initialWhitelist.value = whitelistToCompareStr(wl)
    whitelistSaveSuccess.value = true
    return true
  } catch (e) {
    whitelistSaveError.value = e instanceof Error ? e.message : 'Failed to save'
    return false
  } finally {
    savingWhitelist.value = false
  }
}

async function ensureRaffleSettingsSaved(): Promise<boolean> {
  if (savingWhitelist.value) return false
  if (!whitelistDirty.value) return true
  return saveWhitelist()
}

async function onSave(period: BillingPeriod) {
  const ok = await ensureRaffleSettingsSaved()
  if (!ok) return
  emit('save', period, upgradeConditionsOverride.value ?? undefined)
}

async function onDeploy(period: BillingPeriod) {
  const ok = await ensureRaffleSettingsSaved()
  if (!ok) return
  emit('deploy', period, upgradeConditionsOverride.value ?? undefined)
}

function openCreateModal(_slotIndex: number) {
  createForm.name = ''
  createForm.description = ''
  createForm.ticketMint = ''
  createForm.ticketPriceDisplay = ''
  createForm.maxTicketsDisplay = ''
  if (isDefaultGatePublic.value) {
    createForm.gate = null
  } else {
    createForm.gate = whitelistFormValue.value === 'use-default' ? 'use-default' : whitelistFormValue.value
  }
  createError.value = null
  openCreateModalBase()
}

async function onCreateSubmit() {
  const name = createForm.name.trim()
  const ticketMint = createForm.ticketMint.trim()
  const maxTicketsParsed = parseInt(createForm.maxTicketsDisplay, 10)
  const maxTickets = maxTicketsParsed > 0 ? maxTicketsParsed : 0
  if (!name || !ticketMint) {
    createError.value = 'Name and ticket mint are required'
    return
  }
  if (maxTickets < 1) {
    createError.value = 'Total tickets is required (minimum 1)'
    return
  }
  const dec = createTicketMeta.metadata.value?.decimals
  if (dec == null) {
    createError.value = 'Enter a valid ticket mint to load decimals first'
    return
  }
  const ticketPriceRaw = createTicketMeta.toRawAmount()
  if (!ticketPriceRaw || ticketPriceRaw === '0') {
    createError.value = 'Ticket price is required'
    return
  }
  const ticketPriceNum = parseFloat(createForm.ticketPriceDisplay) || 0
  if (ticketPriceNum < 0) {
    createError.value = 'Ticket price must be zero or positive'
    return
  }

  const wallet = getEscrowWalletFromConnector()
  if (!wallet?.publicKey) {
    createError.value = 'Wallet not connected'
    return
  }
  if (!connection.value) {
    createError.value = 'Solana RPC not configured'
    return
  }

  const id = tenantIdRef.value
  if (!id) {
    createError.value = 'Tenant not set'
    return
  }

  createSubmitting.value = true
  createError.value = null
  try {
    const conditions: ConditionSet = {
      raffleSlotsUsed: activeRaffles.value.length + 1,
    }
    const prepareBilling = props.prepareBillingInstructionsForSameTx
    const confirmBilling = props.confirmBillingFromTxSignature
    if (!prepareBilling || !confirmBilling) throw new Error('Billing not configured')

    const billingPrep = await prepareBilling('raffles', 'monthly', undefined, conditions)

    const gate = resolveGateForTransaction(
      effectiveRaffleGate.value ?? null,
      createForm.gate,
    )
    const useWhitelist = Boolean(gate?.account?.trim())
    const whitelist = useWhitelist && gate?.account ? gate.account : undefined

    const seed = crypto.getRandomValues(new Uint8Array(8))
    const raffleTx = await buildInitializeRaffleTransaction({
      name,
      description: createForm.description.trim() || '',
      seed,
      ticketMint,
      ticketPrice: ticketPriceRaw,
      ticketDecimals: dec,
      maxTickets,
      useWhitelist,
      whitelist: whitelist ?? null,
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
    for (const ix of raffleTx.instructions) {
      tx.add(ix)
    }

    const txSignature = await sendAndConfirmTransaction(
      connection.value,
      tx,
      wallet,
      wallet.publicKey,
    )

    if (billingPrep.kind === 'usdc') {
      await confirmBilling(billingPrep.paymentId, txSignature)
    }

    const rafflePda = deriveRafflePda(name, seed)
    const supabase = useSupabase()
    const { error: bindErr } = await supabase.functions.invoke('platform', {
      body: { action: 'raffle-bind-tenant', tenantId: id, rafflePubkey: rafflePda.toBase58() },
    })
    if (bindErr) throw new Error(bindErr.message ?? 'Failed to bind raffle')

    closeRaffleModal()
    await fetchRaffles()
    await fetchChainDataForRaffles()
    pricingRef.value?.refresh?.()
    emit('created')
  } catch (e) {
    createError.value = e instanceof Error ? e.message : 'Failed to create'
  } finally {
    createSubmitting.value = false
  }
}

const {
  actionSubmitting,
  actionTxStatus,
  actionError,
  actionErrorRaffle,
  clearActionError: _clearActionError,
  sendWithTxStatus,
  runRaffleAction,
} = useAdminRaffleActions({ connection, onSuccess: fetchChainDataForRaffles })

const prizeMintMeta = useMintMetadataForInput(
  toRef(addRewardForm, 'prizeMint'),
  toRef(addRewardForm, 'amountDisplay'),
  { fieldLabel: 'Amount' }
)

function openStartRaffleModal(slot: SlotCard) {
  openStartRaffleModalBase(slot)
}

async function onConfirmStartRaffle() {
  const slot = selectedRaffleForStart.value
  if (!slot?.raffle || !connection.value) return
  const wallet = getEscrowWalletFromConnector()
  if (!wallet?.publicKey) return
  closeRaffleModal()
  await runRaffleAction(slot.raffle.rafflePubkey, async () => {
    const tx = await buildEnableRaffleTransaction({ rafflePubkey: slot.raffle!.rafflePubkey, wallet })
    const sig = await sendWithTxStatus(connection.value!, tx, wallet, wallet.publicKey)
    if (!sig) throw new Error('Transaction failed')
  }, 'Failed to start raffle')
}

function onCancelStartRaffle() {
  closeRaffleModal()
}

async function onPauseRaffle(slot: SlotCard) {
  if (!slot.raffle) return
  await runRaffleAction(slot.raffle.rafflePubkey, async () => {
    const wallet = getEscrowWalletFromConnector()!
    const tx = await buildDisableRaffleTransaction({ rafflePubkey: slot.raffle!.rafflePubkey, wallet })
    const sig = await sendWithTxStatus(connection.value!, tx, wallet, wallet.publicKey)
    if (!sig) throw new Error('Transaction failed')
  }, 'Failed to pause raffle')
}

async function onResumeRaffle(slot: SlotCard) {
  if (!slot.raffle) return
  await runRaffleAction(slot.raffle.rafflePubkey, async () => {
    const wallet = getEscrowWalletFromConnector()!
    const tx = await buildEnableRaffleTransaction({ rafflePubkey: slot.raffle!.rafflePubkey, wallet })
    const sig = await sendWithTxStatus(connection.value!, tx, wallet, wallet.publicKey)
    if (!sig) throw new Error('Transaction failed')
  }, 'Failed to resume raffle')
}

function openEditRaffleModal(slot: SlotCard) {
  editForm.name = slot.chainData?.name ?? ''
  editForm.description = slot.chainData?.description ?? ''
  editForm.url = slot.chainData?.url ?? ''
  openEditRaffleModalBase(slot)
}

async function onEditRaffleSubmit() {
  const slot = selectedRaffleForEdit.value
  if (!slot?.raffle || !connection.value) return
  const wallet = getEscrowWalletFromConnector()
  if (!wallet?.publicKey) return
  closeRaffleModal()
  await runRaffleAction(slot.raffle.rafflePubkey, async () => {
    const tx = await buildEditRaffleTransaction({
      rafflePubkey: slot.raffle!.rafflePubkey,
      name: editForm.name.trim(),
      description: editForm.description.trim(),
      url: editForm.url.trim(),
      wallet,
    })
    const sig = await sendWithTxStatus(connection.value!, tx, wallet, wallet.publicKey)
    if (!sig) throw new Error('Transaction failed')
  }, 'Failed to edit raffle')
}

async function onRevealWinner(slot: SlotCard) {
  if (!slot.raffle) return
  await runRaffleAction(slot.raffle.rafflePubkey, async () => {
    const wallet = getEscrowWalletFromConnector()!
    const tx = await buildRevealWinnersTransaction({ rafflePubkey: slot.raffle!.rafflePubkey, wallet })
    const sig = await sendWithTxStatus(connection.value!, tx, wallet, wallet.publicKey)
    if (!sig) throw new Error('Transaction failed')
  }, 'Failed to reveal winner')
}

async function onDistributeReward(slot: SlotCard) {
  if (!slot.raffle || !slot.chainData?.winner || !connection.value) return
  const wallet = getEscrowWalletFromConnector()
  if (!wallet?.publicKey) return
  const prizeMintPk = new PublicKey(slot.chainData.prizeMint)
  const winnerPk = new PublicKey(slot.chainData.winner)
  const winnerAta = getAssociatedTokenAddressSync(prizeMintPk, winnerPk, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
  await runRaffleAction(slot.raffle.rafflePubkey, async () => {
    const conn = connection.value!
    const claimTx = await buildClaimPrizeTransaction({
      rafflePubkey: slot.raffle!.rafflePubkey,
      prizeMint: slot.chainData!.prizeMint,
      winnerAta,
      connection: conn,
      wallet,
    })
    const tx = new Transaction()
    const winnerAtaInfo = await conn.getAccountInfo(winnerAta)
    if (!winnerAtaInfo) {
      tx.add(createAssociatedTokenAccountInstruction(wallet.publicKey, winnerAta, winnerPk, prizeMintPk, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID))
    }
    tx.add(...claimTx.instructions)
    const sig = await sendWithTxStatus(conn, tx, wallet, wallet.publicKey)
    if (!sig) throw new Error('Transaction failed')
  }, 'Failed to distribute reward')
}

async function onClaimProceeds(slot: SlotCard) {
  if (!slot.raffle || !slot.chainData || !connection.value) return
  const wallet = getEscrowWalletFromConnector()
  if (!wallet?.publicKey) return
  const ticketMintPk = new PublicKey(slot.chainData.ticketMint)
  const creatorAta = getAssociatedTokenAddressSync(ticketMintPk, wallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
  await runRaffleAction(slot.raffle.rafflePubkey, async () => {
    const conn = connection.value!
    const claimTx = await buildClaimTicketsTransaction({
      rafflePubkey: slot.raffle!.rafflePubkey,
      ticketMint: slot.chainData!.ticketMint,
      creatorAta,
      wallet,
    })
    const tx = new Transaction()
    const creatorAtaInfo = await conn.getAccountInfo(creatorAta)
    if (!creatorAtaInfo) {
      tx.add(createAssociatedTokenAccountInstruction(wallet.publicKey, creatorAta, wallet.publicKey, ticketMintPk, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID))
    }
    tx.add(...claimTx.instructions)
    const sig = await sendWithTxStatus(conn, tx, wallet, wallet.publicKey)
    if (!sig) throw new Error('Transaction failed')
  }, 'Failed to claim proceeds')
}

async function onCloseRaffle(raffle: RaffleItem) {
  await runRaffleAction(
    raffle.rafflePubkey,
    async () => {
      const wallet = getEscrowWalletFromConnector()
      if (!wallet?.publicKey) throw new Error('Wallet not connected')
      const tx = await buildCloseRaffleTransaction({
        rafflePubkey: raffle.rafflePubkey,
        connection: connection.value!,
        wallet,
      })
      const sig = await sendWithTxStatus(connection.value!, tx, wallet, wallet.publicKey)
      if (!sig) throw new Error('Transaction failed')
      const supabase = useSupabase()
      const { error: closeError } = await supabase
        .from('tenant_raffles')
        .update({ closed_at: new Date().toISOString() })
        .eq('tenant_id', tenantIdRef.value)
        .eq('raffle_pubkey', raffle.rafflePubkey)
      if (closeError) throw new Error(closeError.message)
    },
    'Failed to close raffle',
    fetchRaffles
  )
}

function openAddRewardModal(raffle: RaffleItem) {
  addRewardForm.prizeMint = ''
  addRewardForm.amountDisplay = ''
  addRewardForm.imageUrl = ''
  addRewardError.value = null
  openAddRewardModalBase(raffle)
}

async function onAddRewardSubmit() {
  const raffle = selectedRaffleForReward.value
  if (!raffle || !connection.value) return

  const prizeMint = addRewardForm.prizeMint.trim()
  const _amountStr = addRewardForm.amountDisplay.trim()
  if (!prizeMint) {
    addRewardError.value = 'Prize mint is required'
    return
  }
  const dec = prizeMintMeta.metadata.value?.decimals
  if (dec == null) {
    addRewardError.value = 'Enter a valid prize mint to load decimals first'
    return
  }
  const amountRaw = prizeMintMeta.toRawAmount()
  if (!amountRaw || amountRaw === '0') {
    addRewardError.value = 'Amount is required'
    return
  }

  const wallet = getEscrowWalletFromConnector()
  if (!wallet?.publicKey) {
    addRewardError.value = 'Wallet not connected'
    return
  }

  addRewardSubmitting.value = true
  addRewardError.value = null
  try {
    const raffleTx = await buildPrepareRaffleTransaction({
      rafflePubkey: raffle.rafflePubkey,
      prizeMint,
      amount: BigInt(amountRaw),
      imageUrl: addRewardForm.imageUrl.trim() || undefined,
      connection: connection.value,
      wallet,
    })

    const sig = await sendWithTxStatus(connection.value, raffleTx, wallet, wallet.publicKey)
    if (!sig) throw new Error('Transaction failed')

    closeRaffleModal()
    await fetchRaffles()
  } catch (e) {
    addRewardError.value = e instanceof Error ? e.message : 'Failed to add reward'
  } finally {
    addRewardSubmitting.value = false
    actionTxStatus.value = null
  }
}

onMounted(async () => {
  const id = tenantIdRef.value
  if (!id) return
  await fetchRaffles()
  try {
    const supabase = useSupabase()
    const { data } = await supabase
      .from('raffle_settings')
      .select('settings')
      .eq('tenant_id', id)
      .maybeSingle()
    if (data?.settings) {
      const s = data.settings as Record<string, unknown>
      const dg = s.defaultGate
      const val = dg === undefined ? 'use-default' : dg === null || dg === 'public' ? null : dg === 'use-default' ? 'use-default' : dg === 'admin-only' ? 'admin-only' : (dg && typeof dg === 'object' && (dg as { account?: string }).account ? (dg as { account: string }) : null)
      initialWhitelist.value = whitelistToCompareStr(val)
    }
  } catch {
    /* ignore */
  }
})

const pricingRef = ref<InstanceType<typeof AdminPricingWidget> | null>(null)
function clearUpgradeConditions() {
  upgradeConditionsOverride.value = null
}

defineExpose({
  pricingRef,
  clearUpgradeConditions,
  refresh: () => {
    refresh()
    pricingRef.value?.refresh?.()
    fetchRaffles()
  },
})
</script>

<style scoped>
.admin__hint {
  margin: 0 0 var(--theme-space-md);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
.admin__panel-actions {
  margin-top: var(--theme-space-md);
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
}
.admin__success {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-success);
}
.admin__error {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}

:deep(.raffle-slots) {
  margin-top: var(--theme-space-xl);
}
:deep(.raffle-slots__tx-status) {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  margin: 0 0 var(--theme-space-md);
  font-size: var(--theme-font-sm);
  color: var(--theme-primary);
}
:deep(.raffle-slots__tx-spinner) {
  animation: raffle-spin 1s linear infinite;
}
:deep(.raffle-slots__loading) {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  color: var(--theme-text-muted);
  font-size: var(--theme-font-sm);
  padding: var(--theme-space-lg);
}
:deep(.raffle-slots__spinner) {
  animation: raffle-spin 1s linear infinite;
}
@keyframes raffle-spin {
  to { transform: rotate(360deg); }
}
:deep(.raffle-slots__hint) {
  margin-bottom: var(--theme-space-sm);
}
:deep(.raffle-slots__grid) {
  margin-top: var(--theme-space-md);
}

:deep(.raffle-slot-card) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  padding: var(--theme-space-lg);
  border: 2px dashed var(--theme-border);
  border-radius: var(--theme-radius-lg);
  background: var(--theme-bg-card);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}
:deep(.raffle-slot-card--empty:hover:not(:disabled)) {
  border-color: var(--theme-primary);
  background: var(--theme-bg-secondary);
}
:deep(.raffle-slot-card:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}
.raffle-slot-card__plus {
  font-size: 3rem;
  color: var(--theme-text-muted);
  margin-bottom: var(--theme-space-sm);
}
:deep(.raffle-slot-card--empty:hover:not(:disabled) .raffle-slot-card__plus) {
  color: var(--theme-primary);
}
:deep(.raffle-slot-card__label) {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

:deep(.raffle-slot-card--upgrade) {
  min-height: 120px;
  border-color: var(--theme-primary);
  border-style: dashed;
  background: transparent;
}
:deep(.raffle-slot-card--upgrade:hover) {
  background: var(--theme-bg-secondary);
  border-color: var(--theme-primary);
}
:deep(.raffle-slot-card__upgrade-icon) {
  font-size: 1.5rem;
  color: var(--theme-primary);
  margin-bottom: var(--theme-space-xs);
}
:deep(.raffle-slot-card__upgrade-label) {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  color: var(--theme-primary);
}
:deep(.raffle-slot-card__upgrade-hint) {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  margin-top: 2px;
}

.raffle-pricing-wrapper {
  scroll-margin-top: var(--theme-space-lg);
}

:deep(.raffle-upgrade-modal) {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-lg);
}
:deep(.raffle-upgrade-modal__hint) {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
:deep(.raffle-upgrade-modal__options) {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--theme-space-md);
}
:deep(.raffle-upgrade-option) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--theme-space-xs);
  padding: var(--theme-space-lg);
  border: 2px solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  background: var(--theme-bg-card);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}
:deep(.raffle-upgrade-option:hover) {
  border-color: var(--theme-primary);
  background: var(--theme-bg-secondary);
}
:deep(.raffle-upgrade-option--disabled),
:deep(.raffle-upgrade-option--disabled:hover) {
  cursor: default;
  opacity: 0.7;
  border-color: var(--theme-border);
  background: var(--theme-bg-card);
}
:deep(.raffle-upgrade-option--current .raffle-upgrade-option__price) {
  color: var(--theme-text-secondary);
}
:deep(.raffle-upgrade-option__badge) {
  font-size: var(--theme-font-xs);
  font-weight: 600;
  color: var(--theme-text-muted);
  text-transform: uppercase;
}
:deep(.raffle-upgrade-option__name) {
  font-size: var(--theme-font-lg);
  font-weight: 600;
  color: var(--theme-text-primary);
}
:deep(.raffle-upgrade-option__slots) {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
:deep(.raffle-upgrade-option__price) {
  font-size: var(--theme-font-md);
  font-weight: 600;
  color: var(--theme-primary);
}
:deep(.raffle-upgrade-modal__note) {
  margin: 0;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

:deep(.raffle-create-form) {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
  min-width: 320px;
}
:deep(.raffle-create-form__error) {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}
:deep(.raffle-create-form__actions) {
  display: flex;
  justify-content: flex-end;
  gap: var(--theme-space-sm);
  margin-top: var(--theme-space-sm);
}

</style>
