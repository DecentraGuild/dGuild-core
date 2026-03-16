/**
 * Pricing adapter registry. Engine resolves adapter by productKey.
 */
import type { PricingAdapter } from '../types.js'

export const adapterRegistry = new Map<string, PricingAdapter>()

export function registerAdapter(adapter: PricingAdapter): void {
  adapterRegistry.set(adapter.productKey, adapter)
}

export function getAdapter(productKey: string): PricingAdapter | undefined {
  return adapterRegistry.get(productKey)
}
