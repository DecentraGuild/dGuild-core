/**
 * Module-to-product and condition-to-meter mappings. Shared by billing UI and admin flows.
 */

export const MODULE_TO_PRODUCT: Record<string, string> = {
  marketplace: 'marketplace',
  watchtower: 'watchtower',
  raffles: 'raffles',
  gates: 'gates',
  crafter: 'crafter',
  admin: 'admin',
  slug: 'admin',
  shipment: 'shipment',
}

export const CONDITION_TO_METER: Record<string, string> = {
  mintsCount: 'mints_count',
  mints_current: 'mints_current',
  mints_snapshot: 'mints_snapshot',
  mints_transactions: 'mints_transactions',
  mintsSnapshot: 'mints_snapshot',
  mintsTransactions: 'mints_transactions',
  raffleSlotsUsed: 'raffle_slots',
  raffle_hosting: 'raffle_hosting',
  listsCount: 'gate_lists',
  tokensCount: 'crafter_tokens',
}

export function toMeterOverrides(
  conditions: Record<string, number | boolean> | undefined,
): Record<string, number> | undefined {
  if (!conditions || Object.keys(conditions).length === 0) return undefined
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(conditions)) {
    const meter = CONDITION_TO_METER[k] ?? k
    out[meter] = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v)
  }
  return out
}
