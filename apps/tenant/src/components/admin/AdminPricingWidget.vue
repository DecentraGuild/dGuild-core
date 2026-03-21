<template>
  <aside class="pricing-widget">
    <div v-if="billingDisabled" class="pricing-widget__unavailable">
      <span>Billing temporarily unavailable</span>
    </div>

    <div v-else-if="loading" class="pricing-widget__loading">
      <Icon icon="lucide:loader-2" class="pricing-widget__spinner" />
      <span>Loading pricing...</span>
    </div>

    <template v-else-if="price?.billable && (isAddUnit || isTieredWithOneTime)">
      <div class="pricing-widget__tier">
        <span class="pricing-widget__tier-name">{{ isTieredWithOneTime ? (price.oneTimeUnitName ?? 'Per raffle') : addUnitName }}</span>
        <span class="pricing-widget__tier-price">{{ formatUsdc(isTieredWithOneTime ? oneTimePerUnitEffective : price.oneTimeTotal) }} USDC</span>
      </div>
    </template>

    <template v-else-if="price?.billable && selectedTier">
      <div class="pricing-widget__tier" :class="{ 'pricing-widget__tier--marketplace': moduleId === 'marketplace' }">
        <div class="pricing-widget__tier-text">
          <span class="pricing-widget__tier-name">{{ marketplaceTierPrimary }}</span>
          <span v-if="marketplaceTierSecondary" class="pricing-widget__tier-band">{{ marketplaceTierSecondary }}</span>
        </div>
        <span class="pricing-widget__tier-price">
          {{ formatUsdc(selectedPeriod === 'yearly' ? price.recurringYearly / 12 : price.recurringMonthly) }} USDC/mo
        </span>
      </div>

      <div v-if="moduleId === 'marketplace'" class="pricing-widget__entitlements">
        <p class="pricing-widget__section-label">What counts toward your plan</p>
        <ul class="pricing-widget__ent-list">
          <li
            v-for="row in usageRows"
            :key="row.key"
            class="pricing-widget__ent-card"
            :class="{ 'pricing-widget__ent-card--bool': row.type === 'boolean' }"
          >
            <template v-if="row.type === 'numeric'">
              <div class="pricing-widget__ent-top">
                <div class="pricing-widget__ent-icon-wrap" aria-hidden="true">
                  <Icon :icon="marketplaceEntIcon(row.key)" class="pricing-widget__ent-icon" />
                </div>
                <div class="pricing-widget__ent-mid">
                  <span class="pricing-widget__ent-title">{{ row.label }}</span>
                  <span class="pricing-widget__ent-hint">{{ marketplaceEntHint(row.key) }}</span>
                </div>
                <div class="pricing-widget__ent-numbers">
                  <span class="pricing-widget__ent-num pricing-widget__ent-num--cur">{{ row.current }}</span>
                  <span class="pricing-widget__ent-slash">/</span>
                  <span class="pricing-widget__ent-num pricing-widget__ent-num--max">{{ marketplaceCapLabel(row) }}</span>
                </div>
              </div>
              <div v-if="marketplaceShowBar(row)" class="pricing-widget__ent-bar-track">
                <div
                  class="pricing-widget__ent-bar-fill"
                  :class="{ 'pricing-widget__ent-bar-fill--over': row.ratio > 1 }"
                  :style="{ width: `${Math.min(row.ratio * 100, 100)}%` }"
                />
              </div>
              <p v-else-if="row.current > 0" class="pricing-widget__ent-prewrap">
                Limits apply after you deploy or extend billing.
              </p>
            </template>
            <template v-else>
              <div class="pricing-widget__ent-top">
                <div class="pricing-widget__ent-icon-wrap" aria-hidden="true">
                  <Icon icon="lucide:percent" class="pricing-widget__ent-icon" />
                </div>
                <div class="pricing-widget__ent-mid">
                  <span class="pricing-widget__ent-title">{{ row.label }}</span>
                  <span class="pricing-widget__ent-hint">Maker/taker fees on trades</span>
                </div>
                <span
                  class="pricing-widget__ent-badge"
                  :class="{
                    'pricing-widget__ent-badge--on': row.active && row.included,
                    'pricing-widget__ent-badge--addon': row.active && !row.included,
                    'pricing-widget__ent-badge--off': !row.active,
                  }"
                >
                  {{ row.active ? (row.included ? 'Included' : 'Add-on') : 'Off' }}
                </span>
              </div>
            </template>
          </li>
        </ul>
      </div>

      <div v-else class="pricing-widget__usage">
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
          <span>{{ formatUsdc(subscription!.recurringAmountUsdc) }} USDC</span>
        </div>
      </div>
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
        v-if="moduleState === 'staging' || (moduleState === 'active' && hasDeficit && !isAddUnit)"
        variant="default"
        :disabled="deploying"
        @click="$emit('deploy', selectedPeriod, conditions ?? undefined)"
      >
        <Icon v-if="deploying" icon="lucide:loader-2" class="pricing-widget__spinner" />
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
import { getProductDisplayType, getProductUnitLabel, getRafflesTiers, CONDITION_TO_METER } from '@decentraguild/billing'
import { getModuleCatalogEntry } from '@decentraguild/catalog'
import { Button } from '~/components/ui/button'
import { Icon } from '@iconify/vue'
import { formatDate, formatUsdc } from '@decentraguild/display'
import { useQuote } from '~/composables/core/useQuote'
import { usePricingDisplay, type NumericUsageRow } from '~/composables/core/usePricingDisplay'
import { usePricingWidgetActions } from '~/composables/core/usePricingWidgetActions'

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

