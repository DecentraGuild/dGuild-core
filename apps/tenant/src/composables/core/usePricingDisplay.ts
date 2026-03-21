/**
 * Display logic for AdminPricingWidget: usage rows and addon components.
 */

import type { Ref } from 'vue'
import { computed } from 'vue'
import type { ConditionSet, PriceResult, TierDefinition } from '@decentraguild/billing'
import type { TieredAddonsPricing, TieredWithOneTimePerUnitPricing } from '@decentraguild/billing'

export const PRICING_WIDGET_SKIP_USAGE_METERS = new Set(['base_currencies_count'])

export const CONDITION_LABELS: Record<string, string> = {
  mints_count: 'Tradable mints in scope',
  base_currencies_count: 'Base pay currencies',
  custom_currencies: 'Custom pay currencies',
  monetize_storefront: 'Monetize storefront',
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

export interface UsageRowDisplay {
  key: string
  label: string
  valueText: string
}

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
  const usageRows = computed((): UsageRowDisplay[] => {
    const pm = pricingModel.value
    const cond = conditions.value
    const tier = selectedTier.value
    if (!pm || !cond || !tier) return []
    const storedCond = storedConditions?.value ?? null
    return pm.conditionKeys
      .filter((key) => !PRICING_WIDGET_SKIP_USAGE_METERS.has(key))
      .map((key) => {
        const condVal = cond[key]
        const inclVal = tier.included[key]
        const label = CONDITION_LABELS[key] ?? key

        if (typeof condVal === 'boolean' || typeof inclVal === 'boolean') {
          const current = condVal === true ? 1 : 0
          const included = inclVal === true ? 1 : 0
          return { key, label, valueText: `${current} / ${included}` }
        }

        const current = typeof condVal === 'number' ? condVal : 0
        const included = typeof inclVal === 'number' ? inclVal : 0
        const stored =
          storedCond != null && typeof storedCond[key] === 'number' ? (storedCond[key] as number) : null
        const valueText =
          stored != null
            ? `${current} / ${stored}`
            : included === 0
              ? String(current)
              : `${current} / ${included}`

        return { key, label, valueText }
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
