<template>
  <aside class="pricing-widget">
    <div v-if="loading" class="pricing-widget__loading">
      <Icon icon="lucide:loader-2" class="pricing-widget__spinner" />
      <span>Loading pricing...</span>
    </div>

    <template v-else-if="price?.billable && selectedTier">
      <div class="pricing-widget__tier">
        <span class="pricing-widget__tier-name">{{ selectedTier.name }}</span>
        <span class="pricing-widget__tier-price">
          {{ formatUsdc(selectedPeriod === 'yearly' ? price.recurringYearly / 12 : price.recurringMonthly) }} USDC/mo
          <span v-if="selectedPeriod === 'yearly' && price.appliedYearlyDiscount" class="pricing-widget__tier-note">
            ({{ price.appliedYearlyDiscount }}% off yearly)
          </span>
        </span>
      </div>

      <div class="pricing-widget__usage">
        <div
          v-for="row in usageRows"
          :key="row.key"
          class="pricing-widget__usage-row"
        >
          <div class="pricing-widget__usage-header">
            <span class="pricing-widget__usage-label">{{ row.label }}</span>
            <span v-if="row.type === 'numeric'" class="pricing-widget__usage-count">
              {{ row.stored != null ? `${row.current} / ${row.stored}` : (row.included === 0 ? String(row.current) : `${row.current} / ${row.included}`) }}
            </span>
            <span v-else class="pricing-widget__usage-bool">
              <Icon v-if="row.active" icon="lucide:check" class="pricing-widget__icon-check" />
              <span v-else class="pricing-widget__icon-dash">--</span>
            </span>
          </div>
          <div v-if="row.type === 'numeric' && row.showBar" class="pricing-widget__bar-track">
            <div
              class="pricing-widget__bar-fill"
              :class="{ 'pricing-widget__bar-fill--over': row.ratio > 1 }"
              :style="{ width: `${Math.min(row.ratio * 100, 100)}%` }"
            />
          </div>
        </div>
      </div>

      <div v-if="addonComponents.length" class="pricing-widget__addons">
        <p class="pricing-widget__section-label">Add-ons</p>
        <div
          v-for="addon in addonComponents"
          :key="addon.name"
          class="pricing-widget__addon-row"
        >
          <span>{{ addon.name }} &times;{{ addon.quantity }}</span>
          <span>{{ formatUsdc(addon.amount) }} USDC/mo</span>
        </div>
      </div>

      <div class="pricing-widget__totals">
        <template v-if="selectedPeriod === 'yearly'">
          <div class="pricing-widget__total-row">
            <span>Effective monthly</span>
            <span class="pricing-widget__total-value">{{ formatUsdc(price.recurringYearly / 12) }} USDC/mo</span>
          </div>
          <div class="pricing-widget__total-row">
            <span>Yearly total</span>
            <span class="pricing-widget__total-value">{{ formatUsdc(price.recurringYearly) }} USDC/yr</span>
          </div>
        </template>
        <template v-else>
          <div class="pricing-widget__total-row">
            <span>Monthly</span>
            <span class="pricing-widget__total-value">{{ formatUsdc(price.recurringMonthly) }} USDC</span>
          </div>
        </template>
      </div>

      <div v-if="hasActiveSubscription" class="pricing-widget__subscription">
        <p class="pricing-widget__section-label">Current subscription</p>
        <div class="pricing-widget__sub-row">
          <span>Period</span>
          <span>{{ subscription!.billingPeriod === 'yearly' ? 'Yearly' : 'Monthly' }}</span>
        </div>
        <div class="pricing-widget__sub-row">
          <span>Renews / expires</span>
          <span>{{ formatDate(subscription!.periodEnd) }}</span>
        </div>
        <div class="pricing-widget__sub-row">
          <span>Recurring</span>
          <span>{{ formatUsdc(subscription!.recurringAmountUsdc) }} USDC</span>
        </div>
      </div>
    </template>

    <template v-else-if="price?.billable && (isAddUnit || isTieredWithOneTime)">
      <div class="pricing-widget__tier">
        <span class="pricing-widget__tier-name">{{ isTieredWithOneTime ? (price.oneTimeUnitName ?? 'Per unit') : addUnitName }}</span>
        <span class="pricing-widget__tier-price">{{ formatUsdc(isTieredWithOneTime ? oneTimePerUnitEffective : price.oneTimeTotal) }} USDC</span>
      </div>
      <p v-if="isTieredWithOneTime" class="pricing-widget__add-unit-hint">
        {{ price.oneTimeUnitName ?? 'Per unit' }}: {{ formatUsdc(oneTimePerUnitEffective) }} USDC when creating on {{ selectedTier?.name ?? 'this' }} tier.
      </p>
      <p v-else class="pricing-widget__add-unit-hint">One-time fee per new list.</p>
    </template>

    <template v-else-if="price?.billable && chargeAmount === 0 && !isAddUnit && !isTieredWithOneTime && moduleId !== 'slug'">
      <div class="pricing-widget__free">
        <span>Free</span>
      </div>
    </template>

    <template v-else-if="price?.billable && moduleId === 'slug'">
      <div class="pricing-widget__tier">
        <span class="pricing-widget__tier-name">Custom slug</span>
        <span class="pricing-widget__tier-price">{{ formatUsdc(price.recurringYearly) }} USDC/yr</span>
      </div>
      <div v-if="hasActiveSubscription" class="pricing-widget__subscription">
        <p class="pricing-widget__section-label">Current subscription</p>
        <div class="pricing-widget__sub-row">
          <span>Period</span>
          <span>Yearly</span>
        </div>
        <div class="pricing-widget__sub-row">
          <span>Renews / expires</span>
          <span>{{ formatDate(subscription!.periodEnd) }}</span>
        </div>
        <div class="pricing-widget__sub-row">
          <span>Recurring</span>
          <span>{{ formatUsdc(subscription!.recurringAmountUsdc) }} USDC/yr</span>
        </div>
      </div>
    </template>

    <div v-else-if="price && !price.billable" class="pricing-widget__free">
      <span>No billing for this module</span>
    </div>

    <div v-if="error" class="pricing-widget__error">{{ error }}</div>

    <div class="pricing-widget__actions">
      <div v-if="showPeriodToggle" class="pricing-widget__period-toggle">
        <button
          class="pricing-widget__period-btn"
          :class="{ 'pricing-widget__period-btn--active': selectedPeriod === 'monthly' }"
          @click="selectedPeriod = 'monthly'"
        >
          Monthly
        </button>
        <button
          class="pricing-widget__period-btn"
          :class="{ 'pricing-widget__period-btn--active': selectedPeriod === 'yearly' }"
          @click="selectedPeriod = 'yearly'"
        >
          Yearly
          <span v-if="yearlyDiscountLabel" class="pricing-widget__period-save">
            ({{ yearlyDiscountLabel }}% off)
          </span>
        </button>
      </div>

      <p v-if="canReactivateWithoutPayment" class="pricing-widget__hint">
        Still within your paid period. Click Reactivate to turn the module back on without a new payment.
      </p>
      <p v-else-if="hintText" class="pricing-widget__hint">
        {{ hintText }}
      </p>

      <Button
        v-if="moduleState === 'staging'"
        variant="default"
        :disabled="deploying"
        @click="$emit('deploy', selectedPeriod)"
      >
        <Icon v-if="deploying" icon="lucide:loader-2" class="pricing-widget__spinner" />
        {{ deployLabel }}
      </Button>

      <Button
        v-if="moduleState === 'active' && isTieredWithOneTime"
        variant="default"
        :disabled="saving"
        @click="$emit('save', selectedPeriod)"
      >
        {{ saveButtonLabel }}
      </Button>

      <Button
        v-else-if="moduleState === 'deactivating'"
        variant="secondary"
        :disabled="saving"
        @click="$emit('reactivate', selectedPeriod)"
      >
        Reactivate
      </Button>

      <Button
        v-else-if="moduleState === 'active' && moduleId === 'slug'"
        variant="default"
        :disabled="saving"
        @click="$emit('extend', selectedPeriod)"
      >
        {{ saving ? 'Extending...' : 'Extend' }}
      </Button>
      <Button
        v-else-if="moduleState === 'active' && !isAddUnit"
        variant="default"
        :disabled="saving"
        @click="$emit('save', selectedPeriod)"
      >
        {{ saving ? 'Saving...' : 'Save' }}
      </Button>

      <p v-if="saveError" class="pricing-widget__save-error">{{ saveError }}</p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import type { ModuleState } from '@decentraguild/core'
