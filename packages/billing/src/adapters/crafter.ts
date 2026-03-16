/**
 * Crafter pricing adapter. Resolves crafter_tokens count.
 */
import type { PricingAdapter } from '../types.js'

export const crafterAdapter: PricingAdapter = {
  productKey: 'crafter',
  async resolveUsage({ tenantId, db }) {
    const { data: rows } = await db
      .from('crafter_tokens')
      .select('id')
      .eq('tenant_id', tenantId)
    return {
      crafter_tokens: (rows ?? []).length,
    }
  },
  getMeterDefinitions() {
    return [{ meterKey: 'crafter_tokens', unit: 'tokens' }]
  },
}
