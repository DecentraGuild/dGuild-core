<template>
  <PageSection :title="adminPageTitle">
    <div class="admin">
      <AdminGeneralTab
        v-if="tab === 'general'"
        :form="form"
        :tenant="tenant ?? null"
        :desired-slug="desiredSlug"
        :slug-check-status="slugCheckStatus"
        :slug-checking="slugChecking"
        :slug-claiming="slugClaiming"
        :slug-error="slugClaim.slugError.value"
        @update:desired-slug="(v: string) => slugClaim.setDesiredSlug(v)"
        @slug-check-blur="slugClaim.onSlugCheckBlur()"
        @check-slug="slugClaim.checkSlugAvailability()"
      >
        <template #sidebar>
          <AdminPricingWidget
            v-if="showSlugPricingWidget"
            module-id="slug"
            :module-state="slugModuleState"
            :subscription="subscriptions.slug ?? null"
            :yearly-only="true"
            :saving="saving"
            :deploying="slugClaiming"
            :save-error="saveError"
            @deploy="(p: BillingPeriod) => slugClaim.claimSlugWithPeriod(p)"
            @extend="(p: BillingPeriod) => slugClaim.extendSlug(p)"
            @reactivate="(p: BillingPeriod) => slugClaim.extendSlug(p)"
          />
        </template>
      </AdminGeneralTab>

      <AdminThemingTab
        v-else-if="tab === 'theming'"
        :branding="form.branding"
      />

      <AdminGatingTab
        v-else-if="tab === 'gating'"
        :default-gate-ref="toRef(form, 'defaultGate')"
      />

      <AdminModulesTab
        v-else-if="tab === 'modules'"
        :form="form"
        :module-ids="moduleIds"
        @module-toggle="onModuleToggle"
      />

      <AdminMarketplaceTab
        v-else-if="tab === 'marketplace'"
        :slug="slug ?? ''"
        :settings="marketplaceSettings"
        :module-state="marketplaceModuleState"
        :subscription="subscriptions.marketplace ?? null"
        :saving="saving"
        :deploying="deploying"
        :save-error="saveError"
        @saved="onMarketplaceSaved"
        @save="(p: BillingPeriod) => handleBillingPayment('marketplace', p)"
        @deploy="(p: BillingPeriod, cond?: Record<string, number | boolean>) => deployModule('marketplace', p, cond)"
        @reactivate="(p: BillingPeriod) => handleReactivate('marketplace', p)"
      />

      <AdminDiscordTab
        v-else-if="tab === 'discord'"
        :slug="slug ?? ''"
      />

      <AdminRaffleTab
        v-else-if="tab === 'raffle'"
        ref="raffleTabRef"
        :slug="slug ?? ''"
        :module-state="raffleModuleState"
        :subscription="subscriptions.raffles ?? null"
        :saving="saving"
        :deploying="deploying"
        :save-error="saveError"
        :handle-billing-payment="handleBillingPayment"
        :prepare-billing-instructions-for-same-tx="prepareBillingInstructionsForSameTx"
        :confirm-billing-from-tx-signature="confirmBillingFromTxSignature"
        @save="(p: BillingPeriod, cond?: Record<string, number>) => handleRaffleBilling(p, cond)"
        @deploy="(p: BillingPeriod, cond?: Record<string, number>) => handleRaffleBilling(p, cond)"
        @created="fetchSubscription('raffles')"
      />

      <AdminGatesTab
        v-else-if="tab === 'gates'"
        :slug="slug ?? ''"
        :module-state="gatesModuleState"
        :subscription="subscriptions.gates ?? null"
        :deploying="deploying"
        :handle-billing-payment="handleBillingPayment"
        :prepare-billing-instructions-for-same-tx="prepareBillingInstructionsForSameTx"
        :confirm-billing-from-tx-signature="confirmBillingFromTxSignature"
        @deploy="(p: BillingPeriod, cond?: Record<string, number | boolean>) => deployModule('gates', p, cond)"
        @created="fetchSubscription('gates')"
      />

      <AdminAddressbookTab
        v-else-if="tab === 'addressbook'"
        :slug="slug ?? ''"
      />

      <AdminWatchtowerTab
        v-else-if="tab === 'watchtower'"
        ref="watchtowerTabRef"
        :slug="slug ?? ''"
        :module-state="watchtowerModuleState"
        :subscription="subscriptions.watchtower ?? null"
        :saving="saving"
        :deploying="deploying"
        :save-error="saveError"
        @save="(p: BillingPeriod, c?: Record<string, number>) => handleWatchtowerSave(p, c)"
        @deploy="(p: BillingPeriod, c?: Record<string, number>) => handleWatchtowerSave(p, c)"
        @reactivate="(p: BillingPeriod) => handleReactivate('watchtower', p)"
      />

      <AdminConditionsTab
        v-else-if="tab === 'conditions'"
        :slug="slug ?? ''"
      />

      <AdminPlanShipmentTab
        v-else-if="tab === 'plan-shipment'"
        :slug="slug ?? ''"
        :module-state="shipmentModuleState"
      />

      <AdminVouchersTab
        v-else-if="tab === 'vouchers'"
      />

      <AdminBillingTab
        v-else-if="tab === 'billing'"
        :slug="slug"
        :form="form"
        :tenant="tenant ?? null"
        :module-ids="moduleIds"
        :subscriptions="subscriptions"
        :extending-module-id="extendingModuleId"
        :extending="extending"
        :extend-period="extendPeriod"
        :save-error="saveError"
        @start-extend="startExtend"
        @confirm-extend="confirmExtend"
        @cancel-extend="cancelExtend"
        @update:extend-period="setExtendPeriod"
      />

      <div v-if="!hasWidgetTab && tab !== 'billing' && tab !== 'vouchers' && tab !== 'addressbook' && tab !== 'modules' && tab !== 'gating' && tab !== 'conditions'" class="admin__actions">
        <Button variant="default" :disabled="saving" @click="save">
          Save
        </Button>
        <p v-if="saveError" class="admin__error">{{ saveError }}</p>
      </div>
    </div>

    <AdminModuleActivationModal
      :model-value="showActivationModal"
      :module-id="activationModalModuleId"
      @update:model-value="onActivationModalClose"
      @activate="confirmModuleActivate"
    />

    <SimpleModal
      :model-value="showDeactivateConfirm"
      title="Disable module?"
      @update:model-value="(v: boolean) => !v && cancelDeactivate()"
    >
      <div v-if="pendingDeactivateModuleId" class="admin__deactivate-modal">
        <p v-if="getSubscriptionPeriodEnd(pendingDeactivateModuleId)">
          The module will stay active until the end of your current billing period.
          After that, it will turn off automatically.
        </p>
        <p v-else>
          The module will turn off immediately.
        </p>
        <p v-if="getSubscriptionPeriodEnd(pendingDeactivateModuleId!)" class="admin__deactivate-date">
          End of period: {{ formatDeactivationDate(getSubscriptionPeriodEnd(pendingDeactivateModuleId!)!) }}
        </p>
        <div class="admin__deactivate-actions">
          <Button variant="secondary" @click="cancelDeactivate">
            Cancel
          </Button>
          <Button variant="default" @click="confirmDeactivate">
            {{ getSubscriptionPeriodEnd(pendingDeactivateModuleId!) ? 'Disable at period end' : 'Disable now' }}
          </Button>
        </div>
      </div>
    </SimpleModal>
  </PageSection>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'admin-auth' })