import type { BillingPeriod, PriceResult, ConditionSet, TieredAddonsPricing, TieredWithOneTimePerUnitPricing, TierDefinition } from '@decentraguild/billing'
import { computePrice, getOneTimePerUnitForTier } from '@decentraguild/billing'
import { getModuleCatalogEntry } from '@decentraguild/config'
import { Button } from '~/components/ui/button'
import { Icon } from '@iconify/vue'
import { formatDate, formatUsdc } from '@decentraguild/display'
import { usePricePreview } from '~/composables/core/usePricePreview'
import { usePricingDisplay } from '~/composables/core/usePricingDisplay'
import { usePricingWidgetActions } from '~/composables/core/usePricingWidgetActions'
import { useTenantStore } from '~/stores/tenant'

export interface SubscriptionInfo {
  billingPeriod: BillingPeriod
  periodEnd: string
  recurringAmountUsdc: number
  /** Tier id for tiered modules (e.g. raffles); used to show current tier and per-unit price. */
  selectedTierId?: string
}

const props = withDefaults(
  defineProps<{
    moduleId: string
    moduleState: ModuleState
    saving: boolean
    deploying: boolean
    saveError: string | null
    /** Live conditions from the form. When provided, pricing is computed client-side. */
    conditions?: ConditionSet | null
    /** Saved/deployed condition counts. When provided with conditions, numeric rows show "dirty / stored" instead of "current / included". */
    storedConditions?: ConditionSet | null
    /** Current active subscription. When provided and module is active, locks the period toggle. */
    subscription?: SubscriptionInfo | null
    /** When true, hide monthly/yearly toggle and use yearly only (e.g. slug). */
    yearlyOnly?: boolean
  }>(),
  { yearlyOnly: false },
)

