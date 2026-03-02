import type { ConditionSet } from '@decentraguild/billing'
import { loadWhitelistByTenantId } from '../../config/whitelist-registry.js'

export async function extractWhitelistConditions(tenantId: string): Promise<ConditionSet> {
  const config = await loadWhitelistByTenantId(tenantId)
  const listsCount = config?.lists?.length ?? 0
  return { listsCount }
}