import type { BillingPeriod } from '@decentraguild/billing'
import { getModuleState } from '@decentraguild/core'
import { getModuleCatalogEntry } from '@decentraguild/catalog'
import { Button } from '~/components/ui/button'
import SimpleModal from '~/components/ui/simple-modal/SimpleModal.vue'
import { useTenantStore } from '~/stores/tenant'
import { MODULE_SUBNAV } from '~/config/modules'
import type { MarketplaceSettings } from '@decentraguild/core'
import { defineAsyncComponent } from 'vue'

const AdminGeneralTab = defineAsyncComponent(() => import('~/components/admin/AdminGeneralTab.vue'))
const AdminThemingTab = defineAsyncComponent(() => import('~/components/admin/AdminThemingTab.vue'))
const AdminModulesTab = defineAsyncComponent(() => import('~/components/admin/AdminModulesTab.vue'))
const AdminMarketplaceTab = defineAsyncComponent(() => import('~/components/admin/AdminMarketplaceTab.vue'))
const AdminDiscordTab = defineAsyncComponent(() => import('~/components/admin/AdminDiscordTab.vue'))
const AdminRaffleTab = defineAsyncComponent(() => import('~/components/admin/AdminRaffleTab.vue'))
const AdminGatingTab = defineAsyncComponent(() => import('~/components/admin/AdminGatingTab.vue'))
const AdminGatesTab = defineAsyncComponent(() => import('~/components/admin/AdminGatesTab.vue'))
const AdminAddressbookTab = defineAsyncComponent(() => import('~/components/admin/AdminAddressbookTab.vue'))
const AdminWatchtowerTab = defineAsyncComponent(() => import('~/components/admin/AdminWatchtowerTab.vue'))
const AdminConditionsTab = defineAsyncComponent(() => import('~/components/admin/AdminConditionsTab.vue'))
const AdminPlanShipmentTab = defineAsyncComponent(() => import('~/components/admin/AdminPlanShipmentTab.vue'))
const AdminVouchersTab = defineAsyncComponent(() => import('~/components/admin/AdminVouchersTab.vue'))
const AdminBillingTab = defineAsyncComponent(() => import('~/components/admin/AdminBillingTab.vue'))
const AdminModuleActivationModal = defineAsyncComponent(() => import('~/components/admin/AdminModuleActivationModal.vue'))
  const AdminPricingWidget = defineAsyncComponent(() => import('~/components/admin/AdminPricingWidget.vue'))
