/**
 * Display logic for AdminPricingWidget: usage rows and addon components.
 */

import type { Ref } from 'vue'
import { computed } from 'vue'
import type { ConditionSet, PriceResult, TierDefinition } from '@decentraguild/billing'
import type { TieredAddonsPricing, TieredWithOneTimePerUnitPricing } from '@decentraguild/billing'

export const CONDITION_LABELS: Record<string, string> = {
  mintsCount: 'Mints',
  baseCurrenciesCount: 'Base currencies',
  customCurrenciesCount: 'Custom currencies',
  monetizeStorefront: 'Monetize storefront',
  raffleSlotsUsed: 'Raffle slots',
  mintsBase: 'Metadata mints',
  mintsGrow: 'Snapshot mints',
  mintsPro: 'Transaction mints',
  mints_current: 'Current holders',
  mints_snapshot: 'Snapshot',
  mints_transactions: 'Transactions',
  mintsSnapshot: 'Snapshot',
  mintsTransactions: 'Transactions',
}

export interface NumericUsageRow {
  key: string
  label: string
  type: 'numeric'
  current: number
  included: number
  stored: number | null
  ratio: number
  showBar: boolean
}

export interface BooleanUsageRow {
  key: string
  label: string
  type: 'boolean'
  active: boolean
  included: boolean
}

export type UsageRow = NumericUsageRow | BooleanUsageRow

export interface AddonComponent {
  name: string
  quantity: number
  amount: number
}

export function usePricingDisplay(
  pricingModel: Ref<TieredAddonsPricing | TieredWithOneTimePerUnitPricing | null>,
  conditions: Ref<ConditionSet | null>,
  selectedTier: Ref<TierDefinition | null>,
  price: Ref<PriceResult | null>,
  storedConditions?: Ref<ConditionSet | null>
) {
  const usageRows = computed((): UsageRow[] => {
    const pm = pricingModel.value
    const cond = conditions.value
    const tier = selectedTier.value
    if (!pm || !cond || !tier) return []
    const storedCond = storedConditions?.value ?? null
    return pm.conditionKeys.map((key) => {
      const condVal = cond[key]
      const inclVal = tier.included[key]
      const label = CONDITION_LABELS[key] ?? key

      if (typeof condVal === 'boolean' || typeof inclVal === 'boolean') {
        return {
          key,
          label,
          type: 'boolean' as const,
          active: condVal === true,
          included: inclVal === true,
        }
      }

      const current = typeof condVal === 'number' ? condVal : 0
      const included = typeof inclVal === 'number' ? inclVal : 0
      const stored =
        storedCond != null && typeof storedCond[key] === 'number' ? (storedCond[key] as number) : null
      const denominator = stored != null ? stored : included
      const ratio = denominator > 0 ? current / denominator : (current > 0 ? 1 : 0)
      const showBar = denominator > 0

      return { key, label, type: 'numeric' as const, current, included, stored, ratio, showBar }
    })
  })

  const addonComponents = computed((): AddonComponent[] => {
    const p = price.value
    const tier = selectedTier.value
    if (!p) return []
    return p.components.filter(
      (c) =>
        c.type === 'recurring' &&
        c.quantity > 0 &&
        p.selectedTierId &&
        c.name !== tier?.name
    )
  })

  return { usageRows, addonComponents }
}