defineEmits<{
  save: [billingPeriod: BillingPeriod]
  deploy: [billingPeriod: BillingPeriod]
  reactivate: [billingPeriod: BillingPeriod]
  extend: [billingPeriod: BillingPeriod]
}>()

const selectedPeriod = ref<BillingPeriod>('monthly')

watch(
  () => props.yearlyOnly,
  (only) => {
    if (only) selectedPeriod.value = 'yearly'
  },
  { immediate: true },
)

const hasActiveSubscription = computed(() =>
  props.subscription != null && props.moduleState === 'active',
)

const canReactivateWithoutPayment = computed(() => {
  if (props.moduleState !== 'deactivating') return false
  const periodEnd = props.subscription?.periodEnd
  if (!periodEnd) return false
  try {
    return new Date(periodEnd) > new Date()
  } catch {
    return false
  }
})

const periodLocked = computed(() => hasActiveSubscription.value)

watch(
  () => props.subscription,
  (sub) => {
    if (sub?.billingPeriod) {
      selectedPeriod.value = sub.billingPeriod
    }
  },
  { immediate: true },
)

const tenantStore = useTenantStore()
const slug = computed(() => tenantStore.slug)
const moduleIdRef = computed(() => props.moduleId)

const hasLiveConditions = computed(() => props.conditions != null && Object.keys(props.conditions).length > 0)

const { conditions: apiConditions, price: apiPrice, loading, error, refresh } = usePricePreview(slug, moduleIdRef, selectedPeriod)

