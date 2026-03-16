/**
 * Shipment pricing adapter. Resolves recipients_count (placeholder, 0 for now).
 */
import type { PricingAdapter } from '../types.js'

export const shipmentAdapter: PricingAdapter = {
  productKey: 'shipment',
  async resolveUsage() {
    return {
      recipients_count: 0,
    }
  },
  getMeterDefinitions() {
    return [{ meterKey: 'recipients_count', unit: 'recipients' }]
  },
}
