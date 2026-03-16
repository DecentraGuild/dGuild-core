/**
 * Module catalog types.
 * Single source of truth for module metadata; maps cleanly to a future DB table.
 */

import type { PricingModel } from '@decentraguild/billing'

export type ModuleCatalogStatus =
  | 'available'
  | 'coming_soon'
  | 'development'
  | 'deprecated'
  | 'off'

/** Addon of a parent module (e.g. slug is an addon of admin). Has its own pricing; can be deactivated without deactivating the parent. */
export interface ModuleCatalogAddon {
  id: string
  name: string
  shortDescription?: string
  pricing: PricingModel | null
}

export interface ModuleCatalogEntry {
  id: string
  status: ModuleCatalogStatus
  name: string
  /** App-wide label for gate/whitelist (e.g. "Gate" or "Whitelist"). From gates module catalog. */
  gateLabel?: string
  icon: string
  image: string | null
  shortDescription: string
  longDescription: string
  keyInfo: string[]
  routePath: string
  order: number
  pricing: PricingModel | null
  /** Addons (e.g. slug). Billed separately; deactivating addon does not deactivate parent. */
  addons?: Record<string, ModuleCatalogAddon>
  /** Shown in the activation modal when enabling the module. Steps are rendered as a bullet list. */
  activationInstructions?: {
    intro: string
    steps: string[]
    note?: string
  }
  /** When true, enabling the module sets state to active immediately (no staging/deploy step). */
  goActiveImmediately?: boolean
  /** When true, module shows "Always on" in Admin > Modules (no billing/extend). */
  alwaysOn?: boolean
  /** Blockchain program used in transaction logic. Present only for modules with on-chain programs. */
  blockchain?: {
    programId: string
  }
}

/** Statuses where the module code exists and can appear in tenant nav. */
export const NAVIGABLE_STATUSES: ReadonlySet<ModuleCatalogStatus> = new Set([
  'available',
  'development',
  'deprecated',
])

export function isModuleNavigable(status: ModuleCatalogStatus): boolean {
  return NAVIGABLE_STATUSES.has(status)
}
