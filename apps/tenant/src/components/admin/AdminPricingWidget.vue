<template>
  <div class="pricing-widget-stack">
    <aside class="pricing-widget">
      <div v-if="billingDisabled" class="pricing-widget__unavailable">
        <span>Billing temporarily unavailable</span>
      </div>

      <div v-else-if="loading" class="pricing-widget__loading">
        <Icon icon="lucide:loader-2" class="pricing-widget__spinner" />
        <span>Loading pricing...</span>
      </div>

      <template v-else-if="price?.billable && (isAddUnit || isTieredWithOneTime)">
        <div class="pricing-widget__tier" :class="{ 'pricing-widget__tier--stacked': isTieredWithOneTime }">
          <span class="pricing-widget__tier-name">
            {{ isTieredWithOneTime ? (selectedTier?.name ?? price.oneTimeUnitName ?? 'Plan') : addUnitName }}
          </span>
          <div v-if="isTieredWithOneTime" class="pricing-widget__tier-prices">
            <span class="pricing-widget__tier-price-line">
              <span class="pricing-widget__tier-price-value">{{ formatUsdc(tieredRecurringMonthlyDisplay) }} USDC/mo</span>
              <span class="pricing-widget__tier-price-muted">recurring</span>
            </span>
            <span class="pricing-widget__tier-price-line">
              <span class="pricing-widget__tier-price-value">{{ formatUsdc(oneTimePerUnitEffective) }} USDC</span>
              <span class="pricing-widget__tier-price-muted">per new {{ marginalUnitLabel }}</span>
            </span>
          </div>
          <span v-else class="pricing-widget__tier-price">{{ formatUsdc(price.oneTimeTotal) }} USDC</span>
        </div>
        <div v-if="isTieredWithOneTime && usageRows.length" class="pricing-widget__usage">
          <div
            v-for="row in usageRows"
            :key="row.key"
            class="pricing-widget__usage-row"
          >
            <span class="pricing-widget__usage-label">{{ row.label }}</span>
            <span class="pricing-widget__usage-value">{{ row.valueText }}</span>
          </div>
        </div>
      </template>

      <template v-else-if="price?.billable && selectedTier">
        <div class="pricing-widget__tier">
          <span class="pricing-widget__tier-name">{{ selectedTier.name }}</span>
          <span class="pricing-widget__tier-price">
            {{ formatUsdc(selectedPeriod === 'yearly' ? price.recurringYearly / 12 : price.recurringMonthly) }} USDC/mo
          </span>
        </div>

        <div class="pricing-widget__usage">
          <div
            v-for="row in usageRows"
            :key="row.key"
            class="pricing-widget__usage-row"
          >
            <span class="pricing-widget__usage-label">{{ row.label }}</span>
            <span class="pricing-widget__usage-value">{{ row.valueText }}</span>
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
          <div v-if="selectedPeriod === 'yearly'" class="pricing-widget__total-row">
            <span>Recurring (yearly)</span>
            <span class="pricing-widget__total-value">{{ formatUsdc(price.recurringYearly) }} USDC/yr</span>
          </div>
          <div v-else class="pricing-widget__total-row">
            <span>Recurring (monthly)</span>
            <span class="pricing-widget__total-value">{{ formatUsdc(price.recurringMonthly) }} USDC/mo</span>
          </div>
        </div>

        <div v-if="hasActiveSubscription" class="pricing-widget__subscription">
          <p class="pricing-widget__section-label">Subscription</p>
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
            <span>
              {{ formatUsdc(subscription!.billingPeriod === 'yearly' ? price.recurringYearly : price.recurringMonthly) }}
              {{ subscription!.billingPeriod === 'yearly' ? 'USDC/yr' : 'USDC/mo' }}
            </span>
          </div>
        </div>
      </template>

      <template
        v-else-if="
          price?.billable &&
            chargeAmount === 0 &&
            recurringDisplayTotal <= 0 &&
            !isAddUnit &&
            !isTieredWithOneTime &&
            moduleId !== 'slug'
        "
      >
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
          <p class="pricing-widget__section-label">Subscription</p>
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
            <span>{{ formatUsdc(price.recurringYearly) }} USDC/yr</span>
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
          v-if="moduleState === 'staging' || (moduleState === 'active' && hasDeficit && !isAddUnit)"
          variant="default"
          :disabled="deploying || saving"
          @click="$emit('deploy', selectedPeriod, conditions ?? undefined)"
        >
          <Icon v-if="deploying || saving" icon="lucide:loader-2" class="pricing-widget__spinner" />
          {{ deployLabel }}
        </Button>

        <Button
          v-if="moduleState === 'active' && isTieredWithOneTime && !hasDeficit"
          variant="default"
          :disabled="saving"
          @click="$emit('save', selectedPeriod, conditions ?? undefined)"
        >
          {{ saveButtonLabel }}
        </Button>

        <Button
          v-else-if="moduleState === 'deactivating'"
          variant="brand"
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
          v-else-if="moduleState === 'active' && !isAddUnit && !hasDeficit"
          variant="default"
          :disabled="saving"
          @click="$emit('save', selectedPeriod, conditions ?? undefined)"
        >
          {{ saving ? 'Saving...' : 'Save' }}
        </Button>

        <p v-if="saveError" class="pricing-widget__save-error">{{ saveError }}</p>
      </div>
    </aside>

    <aside
      v-if="showCatalogPricingPanel && catalogPricingLines.length"
      class="pricing-widget pricing-widget--catalog"
      aria-label="Plan overview"
    >
      <p class="pricing-widget__section-label pricing-widget__catalog-heading">Plan overview</p>
      <ul class="pricing-widget__catalog-list">
        <li v-for="(line, i) in catalogPricingLines" :key="i" class="pricing-widget__catalog-item">
          {{ line }}
        </li>
      </ul>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import type { ModuleState } from '@decentraguild/core'