defineExpose({ refresh, selectedPeriod })

const catalogEntry = computed(() => getModuleCatalogEntry(props.moduleId))

const pricingModel = computed(() => {
  const p = catalogEntry.value?.pricing
  if (!p) return null
  if (p.modelType === 'tiered_addons') return p as TieredAddonsPricing
  if (p.modelType === 'tiered_with_one_time_per_unit') return p as TieredWithOneTimePerUnitPricing
  return null
})

const conditions = computed((): ConditionSet | null => {
  if (hasLiveConditions.value) return props.conditions!
  return apiConditions.value
})

const price = computed((): PriceResult | null => {
  if (hasLiveConditions.value && catalogEntry.value?.pricing) {
    return computePrice(props.moduleId, props.conditions!, catalogEntry.value.pricing, {
      billingPeriod: selectedPeriod.value,
    })
  }
  return apiPrice.value
})

/** Prefer subscription tier (paid) so widget shows correct tier after upgrade. */
const selectedTier = computed((): TierDefinition | null => {
  if (!pricingModel.value) return null
  const tiers = (pricingModel.value as TieredAddonsPricing | TieredWithOneTimePerUnitPricing).tiers
  const tierId = props.subscription?.selectedTierId ?? price.value?.selectedTierId
  if (!tierId) return null
  return tiers.find((t) => t.id === tierId) ?? null
})

/** Per-unit amount for tiered_with_one_time: use subscription tier when present so Grow/Pro show 0. */
const oneTimePerUnitEffective = computed(() => {
  if (!isTieredWithOneTime.value) return price.value?.oneTimePerUnitForSelectedTier ?? 0
  const tierId = props.subscription?.selectedTierId ?? price.value?.selectedTierId
  if (tierId && catalogEntry.value?.pricing) {
    return getOneTimePerUnitForTier(catalogEntry.value.pricing, tierId)
  }
  return price.value?.oneTimePerUnitForSelectedTier ?? 0
})

const yearlyDiscountLabel = computed(() => {
  if (!price.value?.appliedYearlyDiscount) {
    const p = catalogEntry.value?.pricing
    if (p && 'yearlyDiscountPercent' in p && p.yearlyDiscountPercent > 0) {
      return p.yearlyDiscountPercent
    }
    return null
  }
  return price.value.appliedYearlyDiscount
})

const chargeAmount = computed(() => {
  if (!price.value?.billable) return 0
  if (isAddUnit.value) return price.value.oneTimeTotal
  if (isTieredWithOneTime.value) return oneTimePerUnitEffective.value
  return selectedPeriod.value === 'yearly'
    ? price.value.recurringYearly
    : price.value.recurringMonthly
})

const upgradeRecurringAmount = computed(() => {
  if (!price.value?.billable || !isTieredWithOneTime.value) return 0
  return selectedPeriod.value === 'yearly'
    ? price.value.recurringYearly
    : price.value.recurringMonthly
})

const isAddUnit = computed(() => {
  const p = catalogEntry.value?.pricing
  return p != null && 'modelType' in p && p.modelType === 'add_unit'
})

const isTieredWithOneTime = computed(() => {
  const p = catalogEntry.value?.pricing
  return p != null && 'modelType' in p && p.modelType === 'tiered_with_one_time_per_unit'
})

const addUnitName = computed(() => {
  const p = catalogEntry.value?.pricing
  if (p && 'modelType' in p && p.modelType === 'add_unit' && 'name' in p) return p.name as string
  return 'Add unit'
})

const storedConditionsRef = computed(() => props.storedConditions ?? null)
const { usageRows, addonComponents } = usePricingDisplay(
  pricingModel,
  conditions,
  selectedTier,
  price,
  storedConditionsRef
)

