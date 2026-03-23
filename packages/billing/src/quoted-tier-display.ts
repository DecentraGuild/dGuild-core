/**
 * Build admin tier display from QuoteResult.quotedMeterTiers — no product-specific hardcoding.
 */
import type { ConditionSet, TierDefinition } from './legacy-types.js'
import type { QuoteResult } from './types.js'
import { CONDITION_TO_METER } from './module-product-map.js'

export function primaryQuotedMeterKey(
  q: QuoteResult | null,
  liveConditions: ConditionSet | null | undefined,
): string | null {
  if (!q?.quotedMeterTiers) return null
  const keys = Object.keys(q.quotedMeterTiers)
  if (keys.length === 0) return null
  if (keys.length === 1) return keys[0]
  if (liveConditions) {
    for (const k of Object.keys(liveConditions)) {
      const mk = CONDITION_TO_METER[k] ?? k
      if (keys.includes(mk)) return mk
    }
  }
  return keys.find((k) => q.meters[k]) ?? keys[0]
}

export function tierDefinitionFromQuotedMeter(q: QuoteResult, meterKey: string): TierDefinition | null {
  const m = q.meters[meterKey]
  if (!m) return null
  const qt = q.quotedMeterTiers?.[meterKey]
  if (qt) {
    const cap = qt.maxQuantity != null ? qt.maxQuantity : m.limit
    return {
      id: `quoted-${meterKey}-${qt.minQuantity}-${String(qt.maxQuantity ?? 'x')}`,
      name: qt.label?.trim() ? qt.label : 'Plan',
      recurringPrice: 0,
      included: { [meterKey]: cap },
      oneTimePerUnit: qt.perMarginalUnitUsdc,
    }
  }
  const item = q.lineItems.find((i) => i.meter_key === meterKey)
  const mult = typeof item?.price_multiplier === 'number' ? item.price_multiplier : 1
  const unit = item?.unit_price != null ? item.unit_price * mult : 0
  return {
    id: `quote-fallback-${meterKey}`,
    name: item?.label?.trim() ? item.label : 'Plan',
    recurringPrice: 0,
    included: { [meterKey]: m.limit },
    oneTimePerUnit: unit,
  }
}
