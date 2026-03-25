import type { QuotedMeterTierInfo } from '../types.js'

export interface TierRow {
  min_quantity: number
  max_quantity: number | null
  unit_price: number
  tier_price: number | null
  label: string | null
}

export function findTier(tiers: TierRow[], quantity: number): TierRow | null {
  let best: TierRow | null = null
  for (const t of tiers) {
    if (t.min_quantity <= quantity && (t.max_quantity == null || quantity <= t.max_quantity)) {
      if (!best || t.min_quantity > best.min_quantity) best = t
    }
  }
  return best
}

/** PRO flat up to 250 mints + per-mint overage from min_quantity 251 row (tier_rules). */
export function marketplaceMintsRecurringUsd(tiers: TierRow[], target: number, mult: number): number {
  if (target <= 0) return 0
  const cap250 = Math.min(target, 250)
  const baseTier = findTier(tiers, cap250)
  if (!baseTier) {
    throw new Error(`No pricing tier matches quantity ${cap250} for marketplace / mints_count`)
  }
  let base = 0
  if (baseTier.tier_price != null && Number(baseTier.tier_price) > 0) {
    base = Number(baseTier.tier_price) * mult
  } else {
    base = cap250 * Number(baseTier.unit_price) * mult
  }
  if (target <= 250) return base
  const overTier = findTier(tiers, target)
  if (!overTier || overTier.min_quantity < 251) {
    throw new Error(
      'Marketplace mints over-250 pricing requires a tier rule with min_quantity >= 251 (product_key marketplace, meter_key mints_count)',
    )
  }
  const perUnit = Number(overTier.unit_price) * mult
  return base + (target - 250) * perUnit
}

export function quotedMeterTiersForMarketplaceMints(
  tiers: TierRow[],
  target: number,
  mult: number,
): QuotedMeterTierInfo {
  const cap250 = Math.min(target, 250)
  const baseTier = findTier(tiers, cap250)
  if (!baseTier) {
    throw new Error(`No pricing tier matches quantity ${cap250} for marketplace / mints_count`)
  }
  if (target <= 250) {
    const hasFlat = baseTier.tier_price != null && Number(baseTier.tier_price) > 0
    return {
      label: baseTier.label,
      minQuantity: baseTier.min_quantity,
      maxQuantity: baseTier.max_quantity,
      perMarginalUnitUsdc: hasFlat ? 0 : Number(baseTier.unit_price) * mult,
    }
  }
  const overTier = findTier(tiers, target)
  if (!overTier || overTier.min_quantity < 251) {
    throw new Error(
      'Marketplace mints over-250 pricing requires a tier rule with min_quantity >= 251 (product_key marketplace, meter_key mints_count)',
    )
  }
  const parts = [baseTier.label, overTier.label].filter((s): s is string => Boolean(s?.trim()))
  return {
    label: parts.length ? parts.join(' + ') : null,
    minQuantity: baseTier.min_quantity,
    maxQuantity: overTier.max_quantity,
    perMarginalUnitUsdc: Number(overTier.unit_price) * mult,
  }
}
