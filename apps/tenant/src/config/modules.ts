import type { ModuleState } from '@decentraguild/core'
import { isModuleVisibleInAdmin, getModuleState } from '@decentraguild/core'
import { getModuleCatalogList, isModuleNavigable } from '@decentraguild/catalog'
import type { ModuleCatalogEntry } from '@decentraguild/catalog'

export interface ModuleNavEntry {
  path: string
  label: string
  icon: string
}

const catalog = getModuleCatalogList().filter((m) => !m.docsOnly)

/** Module id to route, label, and nav icon. Derived from the module catalog. */
export const MODULE_NAV: Record<string, ModuleNavEntry> = Object.fromEntries(
  catalog.map((m: ModuleCatalogEntry) => [
    m.id,
    { path: m.routePath, label: m.name, icon: m.icon },
  ]),
)

/** Modules whose code exists and can appear in tenant nav (status: available, development, deprecated). */
export const IMPLEMENTED_MODULES = new Set(
  catalog.filter((m: ModuleCatalogEntry) => isModuleNavigable(m.status)).map((m) => m.id),
)

/** Nav order from catalog (by order field). Ensures deterministic SSR/client output; new catalog entries auto-included. */
export const NAV_ORDER = catalog.map((m) => m.id)

/** Sub-nav (topbar tabs) per module. Key = module id. */
export interface ModuleSubnavTab {
  id: string
  label: string
  path?: string
}

/** Admin tabs shown as primary (always visible). */
export const ADMIN_PRIMARY_TAB_IDS = ['general', 'theming', 'addressbook', 'modules']
/** Admin tabs grouped under "More" dropdown (between Modules and Billing). */
export const ADMIN_MORE_TAB_IDS = [
  'gates',
  'gating',
  'watchtower',
  'conditions',
  'plan-shipment',
  'discord',
  'marketplace',
  'raffle',
]

const ADMIN_MORE_TAB_CATALOG_SORT: Record<string, { moduleId: string; tie: number }> = {
  gates: { moduleId: 'gates', tie: 0 },
  gating: { moduleId: 'gates', tie: 1 },
  watchtower: { moduleId: 'watchtower', tie: 0 },
  conditions: { moduleId: 'watchtower', tie: 1 },
  discord: { moduleId: 'discord', tie: 0 },
  'plan-shipment': { moduleId: 'shipment', tie: 0 },
  marketplace: { moduleId: 'marketplace', tie: 0 },
  raffle: { moduleId: 'raffles', tie: 0 },
}

export function compareAdminMoreTabsByCatalogOrder(a: ModuleSubnavTab, b: ModuleSubnavTab): number {
  const ka = ADMIN_MORE_TAB_CATALOG_SORT[a.id]
  const kb = ADMIN_MORE_TAB_CATALOG_SORT[b.id]
  if (!ka || !kb) return 0
  const ia = NAV_ORDER.indexOf(ka.moduleId)
  const ib = NAV_ORDER.indexOf(kb.moduleId)
  const oa = ia === -1 ? 999 : ia
  const ob = ib === -1 ? 999 : ib
  if (oa !== ob) return oa - ob
  return ka.tie - kb.tie
}

export const MODULE_SUBNAV: Record<string, ModuleSubnavTab[]> = {
  admin: [
    { id: 'general', label: 'General' },
    { id: 'theming', label: 'Theming' },
    { id: 'addressbook', label: 'Address Book' },
    { id: 'modules', label: 'Modules' },
    { id: 'gates', label: 'Member lists' },
    { id: 'gating', label: 'Gates' },
    { id: 'watchtower', label: 'Watchtower' },
    { id: 'conditions', label: 'Conditions' },
    { id: 'plan-shipment', label: 'Plan Shipment' },
    { id: 'discord', label: 'Discord' },
    { id: 'marketplace', label: 'Marketplace' },
    { id: 'raffle', label: 'Raffle' },
    { id: 'vouchers', label: 'Vouchers' },
    { id: 'billing', label: 'Billing' },
  ],
  marketplace: [
    { id: 'browse', label: 'Browse' },
    { id: 'open-trades', label: 'My Trades' },
  ],
  discord: [],
}

interface TenantModule {
  state?: ModuleState
}

/** Resolve module sub-nav tabs for a route path (e.g. /admin -> admin tabs).
 * When tenant is provided and path is admin, marketplace/discord tabs shown when visible in Admin.
 * Prefer modules that have subnav (slug and admin both use /admin; slug has no tabs). */
export function getModuleSubnavForPath(
  path: string,
  tenant?: { modules?: Record<string, TenantModule> } | null,
): ModuleSubnavTab[] | null {
  const moduleId = Object.entries(MODULE_NAV)
    .filter(([, entry]) => path === entry.path || path.startsWith(entry.path + '/'))
    .find(([id]) => MODULE_SUBNAV[id])?.[0]
  const tabs = (moduleId && MODULE_SUBNAV[moduleId]) ?? null
  if (!tabs || moduleId !== 'admin' || !tenant?.modules) return tabs
  const marketplaceVisible = isModuleVisibleInAdmin(getModuleState(tenant.modules.marketplace))
  const discordVisible = isModuleVisibleInAdmin(getModuleState(tenant.modules.discord))
  const raffleVisible = isModuleVisibleInAdmin(getModuleState(tenant.modules.raffles))
  const gatesVisible = isModuleVisibleInAdmin(getModuleState(tenant.modules.gates))
  const watchtowerVisible = isModuleVisibleInAdmin(getModuleState(tenant.modules.watchtower))
  const shipmentVisible = isModuleVisibleInAdmin(getModuleState(tenant.modules.shipment))
  return tabs.filter((t) => {
    if (t.id === 'marketplace' && !marketplaceVisible) return false
    if (t.id === 'discord' && !discordVisible) return false
    if (t.id === 'raffle' && !raffleVisible) return false
    if (t.id === 'gates' && !gatesVisible) return false
    if (t.id === 'gating' && !gatesVisible) return false
    if ((t.id === 'watchtower' || t.id === 'conditions') && !watchtowerVisible) return false
    if (t.id === 'plan-shipment' && !shipmentVisible) return false
    return true
  })
}
