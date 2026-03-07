import type { ConditionSet } from '@decentraguild/billing'
import { getAddressBookTierCounts } from '../../db/tracker-address-book.js'

export async function extractTrackerConditions(tenantId: string): Promise<ConditionSet> {
  const counts = await getAddressBookTierCounts(tenantId)
  return {
    mintsBase: counts.mintsBase,
    mintsGrow: counts.mintsGrow,
    mintsPro: counts.mintsPro,
  }
}
