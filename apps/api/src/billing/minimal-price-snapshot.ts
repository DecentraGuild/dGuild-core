import type { PriceResult } from '@decentraguild/billing'

/** Minimal price snapshot for ops-created subscriptions (no real payment). */
export function minimalPriceSnapshot(moduleId: string): PriceResult {
  return {
    moduleId,
    billable: true,
    components: [],
    oneTimeTotal: 0,
    recurringMonthly: 0,
    recurringYearly: 0,
    appliedYearlyDiscount: null,
    selectedTierId: null,
  }
}
