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
            :refresh-loading="raffleRefreshLoading"
            :can-create-more="canCreateMore"
            :action-tx-status="actionTxStatus"
            :action-submitting="actionSubmitting"
            :action-error="actionError"
            :action-error-raffle="actionErrorRaffle"
            :mint-metadata-by-ticket-mint="mintMetadataByTicketMint"
            @refresh="onRefreshRaffles"
            @add-reward="openAddRewardModal"
            @start="openStartRaffleModal"
            @pause="onPauseRaffle"
            @resume="onResumeRaffle"
            @edit="openEditRaffleModal"
            @reveal-winner="onRevealWinner"
            @play-battle-reveal="openBattleReveal"
            @distribute-reward="onDistributeReward"
            @claim-proceeds="onClaimProceeds"
            @refund-prize-before-start="onRefundPrizeBeforeStart"
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
          :save-error="saveError ?? null"
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
        :grow-plan="growPlan"
        :pro-plan="proPlan"
        :plans-loading="upgradePlansLoading"
        :plans-error="upgradePlansError"
        @select-tier="selectUpgradeTier"
      />
      <RaffleAddRewardForm
        v-else-if="raffleModalMode === 'addReward' && selectedRaffleForReward"
        :key="selectedRaffleForReward.rafflePubkey"
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
        v-model:form="createForm"
        :slug="slug"
        :submitting="createSubmitting"
        :error="createError"
        @submit="onCreateSubmit"
        @cancel="closeRaffleModal"
      />
    </SimpleModal>

    <RaffleBattleRevealModal
      v-model="battleOpen"
      :raffle-name="battleRaffleTitle"
      :raffle-pubkey="battleRafflePubkey ?? ''"
      :winner-pubkey="battleWinnerPubkey"
      :loading="battleHoldersLoading"
      :load-error="battleHoldersError"
      :matches-sold="battleHoldersMatchSold"
      :display-rows="battleDisplayRows"
      :raw-holder-rows="battleRawHolderRows"
      :format-wallet="formatBattleWallet"
    />
  </div>
</template>

<script setup lang="ts">
import type { MarketplaceGateSettings, ModuleState, TransactionGateOverride } from '@decentraguild/core'
import type { BillingPeriod, ConditionSet } from '@decentraguild/billing'
import type { BillingSameTxPrepare } from '~/composables/admin/useAdminBilling'
import type { SubscriptionInfo } from '~/composables/admin/useAdminSubscriptions'
import { Card } from '~/components/ui/card'
import SimpleModal from '~/components/ui/simple-modal/SimpleModal.vue'
import AdminPricingWidget from '~/components/admin/AdminPricingWidget.vue'
import RaffleSlotList from '~/components/admin/RaffleSlotList.vue'
import RaffleAddRewardForm from '~/components/admin/RaffleAddRewardForm.vue'
import RaffleStartConfirm from '~/components/admin/RaffleStartConfirm.vue'
import RaffleEditForm from '~/components/admin/RaffleEditForm.vue'
import RaffleCreateForm from '~/components/admin/RaffleCreateForm.vue'
import RaffleUpgradeModal from '~/components/admin/RaffleUpgradeModal.vue'
import RaffleBattleRevealModal from '~/components/raffle/RaffleBattleRevealModal.vue'
import { useTenantStore, type RaffleSettings } from '~/stores/tenant'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useQuote } from '~/composables/core/useQuote'
import { useAdminRaffleActions } from '~/composables/admin/useAdminRaffleActions'
import { useAdminRaffleModals } from '~/composables/admin/useAdminRaffleModals'
import { useRaffleSlots } from '~/composables/raffles/useRaffleSlots'
import type { SlotCard } from '~/composables/raffles/useRaffleSlots'
import { useRaffleTicketHolders } from '~/composables/raffle/useRaffleTicketHolders'
import { useMemberProfiles } from '~/composables/members/useMemberProfiles'
import { useEffectiveGate } from '~/composables/gates/useEffectiveGate'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { useSupabase } from '~/composables/core/useSupabase'
import { useAdminRaffleCreate } from '~/composables/admin/useAdminRaffleCreate'
import { useAdminRaffleSlotActions } from '~/composables/admin/useAdminRaffleSlotActions'
import { useRaffleUpgradePlans } from '~/composables/admin/useRaffleUpgradePlans'