import type {
  BillingPeriod,
  PriceResult,
  ConditionSet,
  TieredAddonsPricing,
  TieredWithOneTimePerUnitPricing,
  TierDefinition,
  QuoteLineItem,
} from '@decentraguild/billing'
import {
  getProductDisplayType,
  getProductUnitLabel,
  CONDITION_TO_METER,
  primaryQuotedMeterKey,
  tierDefinitionFromQuotedMeter,
} from '@decentraguild/billing'
import { getModuleCatalogEntry } from '@decentraguild/catalog'
import { Button } from '~/components/ui/button'
import { Icon } from '@iconify/vue'
import { formatDate, formatUsdc } from '@decentraguild/display'
import { useQuote } from '~/composables/core/useQuote'
import { usePricingDisplay } from '~/composables/core/usePricingDisplay'
import { usePricingWidgetActions } from '~/composables/core/usePricingWidgetActions'

export interface SubscriptionInfo {
  billingPeriod: BillingPeriod
  periodEnd: string
  recurringAmountUsdc: number
  /** Tier id for tiered modules; used to show current tier and per-unit price. */
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
    /** When true, show catalog docs.pricing below the main pricing card (module catalog). */
    showCatalogPricingPanel?: boolean
  }>(),
  { yearlyOnly: false, showCatalogPricingPanel: true },
)

defineEmits<{
  save: [billingPeriod: BillingPeriod, conditions?: ConditionSet]
  deploy: [billingPeriod: BillingPeriod, conditions?: ConditionSet]
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

watch(
  () => props.subscription,
  (sub) => {
    if (sub?.billingPeriod) {
      selectedPeriod.value = sub.billingPeriod
    }
  },
  { immediate: true },
)

const moduleIdRef = computed(() => props.moduleId)

const hasLiveConditions = computed(() => props.conditions != null && Object.keys(props.conditions).length > 0)

/** True when live usage exceeds stored/paid limits (e.g. Watchtower: more tracks enabled than paid). */
const hasDeficit = computed(() => {
  const live = props.conditions
  const stored = props.storedConditions
  if (!live || Object.keys(live).length === 0) return false
  if (!stored) return Object.values(live).some((v) => (typeof v === 'number' ? v : 0) > 0)
  for (const [k, v] of Object.entries(live)) {
    const liveNum = typeof v === 'number' ? v : 0
    const storedNum = typeof stored[k] === 'number' ? (stored[k] as number) : 0
    if (liveNum > storedNum) return true
  }
  return false
})

const meterOverridesRef = computed(() => {
  if (!hasLiveConditions.value || !props.conditions) return undefined
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(props.conditions)) {
    const meter = CONDITION_TO_METER[k] ?? k
    out[meter] = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v)
  }
  return out
})

const durationDaysRef = computed(() => (selectedPeriod.value === 'yearly' ? 365 : 30))