import { useAdminSubscriptions } from '~/composables/admin/useAdminSubscriptions'
import { useAdminForm } from '~/composables/admin/useAdminForm'
import { useAdminLiveTheme } from '~/composables/admin/useAdminLiveTheme'
import { useAdminBilling } from '~/composables/admin/useAdminBilling'
import { useAdminModuleToggles } from '~/composables/admin/useAdminModuleToggles'
import { useSlugClaim } from '~/composables/core/useSlugClaim'

const route = useRoute()
const tenantStore = useTenantStore()

const { subscriptions, fetchSubscription, slug } = useAdminSubscriptions()
const { form, tenant, moduleIds, saving, saveError, save } = useAdminForm(subscriptions)

const deploying = ref(false)
const extending = ref(false)

const {
  handleBillingPayment,
  prepareBillingInstructionsForSameTx,
  confirmBillingFromTxSignature,
  deployModule,
  reactivateModule,
  extendModule,
} = useAdminBilling({
  saveError,
  saving,
  deploying,
  extending,
  fetchSubscription,
})

const slugClaim = useSlugClaim({
  slug,
  saveError,
  saving,
  handleBillingPayment,
  fetchSubscription,
})

const {
  showActivationModal, activationModalModuleId,
  showDeactivateConfirm, pendingDeactivateModuleId,
  extendingModuleId, extendPeriod,
  getSubscriptionPeriodEnd, formatDeactivationDate,
  onModuleToggle, confirmDeactivate, cancelDeactivate,
  onActivationModalClose, confirmModuleActivate,
  startExtend, confirmExtend, cancelExtend, setExtendPeriod,
  handleRaffleBilling: _handleRaffleBilling,
  handleWatchtowerSave: _handleWatchtowerSave,
  handleReactivate,
} = useAdminModuleToggles({
  subscriptions, save, form, handleBillingPayment, fetchSubscription,
  extendModule, reactivateModule, deploying, extending, saving, saveError,
})

