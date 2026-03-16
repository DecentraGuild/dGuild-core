/**
 * V2 product display metadata. Used by UI to show one-time vs recurring.
 * Source of truth: v2 adapters and tier_rules, not legacy catalog.
 */
import type { TierDefinition } from './legacy-types.js'

export type ProductDisplayType = 'one_time_per_unit' | 'tiered_with_one_time' | 'recurring'

const PRODUCT_DISPLAY: Record<string, ProductDisplayType> = {
  gates: 'one_time_per_unit',
  crafter: 'one_time_per_unit',
  raffles: 'tiered_with_one_time',
  marketplace: 'recurring',
  watchtower: 'recurring',
  admin: 'recurring',
  shipment: 'recurring',
}

const PRODUCT_UNIT_LABEL: Record<string, string> = {
  gates: 'Member list',
  crafter: 'Token',
}

/** Raffles tiers: Base 1 slot (5 USDC/raffle), Grow 3 slots, Pro 10 slots. Matches tier_rules. */
export const RAFFLES_TIERS: TierDefinition[] = [
  { id: 'base', name: 'Base', recurringPrice: 0, included: { raffle_slots: 1 }, oneTimePerUnit: 5 },
  { id: 'grow', name: 'Grow', recurringPrice: 0, included: { raffle_slots: 3 }, oneTimePerUnit: 0 },
  { id: 'pro', name: 'Pro', recurringPrice: 0, included: { raffle_slots: 10 }, oneTimePerUnit: 0 },
]

export function getProductDisplayType(productKey: string): ProductDisplayType {
  return PRODUCT_DISPLAY[productKey] ?? 'recurring'
}

export function getProductUnitLabel(productKey: string): string {
  return PRODUCT_UNIT_LABEL[productKey] ?? 'Unit'
}

export function getRafflesTiers(): TierDefinition[] {
  return RAFFLES_TIERS
}