const { quote, loading, error, billingDisabled, fetchQuote } = useQuote({
  moduleId: moduleIdRef,
  durationDays: durationDaysRef,
  meterOverrides: meterOverridesRef,
  slugOnly: props.moduleId === 'slug' && props.yearlyOnly,
})

watchDebounced(
  () => [moduleIdRef.value, selectedPeriod.value, meterOverridesRef.value],
  () => fetchQuote(),
  { debounce: 400, immediate: true },
)

function refresh() {
  fetchQuote()
}
defineExpose({ refresh, selectedPeriod })

const catalogEntry = computed(() => getModuleCatalogEntry(props.moduleId))

/** Catalog prose for tiers; slug addon has no docs — use admin entry. */
const catalogPricingRaw = computed(() => {
  const direct = catalogEntry.value?.docs?.pricing?.trim()
  if (direct) return direct
  if (props.moduleId === 'slug') {
    return getModuleCatalogEntry('admin')?.docs?.pricing?.trim() ?? ''
  }
  return ''
})

const catalogPricingLines = computed(() =>
  catalogPricingRaw.value
    .split(/\n\n+/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean),
)

/** V2 product key (slug -> admin for billing). */
const productKey = computed(() => (props.moduleId === 'slug' ? 'admin' : props.moduleId))

/** V2: one-time per unit (gates, crafter). From billing product config, not catalog. */
const isAddUnit = computed(() => getProductDisplayType(productKey.value) === 'one_time_per_unit')

/** V2: tiered with one-time per unit. From billing product config, not catalog. */
const isTieredWithOneTime = computed(() => getProductDisplayType(productKey.value) === 'tiered_with_one_time')

/** V2: unit label for one-time display. From billing product config, not catalog. */
const addUnitName = computed(() => getProductUnitLabel(productKey.value))

const marginalUnitLabel = computed(() => addUnitName.value.toLowerCase())

const tieredQuotedMeterKey = computed(() =>
  primaryQuotedMeterKey(quote.value, hasLiveConditions.value ? (props.conditions ?? undefined) : undefined),
)

const conditions = computed((): ConditionSet | null => {
  if (hasLiveConditions.value) return props.conditions!
  const q = quote.value
  if (!q?.meters) return null
  return Object.fromEntries(
    (Object.entries(q.meters) as [string, { used: number; limit: number }][]).map(([k, v]) => [k, v.used]),
  ) as ConditionSet
})

const recurringDisplayTotal = computed(() => quote.value?.recurringDisplayUsdc ?? 0)

const price = computed((): PriceResult | null => {
  const q = quote.value
  if (!q) return null
  const components = q.lineItems.map((item: QuoteLineItem) => ({
    type: 'one-time' as const,
    name: item.label ?? item.meter_key,
    quantity: item.quantity,
    unitPrice: item.unit_price ?? (item.quantity ? item.price_usdc / item.quantity : 0),
    amount: item.price_usdc,
  }))
  const mk = tieredQuotedMeterKey.value
  const tieredDef =
    isTieredWithOneTime.value && mk ? tierDefinitionFromQuotedMeter(q, mk) : null
  const oneTimePerUnitForSelectedTier = isTieredWithOneTime.value ? (tieredDef?.oneTimePerUnit ?? 0) : 0
  const disp = q.recurringDisplayUsdc ?? q.priceUsdc
  return {
    moduleId: props.moduleId,
    billable: true,
    components,
    oneTimeTotal: q.priceUsdc,
    recurringMonthly: selectedPeriod.value === 'monthly' ? disp : disp / 12,
    recurringYearly: selectedPeriod.value === 'yearly' ? disp : disp * 12,
    appliedYearlyDiscount: null,
    selectedTierId: null,
    oneTimePerUnitForSelectedTier: isTieredWithOneTime.value ? oneTimePerUnitForSelectedTier : undefined,
    oneTimeUnitName: isTieredWithOneTime.value ? getProductUnitLabel(productKey.value) : undefined,
  }
})