const { showPeriodToggle, deployLabel, saveButtonLabel, hintText } = usePricingWidgetActions({
  moduleId: props.moduleId,
  moduleState: toRef(props, 'moduleState'),
  deploying: toRef(props, 'deploying'),
  saving: toRef(props, 'saving'),
  chargeAmount,
  selectedTier,
  yearlyOnly: props.yearlyOnly,
  hasActiveSubscription,
  isAddUnit,
  isTieredWithOneTime,
  upgradeRecurringAmount,
  selectedPeriod,
})
</script>

<style scoped>
.pricing-widget {
  background: var(--theme-bg-card);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  padding: var(--theme-space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.pricing-widget__loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  color: var(--theme-text-muted);
  font-size: var(--theme-font-sm);
}

.pricing-widget__spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.pricing-widget__tier {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.pricing-widget__tier-name {
  font-size: var(--theme-font-lg);
  font-weight: 600;
  color: var(--theme-text-primary);
}

.pricing-widget__tier-price {
  font-size: var(--theme-font-md);
  color: var(--theme-primary);
  font-weight: 600;
}

.pricing-widget__tier-note {
  font-size: var(--theme-font-xs);
  font-weight: 400;
  color: var(--theme-text-secondary);
}

.pricing-widget__usage {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
}

.pricing-widget__usage-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pricing-widget__usage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pricing-widget__usage-label {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.pricing-widget__usage-count {
  font-size: var(--theme-font-sm);
  font-weight: 500;
  color: var(--theme-text-primary);
  font-variant-numeric: tabular-nums;
}

.pricing-widget__usage-bool {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-primary);
}

.pricing-widget__icon-check {
  color: var(--theme-success);
}

.pricing-widget__icon-dash {
  color: var(--theme-text-muted);
}

.pricing-widget__bar-track {
  height: 4px;
  background: var(--theme-bg-secondary);
  border-radius: var(--theme-radius-full);
  overflow: hidden;
}

.pricing-widget__bar-fill {
  height: 100%;
  background: var(--theme-gradient-primary, var(--theme-primary));
  border-radius: var(--theme-radius-full);
  transition: width 0.3s ease;
}

.pricing-widget__bar-fill--over {
  background: var(--theme-gradient-secondary, var(--theme-warning));
}

.pricing-widget__section-label {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0;
}

.pricing-widget__addons {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
  padding-top: var(--theme-space-sm);
  border-top: var(--theme-border-thin) solid var(--theme-border);
}

.pricing-widget__addon-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.pricing-widget__totals {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
  padding-top: var(--theme-space-sm);
  border-top: var(--theme-border-thin) solid var(--theme-border);
}

.pricing-widget__total-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.pricing-widget__total-value {
  font-weight: 600;
  color: var(--theme-text-primary);
}

.pricing-widget__subscription {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
  padding-top: var(--theme-space-sm);
  border-top: var(--theme-border-thin) solid var(--theme-border);
}

.pricing-widget__sub-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.pricing-widget__free {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.pricing-widget__error {
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}

.pricing-widget__actions {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
  padding-top: var(--theme-space-sm);
  border-top: var(--theme-border-thin) solid var(--theme-border);
}

.pricing-widget__period-toggle {
  display: flex;
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  overflow: hidden;
}

.pricing-widget__period-btn {
  flex: 1;
  padding: var(--theme-space-xs) var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  font-weight: 500;
  background: transparent;
  border: none;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--theme-space-xs);
}

.pricing-widget__period-btn:hover {
  background: var(--theme-bg-secondary);
}

.pricing-widget__period-btn--active {
  background: var(--theme-gradient-primary, var(--theme-primary));
  color: var(--theme-primary-inverse);
}

.pricing-widget__period-btn--active:hover {
  background: var(--theme-gradient-primary, var(--theme-primary));
}

.pricing-widget__period-save {
  font-size: var(--theme-font-xs);
  font-weight: 400;
  opacity: 0.85;
}

.pricing-widget__hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin: 0;
}

.pricing-widget__save-error {
  color: var(--theme-error);
  font-size: var(--theme-font-sm);
  margin: 0;
}
</style>
