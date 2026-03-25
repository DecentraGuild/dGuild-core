/**
 * Display logic for AdminPricingWidget: usage rows and addon components.
 */

import type { Ref } from 'vue'
import { computed } from 'vue'
import type { ConditionSet, PriceResult, TierDefinition } from '@decentraguild/billing'
import type { TieredAddonsPricing, TieredWithOneTimePerUnitPricing } from '@decentraguild/billing'
import {
  USAGE_DISPLAY_SKIP_METERS,
  usageMeterLabel,
  valueFromConditionSetForMeter,
  numberFromConditionSetForMeter,
} from '@decentraguild/billing'

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
      .filter((key) => !USAGE_DISPLAY_SKIP_METERS.has(key))
      .map((key) => {
        const condVal = valueFromConditionSetForMeter(cond, key)
        const inclVal = tier.included[key]
        const label = usageMeterLabel(key)

        if (key === 'monetize_storefront') {
          const current =
            condVal === true || condVal === 1 || condVal === 'true' ? 1 : 0
          const lim = typeof inclVal === 'number' ? inclVal : inclVal === true ? 1 : 0
          const cap = lim >= 1 ? 1 : 0
          return { key, label, valueText: `${current} / ${cap}` }
        }

        if (typeof condVal === 'boolean' || typeof inclVal === 'boolean') {
          const current = condVal === true ? 1 : 0
          const cap =
            typeof inclVal === 'number'
              ? inclVal >= 1
                ? 1
                : 0
              : inclVal === true
                ? 1
                : 0
          return { key, label, valueText: `${current} / ${cap}` }
        }

        const current = typeof condVal === 'number' ? condVal : 0
        const included = typeof inclVal === 'number' ? inclVal : 0
        const stored = storedCond != null ? numberFromConditionSetForMeter(storedCond, key) : null
        const valueText =
          stored != null
            ? `${current} / ${stored}`
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
