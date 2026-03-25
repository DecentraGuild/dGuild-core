/**
 * Module catalog types.
 * Single source of truth for module metadata; maps cleanly to a future DB table.
 */

import type { PricingModel } from '@decentraguild/billing'

import { DEFAULT_INTERNAL_DEV_TENANT_IDS } from './internal-dev-tenant-env.js'

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

/** Doc sections: standard (overview, mechanics, setup, pricing) or dguild (overview, gettingStarted, creatingDguild, directory, billingOverview). */
export type ModuleCatalogDoc = Record<string, string>

/** Module block in catalog file (single source of truth per module). */
export interface ModuleCatalogFileModule {
  id: string
  status: ModuleCatalogStatus
  goActiveImmediately?: boolean
  name: string
  icon: string
  image: string | null
  routePath: string
  order: number
  programId?: string
  gateLabel?: string
  alwaysOn?: boolean
  addons?: Record<string, ModuleCatalogAddon>
  docsOnly?: boolean
}

/** Catalog block in catalog file. */
export interface ModuleCatalogFileCatalog {
  shortDescription: string
  longDescription: string
  keyInfo: string[]
  /** User-facing explain string for costs, fees, or transaction costs. Shown in a modal from the module page when set. */
  userCostsInfo?: string
}

/** Full catalog file shape (module + catalog + docs; activationInstructions at top level). */
export interface ModuleCatalogFile {
  module: ModuleCatalogFileModule
  catalog: ModuleCatalogFileCatalog
  docs: ModuleCatalogDoc
  activationInstructions?: {
    intro: string
    steps: string[]
    note?: string
  }
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
  /** When true, entry appears only in docs sidebar and doc routes; excluded from tenant nav, activation, discovery, ops. */
  docsOnly?: boolean
  /** Blockchain program used in transaction logic. Present only for modules with on-chain programs. */
  blockchain?: {
    programId: string
  }
  /** Doc sections (overview, mechanics, setup, pricing or dguild extended keys). Used by platform docs. */
  docs?: ModuleCatalogDoc
  /** User-facing explain string for costs, fees, or transaction costs. Shown in a modal from the module page when set. */
  userCostsInfo?: string
}

/** Statuses where the module code exists and can appear in tenant nav. */
export const NAVIGABLE_STATUSES: ReadonlySet<ModuleCatalogStatus> = new Set([
  'available',
  'coming_soon',
  'development',
  'deprecated',
])

export function isModuleNavigable(status: ModuleCatalogStatus): boolean {
  return NAVIGABLE_STATUSES.has(status)
}

export {
  parseInternalDevTenantIds,
  resolveInternalDevTenantIdsFromEnv,
} from './internal-dev-tenant-env.js'

let internalDevTenantIdsOverride: readonly string[] | null = null

export function setInternalDevTenantIds(ids: readonly string[] | null): void {
  internalDevTenantIdsOverride = ids === null ? null : [...ids]
}

export function getInternalDevTenantIds(): readonly string[] {
  if (internalDevTenantIdsOverride !== null) return internalDevTenantIdsOverride
  return DEFAULT_INTERNAL_DEV_TENANT_IDS
}

export const INTERNAL_DEV_TENANT_ID = DEFAULT_INTERNAL_DEV_TENANT_IDS[0]

export function isInternalDevTenant(tenantId: string): boolean {
  return getInternalDevTenantIds().includes(tenantId)
}

/**
 * Whether a tenant may activate (enable) a module based on catalog status.
 *
 * Rules:
 * - available    → always allowed
 * - coming_soon  → only internal dev tenants (public teaser; flip to available to ship broadly)
 * - development  → only internal dev tenants (hidden from public catalog/docs)
 * - deprecated   → block fresh activation; existing active/deactivating tenants are grandfathered
 * - off          → never
 */
export function canActivateModule(
  status: ModuleCatalogStatus,
  tenantId: string,
): boolean {
  switch (status) {
    case 'available': return true
    case 'coming_soon': return isInternalDevTenant(tenantId)
    case 'development': return isInternalDevTenant(tenantId)
    case 'deprecated': return false
    case 'off': return false
  }
}

/**
 * Whether a module should appear in the public platform module catalog (marketing page + discovery).
 * development and off are never shown publicly.
 */
export function isModulePubliclyVisible(status: ModuleCatalogStatus): boolean {
  return status !== 'development' && status !== 'off'
}

/**
 * Whether a module should appear in the public docs IA (sidebar + routes).
 * development and off are excluded; all other statuses keep docs available.
 */
export function isModuleInPublicDocs(status: ModuleCatalogStatus): boolean {
  return status !== 'development' && status !== 'off'
}
