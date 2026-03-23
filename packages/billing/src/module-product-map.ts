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

function buildMeterToConditionKeys(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [condKey, meterKey] of Object.entries(CONDITION_TO_METER)) {
    ;(out[meterKey] ??= []).push(condKey)
  }
  for (const keys of Object.values(out)) {
    keys.sort()
  }
  return out
}

/**
 * For each billing meter key, condition / form keys that map to it via {@link CONDITION_TO_METER}.
 * Used to read live or stored usage when the UI still uses camelCase condition keys.
 */
export const METER_TO_CONDITION_KEYS: Readonly<Record<string, readonly string[]>> = Object.freeze(
  Object.fromEntries(
    Object.entries(buildMeterToConditionKeys()).map(([k, v]) => [k, Object.freeze([...v]) as readonly string[]]),
  ),
)

/**
 * Read a value from a condition snapshot for a billing meter key.
 * Tries the meter key first, then any aliases in {@link METER_TO_CONDITION_KEYS}.
 */
export function valueFromConditionSetForMeter(
  cond: Record<string, unknown> | null | undefined,
  meterKey: string,
): unknown {
  if (!cond) return undefined
  if (cond[meterKey] !== undefined) return cond[meterKey]
  for (const ck of METER_TO_CONDITION_KEYS[meterKey] ?? []) {
    if (cond[ck] !== undefined) return cond[ck]
  }
  return undefined
}

/** Numeric stored value for a meter, or null if missing / non-numeric. */
export function numberFromConditionSetForMeter(
  stored: Record<string, unknown> | null | undefined,
  meterKey: string,
): number | null {
  const v = valueFromConditionSetForMeter(stored, meterKey)
  return typeof v === 'number' ? v : null
}

/**
 * Primary `meter_key` in `tenant_meter_limits` for modules that use a single row (admin subscription card).
 * Watchtower and other multi-meter modules use dedicated fetch logic.
 */
export const MODULE_TENANT_METER_LIMIT_KEY: Record<string, string> = {
  marketplace: 'mints_count',
  raffles: 'raffle_slots',
  gates: 'gate_lists',
  crafter: 'crafter_tokens',
  admin: 'registration',
  slug: 'slug',
}

export function tenantMeterLimitKeyForModule(moduleId: string): string {
  return MODULE_TENANT_METER_LIMIT_KEY[moduleId] ?? moduleId
}
