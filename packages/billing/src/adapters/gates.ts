/**
 * Gates pricing adapter. Resolves gate_lists count.
 */
import type { PricingAdapter } from '../types.js'

export const gatesAdapter: PricingAdapter = {
  productKey: 'gates',
  async resolveUsage({ tenantId, db }) {
    const { data: rows } = await db
      .from('tenant_gate_lists')
      .select('tenant_id')
      .eq('tenant_id', tenantId)
    return {
      gate_lists: (rows ?? []).length,
    }
  },
  getMeterDefinitions() {
    return [{ meterKey: 'gate_lists', unit: 'lists' }]
  },
}
