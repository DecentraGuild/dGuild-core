/**
 * Watchtower pricing adapter. Resolves mints_current, mints_snapshot, mints_transactions.
 */
import type { PricingAdapter } from '../types.js'

export const watchtowerAdapter: PricingAdapter = {
  productKey: 'watchtower',
  async resolveUsage({ tenantId, db }) {
    const { data: rows } = await db
      .from('watchtower_watches')
      .select('track_holders, track_snapshot, track_transactions')
      .eq('tenant_id', tenantId)
    const watches = (rows ?? []) as Array<{
      track_holders?: boolean
      track_snapshot?: boolean
      track_transactions?: boolean
    }>
    return {
      mints_current: watches.filter((r) => r.track_holders).length,
      mints_snapshot: watches.filter((r) => r.track_snapshot).length,
      mints_transactions: watches.filter((r) => r.track_transactions).length,
    }
  },
  getMeterDefinitions() {
    return [
      { meterKey: 'mints_current', unit: 'holders' },
      { meterKey: 'mints_snapshot', unit: 'snapshot' },
      { meterKey: 'mints_transactions', unit: 'transactions' },
    ]
  },
}