const pricingModel = computed((): TieredAddonsPricing | TieredWithOneTimePerUnitPricing | null => {
  const q = quote.value
  if (isTieredWithOneTime.value) {
    const mk = tieredQuotedMeterKey.value
    if (!q || !mk || !q.meters[mk]) return null
    let conditionKeys: string[]
    if (hasLiveConditions.value && props.conditions) {
      conditionKeys = [
        ...new Set(
          Object.keys(props.conditions)
            .map((k) => CONDITION_TO_METER[k] ?? k)
            .filter((meterKey) => q.meters[meterKey] != null),
        ),
      ]
    } else {
      conditionKeys = Object.keys(q.meters)
    }
    if (!conditionKeys.length) return null
    const tierDef = tierDefinitionFromQuotedMeter(q, mk)
    if (!tierDef) return null
    return {
      modelType: 'tiered_with_one_time_per_unit',
      conditionKeys,
      tiers: [tierDef],
      addons: [],
      yearlyDiscountPercent: 0,
      oneTimeUnitName: getProductUnitLabel(productKey.value),
    } as TieredWithOneTimePerUnitPricing
  }
  if (!q?.meters) return null
  const conditionKeys = Object.keys(q.meters)
  const included = Object.fromEntries(
    (Object.entries(q.meters) as [string, { used: number; limit: number }][]).map(([k, v]) => [k, v.limit]),
  )
  return {
    modelType: 'tiered_addons',
    conditionKeys,
    tiers: [{ id: 'default', name: 'Usage', recurringPrice: 0, included }],
    addons: [],
    yearlyDiscountPercent: 0,
  } as TieredAddonsPricing
})

const selectedTier = computed((): TierDefinition | null => {
  const pm = pricingModel.value
  if (!pm) return null
  if (isTieredWithOneTime.value) {
    return (pm as TieredWithOneTimePerUnitPricing).tiers[0] ?? null
  }
  return (pm as TieredAddonsPricing).tiers[0] ?? null
})

const oneTimePerUnitEffective = computed(() => price.value?.oneTimePerUnitForSelectedTier ?? 0)

const tieredRecurringMonthlyDisplay = computed(() => {
  const p = price.value
  if (!p) return 0
  return selectedPeriod.value === 'yearly' ? p.recurringYearly / 12 : p.recurringMonthly
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
  const q = quote.value
  if (!price.value?.billable) return 0
  if (isAddUnit.value) return price.value.oneTimeTotal
  if (isTieredWithOneTime.value) return oneTimePerUnitEffective.value
  return q?.priceUsdc ?? 0
})

const upgradeRecurringAmount = computed(() => {
  if (!price.value?.billable || !isTieredWithOneTime.value) return 0
  return selectedPeriod.value === 'yearly'
    ? price.value.recurringYearly
    : price.value.recurringMonthly
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
  marginalUnitLabel,
})
</script>

<style scoped>
.pricing-widget-stack {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
  min-width: 0;
}

.pricing-widget--catalog {
  gap: var(--theme-space-sm);
}

.pricing-widget__catalog-heading {
  margin: 0 0 var(--theme-space-xs);
}

.pricing-widget__catalog-list {
  margin: 0;
  padding-left: 1.15rem;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  line-height: 1.45;
}

.pricing-widget__catalog-item {
  margin: 0 0 var(--theme-space-xs);
}

.pricing-widget__catalog-item:last-child {
  margin-bottom: 0;
}

.pricing-widget {
  background: var(--theme-bg-card);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  padding: var(--theme-space-md);
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
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

.pricing-widget__tier--stacked {
  align-items: flex-start;
  gap: var(--theme-space-xs);
}

.pricing-widget__tier-prices {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  text-align: right;
}

.pricing-widget__tier-price-line {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: baseline;
  gap: var(--theme-space-xs);
  font-size: var(--theme-font-sm);
  line-height: 1.3;
}

.pricing-widget__tier-price-value {
  font-weight: 600;
  color: var(--theme-text-primary);
  font-variant-numeric: tabular-nums;
}

.pricing-widget__tier-price-muted {
  font-size: var(--theme-font-xs);
  font-weight: 400;
  color: var(--theme-text-muted);
}

.pricing-widget__tier-name {
  font-size: var(--theme-font-md);
  font-weight: 600;
  color: var(--theme-text-primary);
}

.pricing-widget__tier-price {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  color: var(--theme-text-primary);
}

.pricing-widget__usage {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
}

.pricing-widget__usage-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--theme-space-sm);
}

.pricing-widget__usage-label {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.pricing-widget__usage-value {
  font-size: var(--theme-font-sm);
  font-weight: 500;
  color: var(--theme-text-primary);
  font-variant-numeric: tabular-nums;
}

.pricing-widget__section-label {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
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
  gap: 0;
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

.pricing-widget__unavailable {
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
  background: var(--theme-primary);
  color: var(--theme-text-on-primary, #fff);
}

.pricing-widget__period-btn--active:hover {
  background: var(--theme-primary);
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