const desiredSlug = computed(() => slugClaim.desiredSlug.value)
const slugCheckStatus = computed(() => slugClaim.slugCheckStatus.value)
const slugChecking = computed(() => slugClaim.slugChecking.value)
const slugClaiming = computed(() => slugClaim.slugClaiming.value)

const VALID_TABS = new Set(MODULE_SUBNAV.admin?.map((t) => t.id) ?? ['general', 'modules', 'theming', 'marketplace', 'discord', 'billing'])

const adminPageTitle = computed(() => {
  const tabEntry = MODULE_SUBNAV.admin?.find((t) => t.id === tab.value)
  return tabEntry ? `Admin - ${tabEntry.label}` : 'Admin'
})

const marketplaceSettings = computed(() => {
  const s = tenantStore.marketplaceSettings
  if (!s) return null
  const gate = s.gate ?? (s as { whitelist?: unknown }).whitelist
  return {
    collectionMints: s.collectionMints,
    splAssetMints: s.splAssetMints ?? [],
    currencyMints: s.currencyMints,
    gate,
    shopFee: s.shopFee,
  }
})

const marketplaceModuleState = computed(() => getModuleState(tenant.value?.modules?.marketplace))
const _discordModuleState = computed(() => getModuleState(tenant.value?.modules?.discord))
const raffleModuleState = computed(() => getModuleState(tenant.value?.modules?.raffles))
const gatesModuleState = computed(() => getModuleState(tenant.value?.modules?.gates))
const watchtowerModuleState = computed(() => getModuleState(tenant.value?.modules?.watchtower))
const shipmentModuleState = computed(() => getModuleState(tenant.value?.modules?.shipment))

const slugModuleState = computed((): 'off' | 'staging' | 'active' | 'deactivating' => {
  if (tenant.value?.slug) return 'active'
  return 'staging'
})

const showSlugPricingWidget = computed(() => Boolean(tenant.value))

const WIDGET_TABS = new Set(['marketplace', 'raffle', 'gates', 'watchtower'])
const tab = computed(() => {
  const q = route.query.tab
  return typeof q === 'string' && VALID_TABS.has(q) ? q : 'general'
})

useAdminLiveTheme(tab, form.branding, () => tenant.value?.branding)

const hasWidgetTab = computed(() => WIDGET_TABS.has(tab.value) || tab.value === 'plan-shipment')

const raffleTabRef = ref<InstanceType<typeof AdminRaffleTab> | null>(null)
const watchtowerTabRef = ref<InstanceType<typeof AdminWatchtowerTab> | null>(null)

function handleRaffleBilling(period: BillingPeriod, conditions?: Record<string, number>) {
  return _handleRaffleBilling(period, conditions, raffleTabRef.value?.clearUpgradeConditions?.bind(raffleTabRef.value))
}

function handleWatchtowerSave(period: BillingPeriod, conditions?: Record<string, number>) {
  return _handleWatchtowerSave(period, conditions, watchtowerTabRef.value?.saveWatches?.bind(watchtowerTabRef.value))
}

async function onMarketplaceSaved(settings: Record<string, unknown>) {
  const s = settings as {
    collectionMints?: unknown[]
    splAssetMints?: unknown[]
    currencyMints?: unknown[]
    gate?: unknown
    shopFee?: unknown
  }
  tenantStore.setMarketplaceSettings(
    s ? {
      collectionMints: (s.collectionMints as MarketplaceSettings['collectionMints']) ?? [],
      splAssetMints: (s.splAssetMints as MarketplaceSettings['splAssetMints']) ?? [],
      currencyMints: (s.currencyMints as MarketplaceSettings['currencyMints']) ?? [],
      gate: s.gate,
      shopFee: (s.shopFee as MarketplaceSettings['shopFee']) ?? { wallet: '', makerFlatFee: 0, takerFlatFee: 0, makerPercentFee: 0, takerPercentFee: 0 },
    } : null,
  )
  await fetchSubscription('marketplace')
  await tenantStore.refetchTenantContext()
}