/** V2 product key (slug -> admin for billing). */
const productKey = computed(() => (props.moduleId === 'slug' ? 'admin' : props.moduleId))

/** V2: one-time per unit (gates, crafter). From billing product config, not catalog. */
const isAddUnit = computed(() => getProductDisplayType(productKey.value) === 'one_time_per_unit')

/** V2: tiered with one-time per unit (raffles). From billing product config, not catalog. */
const isTieredWithOneTime = computed(() => getProductDisplayType(productKey.value) === 'tiered_with_one_time')

/** V2: unit label for one-time display. From billing product config, not catalog. */
const addUnitName = computed(() => getProductUnitLabel(productKey.value))

const conditions = computed((): ConditionSet | null => {
  if (hasLiveConditions.value) return props.conditions!
  const q = quote.value
  if (!q?.meters) return null
  return Object.fromEntries(
    (Object.entries(q.meters) as [string, { used: number; limit: number }][]).map(([k, v]) => [k, v.used]),
  ) as ConditionSet
})

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
  const raffleSlotsItem = q.lineItems.find((i: QuoteLineItem) => i.meter_key === 'raffle_slots')
  const fromQuote =
    raffleSlotsItem?.unit_price ?? (raffleSlotsItem?.quantity ? raffleSlotsItem.price_usdc / raffleSlotsItem.quantity : 0)
  const oneTimePerUnitForSelectedTier =
    fromQuote > 0 ? fromQuote : (selectedTier.value?.oneTimePerUnit ?? 0)
  return {
    moduleId: props.moduleId,
    billable: true,
    components,
    oneTimeTotal: q.priceUsdc,
    recurringMonthly: q.priceUsdc,
    recurringYearly: q.priceUsdc * (selectedPeriod.value === 'yearly' ? 1 : 12),
    appliedYearlyDiscount: null,
    selectedTierId: null,
    oneTimePerUnitForSelectedTier: isTieredWithOneTime.value ? oneTimePerUnitForSelectedTier : undefined,
    oneTimeUnitName: isTieredWithOneTime.value ? 'Per raffle' : undefined,
  }
})

const pricingModel = computed((): TieredAddonsPricing | TieredWithOneTimePerUnitPricing | null => {
  const q = quote.value
  if (!q?.meters) return null
  const conditionKeys = Object.keys(q.meters)
  if (isTieredWithOneTime.value && productKey.value === 'raffles') {
    return {
      modelType: 'tiered_with_one_time_per_unit',
      conditionKeys,
      tiers: getRafflesTiers(),
      addons: [],
      yearlyDiscountPercent: 0,
      oneTimeUnitName: 'Per raffle',
    } as TieredWithOneTimePerUnitPricing
  }
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
  const cond = conditions.value
  if (!pm) return null
  if (isTieredWithOneTime.value && productKey.value === 'raffles' && cond) {
    const slots = cond.raffle_slots ?? cond.raffleSlotsUsed ?? 0
    const tiers = (pm as TieredWithOneTimePerUnitPricing).tiers
    const num = typeof slots === 'number' ? slots : 0
    if (num >= 4) return tiers.find((t) => t.id === 'pro') ?? tiers[2] ?? null
    if (num >= 2) return tiers.find((t) => t.id === 'grow') ?? tiers[1] ?? null
    return tiers.find((t) => t.id === 'base') ?? tiers[0] ?? null
  }
  return (pm as TieredAddonsPricing).tiers[0] ?? null
})

const oneTimePerUnitEffective = computed(() => price.value?.oneTimePerUnitForSelectedTier ?? 0)

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


const storedConditionsRef = computed(() => props.storedConditions ?? null)
const { usageRows, addonComponents } = usePricingDisplay(
  pricingModel,
  conditions,
  selectedTier,
  price,
  storedConditionsRef
)

const MARKETPLACE_ENT_ICONS: Record<string, string> = {
  mints_count: 'lucide:layers',
  base_currencies_count: 'lucide:coins',
  custom_currencies: 'lucide:wallet-cards',
}

