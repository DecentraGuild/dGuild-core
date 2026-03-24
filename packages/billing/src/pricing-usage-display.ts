/**
 * Admin pricing widget: human labels for meter keys and which meters to hide from usage rows.
 */

/** Meters omitted from the usage summary (e.g. internal / redundant). */
export const USAGE_DISPLAY_SKIP_METERS = new Set<string>(['base_currencies_count'])

/** Short labels for usage rows keyed by billing meter (or condition key when identical). */
export const USAGE_METER_LABELS: Record<string, string> = {
  registration: 'Guild registration',
  slug: 'Custom slug',
  mints_count: 'Tradable mints in scope',
  base_currencies_count: 'Base pay currencies',
  custom_currencies: 'Custom pay currencies',
  monetize_storefront: 'Monetize storefront',
  raffle_slots: 'Raffle slots',
  raffle_hosting: 'Raffle hosting',
  mintsBase: 'Metadata mints',
  mintsGrow: 'Snapshot mints',
  mintsPro: 'Transaction mints',
  mints_current: 'Current holders',
  mints_snapshot: 'Snapshot',
  mints_transactions: 'Transactions',
  mintsSnapshot: 'Snapshot',
  mintsTransactions: 'Transactions',
  gate_lists: 'Gate lists',
  crafter_tokens: 'Crafter tokens',
}

export function usageMeterLabel(meterKey: string): string {
  return USAGE_METER_LABELS[meterKey] ?? meterKey
}