onMounted(() => {
  const q = route.query.tab
  if (typeof q !== 'string' || !VALID_TABS.has(q)) {
    navigateTo({ path: route.path, query: { ...route.query, tab: 'general' }, replace: true })
  }
})

watch(tab, (t) => {
  if (t === 'general') fetchSubscription('slug')
  if (t === 'marketplace') fetchSubscription('marketplace')
  if (t === 'raffle') fetchSubscription('raffles')
  if (t === 'gates') fetchSubscription('gates')
  if (t === 'watchtower') fetchSubscription('watchtower')
  if (t === 'modules') {
    for (const id of moduleIds.value) {
      if (id !== 'admin' && getModuleCatalogEntry(id)?.pricing) fetchSubscription(id)
    }
  }
}, { immediate: true })
</script>

<style>
/* Unscoped: admin__* classes used in tab components (General, Modules, Marketplace, Discord, Billing) */
/* .admin__split lives in assets/global.css (shared with .layout-split) */
.admin__panel {
  margin-bottom: var(--theme-space-lg);
}
.admin__panel [data-slot="card"] {
  border-color: var(--theme-border, hsl(var(--border)));
  background-color: var(--theme-bg-card);
  color: var(--theme-text-primary);
  box-shadow: var(--theme-shadow-card);
  gap: var(--theme-space-md);
}
.admin__panel h3 {
  font-size: var(--theme-font-lg);
  font-weight: 600;
  color: var(--theme-secondary);
  margin-bottom: var(--theme-space-md);
}
.admin__panel .form-input,
.admin__panel .text-input,
.admin__panel .toggle,
.admin__panel [data-slot="switch"] {
  margin-bottom: var(--theme-space-md);
}
.admin__ids-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--theme-space-lg) var(--theme-space-xl);
  margin-bottom: var(--theme-space-md);
}
.admin__slug-field {
  margin-left: auto;
}
.admin__ids-item {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
  font-size: var(--theme-font-sm);
}
.admin__ids-label {
  font-weight: 500;
  color: var(--theme-text-secondary);
}
.admin__ids-item code {
  background: var(--theme-bg-secondary);
  padding: 2px var(--theme-space-xs);
  border-radius: var(--theme-radius-sm);
  font-size: var(--theme-font-xs);
}
.admin__slug-field .admin__slug-input-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
}
.admin__slug-field .admin__slug-input-row .form-input {
  flex: 1;
  min-width: 0;
  margin-bottom: 0;
}
.admin__slug-check-btn {
  flex-shrink: 0;
}
.admin__slug-check-btn .admin__slug-check-icon {
  width: 1.25rem;
  height: 1.25rem;
}
.admin__slug-spinner {
  width: 1.25rem;
  height: 1.25rem;
  animation: admin-spin 1s linear infinite;
}
.admin__slug-check-icon--success {
  color: var(--theme-success);
}
.admin__slug-check-icon--taken {
  color: var(--theme-error);
}
.admin__slug-available-hint {
  font-size: var(--theme-font-xs);
  color: var(--theme-success);
  margin-top: var(--theme-space-xs);
}
@keyframes admin-spin {
  to { transform: rotate(360deg); }
}
.admin__module-grid {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.admin__module-row {
  display: grid;
  grid-template-columns: minmax(6rem, 7rem) minmax(8rem, 1fr) auto;
  align-items: center;
  gap: var(--theme-space-md);
  padding: var(--theme-space-xs) 0;
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
  min-height: 2.5rem;
}
.admin__module-row:last-child {
  border-bottom: none;
}
.admin__module-cell {
  min-width: 0;
  display: flex;
  align-items: center;
}
.admin__module-cell--action {
  justify-content: flex-start;
  align-items: center;
}
.admin__module-cell--name {
  min-width: 0;
  line-height: 1.25rem;
}
.admin__module-cell--status {
  min-width: 0;
  line-height: 1.25rem;
}
.admin__module-cell--actions {
  justify-content: flex-end;
  align-items: center;
}
.admin__module-name {
  display: inline-flex;
  align-items: center;
  gap: var(--theme-space-xs);
  line-height: 1.25rem;
}
.admin__module-info-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  background: none;
  border: none;
  color: var(--theme-text-muted);
  cursor: pointer;
  border-radius: var(--theme-radius-sm);
}
.admin__module-info-btn:hover {
  color: var(--theme-primary);
}
.admin__module-info-icon {
  font-size: 0.875rem;
  line-height: 1;
}
.admin__module-info-modal {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}
.admin__module-info-desc {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  line-height: 1.5;
}
.admin__module-info-pricing {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
}
.admin__module-info-pricing-title {
  margin: 0;
  font-size: var(--theme-font-xs);
  font-weight: 600;
  color: var(--theme-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.admin__module-info-pricing-text {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  line-height: 1.5;
  white-space: pre-line;
}
.admin__module-info-link {
  display: inline-flex;
  align-items: center;
  gap: var(--theme-space-xs);
  font-size: var(--theme-font-sm);
  color: var(--theme-primary);
}
.admin__module-info-link:hover {
  text-decoration: underline;
}
.admin__module-date {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}
.admin__extend-inline {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
}
.admin__extend-inline .pricing-widget__period-toggle {
  display: flex;
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  overflow: hidden;
}
.admin__extend-inline .pricing-widget__period-btn {
  padding: 2px var(--theme-space-xs);
  font-size: var(--theme-font-xs);
  font-weight: 500;
  background: transparent;
  border: none;
  color: var(--theme-text-secondary);
  cursor: pointer;
}
.admin__extend-inline .pricing-widget__period-btn--active {
  background: var(--theme-primary);
  color: var(--theme-primary-inverse, #fff);
}
.admin__extend-cancel {
  background: none;
  border: none;
  color: var(--theme-text-muted);
  cursor: pointer;
  padding: 2px;
  display: inline-flex;
  align-items: center;
  font-size: var(--theme-font-md);
}
.admin__extend-cancel:hover {
  color: var(--theme-text-primary);
}
.admin__spinner {
  animation: admin-spin 1s linear infinite;
}
@keyframes admin-spin {
  to { transform: rotate(360deg); }
}
.admin__billing-loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  color: var(--theme-text-muted);
  font-size: var(--theme-font-sm);
}
.admin__billing-empty {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}
.admin__billing-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--theme-font-sm);
}
.admin__billing-table th {
  text-align: left;
  font-weight: 600;
  color: var(--theme-text-secondary);
  padding: var(--theme-space-xs) var(--theme-space-sm);
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
  white-space: nowrap;
}
.admin__billing-table td {
  padding: var(--theme-space-xs) var(--theme-space-sm);
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
  color: var(--theme-text-primary);
  white-space: nowrap;
}
.admin__billing-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.admin__billing-tx-link {
  color: var(--theme-primary);
  display: inline-flex;
  align-items: center;
}
.admin__billing-invoice-btn {
  background: none;
  border: none;
  color: var(--theme-primary);
  cursor: pointer;
  padding: 2px;
  display: inline-flex;
  align-items: center;
  font-size: var(--theme-font-md);
}
.admin__billing-invoice-btn:hover {
  color: var(--theme-text-primary);
}
</style>

<style scoped>
.admin__state-select {
  padding: var(--theme-space-xs) var(--theme-space-sm);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md, 4px);
  background: var(--theme-bg-primary);
  color: var(--theme-text-primary);
  font-size: var(--theme-font-sm);
}

.admin__actions {
  margin-top: var(--theme-space-lg);
}

.admin__error {
  color: var(--theme-error);
  font-size: var(--theme-font-sm);
  margin-top: var(--theme-space-sm);
}

.admin__deactivate-modal {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.admin__deactivate-modal p {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  line-height: 1.5;
}

.admin__deactivate-date {
  font-weight: 500;
  color: var(--theme-text-primary);
}

.admin__deactivate-actions {
  display: flex;
  gap: var(--theme-space-sm);
  justify-content: flex-end;
  margin-top: var(--theme-space-sm);
}

/* Staging: switch uses warning color */
</style>