const MARKETPLACE_ENT_HINTS: Record<string, string> = {
  mints_count: 'NFT collections + SPL assets in your tradable list',
  base_currencies_count: 'How many base tokens (SOL, USDC, USDT, WBTC) you accept',
  custom_currencies: 'Payment tokens beyond the four base currencies',
}

function marketplaceEntIcon(key: string) {
  return MARKETPLACE_ENT_ICONS[key] ?? 'lucide:gauge'
}

function marketplaceEntHint(key: string) {
  return MARKETPLACE_ENT_HINTS[key] ?? ''
}

function marketplaceCapLabel(row: NumericUsageRow) {
  if (row.stored != null && row.stored > 0) return String(row.stored)
  if (row.included > 0) return String(row.included)
  return '—'
}

function marketplaceShowBar(row: NumericUsageRow) {
  const cap = row.stored ?? row.included
  return cap > 0
}

const marketplaceTierPrimary = computed(() => {
  if (props.moduleId !== 'marketplace') return selectedTier.value?.name ?? ''
  const q = quote.value
  const item = q?.lineItems?.find((i: QuoteLineItem) => i.meter_key === 'mints_count' && i.label)
  const label = item?.label?.trim() ?? ''
  const m = label.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (m) return m[1].trim()
  if (label) return label
  return 'Marketplace'
})

const marketplaceTierSecondary = computed(() => {
  if (props.moduleId !== 'marketplace') return null as string | null
  const q = quote.value
  const item = q?.lineItems?.find((i: QuoteLineItem) => i.meter_key === 'mints_count' && i.label)
  const label = item?.label?.trim() ?? ''
  const m = label.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (m) return m[2].trim()
  const hasMeters = q?.meters && Object.keys(q.meters).length > 0
  if (hasMeters && (q?.priceUsdc ?? 0) === 0) return 'No extra charges at current usage'
  return null
})

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
  align-items: flex-start;
  gap: var(--theme-space-md);
}

.pricing-widget__tier--marketplace {
  align-items: center;
}

.pricing-widget__tier-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pricing-widget__tier-band {
  font-size: var(--theme-font-xs);
  font-weight: 500;
  color: var(--theme-text-muted);
  line-height: 1.35;
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

.pricing-widget__entitlements {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
}

.pricing-widget__ent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
}

.pricing-widget__ent-card {
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  padding: var(--theme-space-sm) var(--theme-space-md);
}

.pricing-widget__ent-card--bool {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--theme-primary) 6%, var(--theme-bg-secondary)) 0%,
    var(--theme-bg-secondary) 100%
  );
}

.pricing-widget__ent-top {
  display: flex;
  align-items: flex-start;
  gap: var(--theme-space-sm);
}

.pricing-widget__ent-icon-wrap {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: var(--theme-radius-md);
  background: color-mix(in srgb, var(--theme-primary) 12%, transparent);
  color: var(--theme-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.pricing-widget__ent-icon {
  width: 18px;
  height: 18px;
}

.pricing-widget__ent-mid {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pricing-widget__ent-title {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  color: var(--theme-text-primary);
}

.pricing-widget__ent-hint {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  line-height: 1.35;
}

.pricing-widget__ent-numbers {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  gap: 1px;
  font-variant-numeric: tabular-nums;
}

.pricing-widget__ent-num {
  font-size: var(--theme-font-md);
  font-weight: 700;
  color: var(--theme-text-primary);
}

.pricing-widget__ent-num--max {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  color: var(--theme-text-secondary);
}

.pricing-widget__ent-slash {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin: 0 1px;
}

.pricing-widget__ent-bar-track {
  margin-top: var(--theme-space-sm);
  height: 8px;
  background: color-mix(in srgb, var(--theme-border) 50%, var(--theme-bg-card));
  border-radius: var(--theme-radius-full);
  overflow: hidden;
}

.pricing-widget__ent-bar-fill {
  height: 100%;
  background: var(--theme-gradient-primary, var(--theme-primary));
  border-radius: var(--theme-radius-full);
  transition: width 0.35s ease;
}

.pricing-widget__ent-bar-fill--over {
  background: var(--theme-warning, #d97706);
}

.pricing-widget__ent-prewrap {
  margin: var(--theme-space-xs) 0 0;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  line-height: 1.4;
}

.pricing-widget__ent-badge {
  flex-shrink: 0;
  align-self: center;
  padding: 4px 10px;
  border-radius: var(--theme-radius-full);
  font-size: var(--theme-font-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.pricing-widget__ent-badge--on {
  background: color-mix(in srgb, var(--theme-success) 18%, transparent);
  color: var(--theme-success);
}

.pricing-widget__ent-badge--addon {
  background: color-mix(in srgb, var(--theme-primary) 15%, transparent);
  color: var(--theme-primary);
}

.pricing-widget__ent-badge--off {
  background: var(--theme-bg-muted);
  color: var(--theme-text-muted);
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
