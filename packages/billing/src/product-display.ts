/**
 * V2 product display metadata. Used by UI to show product *shape* (not numeric prices).
 * Prices come from billing quotes / tier_rules only.
 */

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
  raffles: 'Raffle',
}

export function getProductDisplayType(productKey: string): ProductDisplayType {
  return PRODUCT_DISPLAY[productKey] ?? 'recurring'
}

export function getProductUnitLabel(productKey: string): string {
  return PRODUCT_UNIT_LABEL[productKey] ?? 'Unit'
}
