/**
 * Raffles pricing adapter. Resolves raffle_slots (open raffles count).
 * Like marketplace: no capability gate. Activate module → Base tier (1 slot, free).
 */
import type { PricingAdapter } from '../types.js'

export const rafflesAdapter: PricingAdapter = {
  productKey: 'raffles',
  async resolveUsage({ tenantId, db }) {
    const { data: raffles } = await db
      .from('tenant_raffles')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('closed_at', null)
    const raffleSlots = (raffles ?? []).length
    return { raffle_slots: raffleSlots }
  },
  getMeterDefinitions() {
    return [{ meterKey: 'raffle_slots', unit: 'slots' }]
  },
}