const props = defineProps<{
  slug: string
  moduleState: ModuleState
  subscription: SubscriptionInfo | null
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
  confirmBillingFromTxSignature?: (paymentId: string, txSignature: string) => Promise<void>
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
const upgradeConditionsOverride = ref<ConditionSet | null>(null)
const {
  grow: growPlan,
  pro: proPlan,
  loading: upgradePlansLoading,
  error: upgradePlansError,
  fetchPlans,
} = useRaffleUpgradePlans()

watch(raffleModalMode, (m) => {
  if (m === 'upgrade') void fetchPlans()
})

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

const rafflePricingConditions = computed(() => ({
  raffleSlotsUsed: activeRaffles.value.length + 1,
}))

const liveConditions = computed(() => upgradeConditionsOverride.value ?? rafflePricingConditions.value)

const slotLimit = computed(() => {
  const limit = quote.value?.meters?.raffle_slots?.limit
  if (limit != null && limit >= 1) return limit
  const snap = props.subscription?.conditionsSnapshot?.raffle_slots
  if (typeof snap === 'number' && snap >= 1) return snap
  const tierId = props.subscription?.selectedTierId
  return tierId === 'pro' ? 10 : tierId === 'grow' ? 3 : 1
})

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

const raffleRefreshLoading = ref(false)

async function onRefreshRaffles() {
  if (raffleRefreshLoading.value || slotsLoading.value) return
  raffleRefreshLoading.value = true
  try {
    await fetchRaffles({ silent: true })
    fetchQuote()
    await pricingRef.value?.refresh?.()
  } finally {
    raffleRefreshLoading.value = false
  }
}

const battleOpen = ref(false)
const battleRafflePubkey = ref<string | null>(null)

const battleHolderContext = computed(() => {
  if (!battleOpen.value || !battleRafflePubkey.value) return null
  const card = slotCards.value.find((c) => c.raffle?.rafflePubkey === battleRafflePubkey.value)
  const d = card?.chainData
  if (!card?.raffle || !d || d.ticketsSold < 1) return null
  return {
    rafflePubkey: card.raffle.rafflePubkey,
    ticketMint: d.ticketMint,
    ticketsSold: d.ticketsSold,
    ticketDecimals: d.ticketDecimals,
  }
})

const {
  loading: battleHoldersLoading,
  error: battleHoldersError,
  rows: battleDisplayRows,
  rawRows: battleRawHolderRows,
  matchesSold: battleHoldersMatchSold,
} = useRaffleTicketHolders(battleHolderContext)

const battleChainSlot = computed(() =>
  slotCards.value.find((c) => c.raffle?.rafflePubkey === battleRafflePubkey.value) ?? null,
)

const battleWinnerPubkey = computed(() => battleChainSlot.value?.chainData?.winner?.trim() ?? '')
const battleRaffleTitle = computed(() => battleChainSlot.value?.chainData?.name ?? '')

const { resolveWallet } = useMemberProfiles()

function formatBattleWallet(pubkey: string, head = 8, tail = 6) {
  return resolveWallet(pubkey, head, tail)
}

function openBattleReveal(slot: SlotCard) {
  const pk = slot.raffle?.rafflePubkey
  if (!pk) return
  battleRafflePubkey.value = pk
  battleOpen.value = true
}

watch(battleOpen, (v) => {
  if (!v) battleRafflePubkey.value = null
})

function openUpgradeModal() {
  upgradeConditionsOverride.value = null
  openUpgradeModalBase()
}

function selectUpgradeTier(tier: 'grow' | 'pro') {
  const limit =
    tier === 'pro' ? (proPlan.value?.slotLimit ?? 10) : (growPlan.value?.slotLimit ?? 3)
  upgradeConditionsOverride.value = { raffleSlotsUsed: limit }
  closeRaffleModal()
  nextTick(() => {
    document.getElementById('raffle-pricing-widget')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

const canCreateMore = computed(
  () => activeRaffles.value.length < slotLimit.value,
)

const raffleSettings = computed(() => tenantStore.raffleSettings)

type RaffleWhitelistFormValue = TransactionGateOverride | 'admin-only' | null

const whitelistFormValue = computed((): RaffleWhitelistFormValue => {
  const rw = raffleSettings.value?.defaultGate
  if (rw === undefined) return 'use-default'
  if (rw === null || rw === 'public') return null
  if (rw === 'use-default') return 'use-default'
  if (rw === 'admin-only') return 'admin-only'
  if (typeof rw === 'object' && rw.programId && rw.account) return rw
  return null
})

const isDefaultGatePublic = computed(() => whitelistFormValue.value === null)

function whitelistToCompareStr(v: RaffleWhitelistFormValue): string {
  if (v === 'use-default') return '__use_default__'
  if (v === 'admin-only') return '__admin_only__'
  return (v && typeof v === 'object' ? v.account : '') ?? ''
}

const initialWhitelist = ref<string | null>(null)
const whitelistDirty = computed(() => whitelistToCompareStr(whitelistFormValue.value) !== (initialWhitelist.value ?? ''))

const savingWhitelist = ref(false)
const whitelistSaveSuccess = ref(false)
const whitelistSaveError = ref<string | null>(null)

function onWhitelistUpdate(
  value: MarketplaceGateSettings | null | 'use-default' | 'admin-only',
) {
  const defaultGate: RaffleSettings['defaultGate'] =
    value === 'use-default' ? 'use-default' : value
  tenantStore.setRaffleSettings({ ...(raffleSettings.value ?? {}), defaultGate })
}

async function saveWhitelist(): Promise<boolean> {
  const id = tenantIdRef.value
  if (!id) return false
  savingWhitelist.value = true
  whitelistSaveError.value = null
  whitelistSaveSuccess.value = false
  try {
    const wl = whitelistFormValue.value
    const settings: RaffleSettings = {
      defaultGate:
        wl === 'use-default'
          ? 'use-default'
          : wl === null
            ? 'public'
            : wl === 'admin-only'
              ? 'admin-only'
              : wl,
    }

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

const {
  actionSubmitting,
  actionTxStatus,
  actionError,
  actionErrorRaffle,
  clearActionError: _clearActionError,
  sendWithTxStatus,
  runRaffleAction,
} = useAdminRaffleActions({ connection, onSuccess: fetchChainDataForRaffles })

const pricingRef = ref<InstanceType<typeof AdminPricingWidget> | null>(null)

const {
  createForm,
  createSubmitting,
  createError,
  openCreateModal,
  onCreateSubmit,
} = useAdminRaffleCreate({
  connection,
  tenantId: tenantIdRef,
  activeRaffleCount: computed(() => activeRaffles.value.length),
  effectiveRaffleGate,
  isDefaultGatePublic,
  whitelistFormValue,
  prepareBilling: computed(() => props.prepareBillingInstructionsForSameTx),
  confirmBilling: computed(() => props.confirmBillingFromTxSignature),
  closeRaffleModal,
  openCreateModalBase,
  fetchRaffles,
  fetchChainDataForRaffles,
  onCreated: () => emit('created'),
  refreshPricing: () => pricingRef.value?.refresh?.(),
})

const {
  editForm,
  addRewardForm,
  addRewardSubmitting,
  addRewardError,
  prizeMintMeta,
  openStartRaffleModal,
  onConfirmStartRaffle,
  onCancelStartRaffle,
  onPauseRaffle,
  onResumeRaffle,
  openEditRaffleModal,
  onEditRaffleSubmit,
  onRevealWinner,
  onDistributeReward,
  onClaimProceeds,
  onRefundPrizeBeforeStart,
  onCloseRaffle,
  openAddRewardModal,
  onAddRewardSubmit,
} = useAdminRaffleSlotActions({
  connection,
  tenantId: tenantIdRef,
  selectedRaffleForStart,
  selectedRaffleForReward,
  selectedRaffleForEdit,
  closeRaffleModal,
  openStartRaffleModalBase,
  openEditRaffleModalBase,
  openAddRewardModalBase,
  sendWithTxStatus,
  runRaffleAction,
  actionTxStatus,
  fetchRaffles,
})

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
      let val: RaffleWhitelistFormValue
      if (dg === undefined) {
        val = 'use-default'
      } else if (dg === null || dg === 'public') {
        val = null
      } else if (dg === 'use-default') {
        val = 'use-default'
      } else if (dg === 'admin-only') {
        val = 'admin-only'
      } else if (
        dg &&
        typeof dg === 'object' &&
        typeof (dg as MarketplaceGateSettings).programId === 'string' &&
        typeof (dg as MarketplaceGateSettings).account === 'string'
      ) {
        val = dg as MarketplaceGateSettings
      } else {
        val = null
      }
      initialWhitelist.value = whitelistToCompareStr(val)
    }
  } catch {
    /* ignore */
  }
})

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
  border: var(--theme-border-medium) dashed var(--theme-border);
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
:deep(.raffle-upgrade-modal__error) {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
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
  border: var(--theme-border-medium) solid var(--theme-border);
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
