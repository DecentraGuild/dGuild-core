/**
 * Pricing adapters. Register at startup.
 */
import { registerAdapter } from './registry.js'
import { watchtowerAdapter } from './watchtower.js'
import { marketplaceAdapter } from './marketplace.js'
import { rafflesAdapter } from './raffles.js'
import { gatesAdapter } from './gates.js'
import { crafterAdapter } from './crafter.js'
import { adminAdapter } from './admin.js'
import { shipmentAdapter } from './shipment.js'

export { adapterRegistry, getAdapter, registerAdapter } from './registry.js'
export { watchtowerAdapter } from './watchtower.js'
export { marketplaceAdapter } from './marketplace.js'
export { rafflesAdapter } from './raffles.js'
export { gatesAdapter } from './gates.js'
export { crafterAdapter } from './crafter.js'
export { adminAdapter } from './admin.js'
export { shipmentAdapter } from './shipment.js'

export function registerAllAdapters(): void {
  registerAdapter(watchtowerAdapter)
  registerAdapter(marketplaceAdapter)
  registerAdapter(rafflesAdapter)
  registerAdapter(gatesAdapter)
  registerAdapter(crafterAdapter)
  registerAdapter(adminAdapter)
  registerAdapter(shipmentAdapter)
}
