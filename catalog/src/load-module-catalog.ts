import type { ModuleCatalogEntry, ModuleCatalogAddon, ModuleCatalogFile } from './module-catalog-types.js'

import dguild from '../module-catalog/dguild.json'
import admin from '../module-catalog/admin.json'
import marketplace from '../module-catalog/marketplace.json'
import discord from '../module-catalog/discord.json'
import gates from '../module-catalog/gates.json'
import raffles from '../module-catalog/raffles.json'
import watchtower from '../module-catalog/watchtower.json'
import shipment from '../module-catalog/shipment.json'
import crafter from '../module-catalog/crafter.json'

function flattenEntry(file: ModuleCatalogFile): ModuleCatalogEntry {
  const { module: m, catalog: c, docs, activationInstructions } = file
  return {
    id: m.id,
    status: m.status,
    name: m.name,
    gateLabel: m.gateLabel,
    icon: m.icon,
    image: m.image,
    shortDescription: c.shortDescription,
    longDescription: c.longDescription,
    keyInfo: c.keyInfo,
    userCostsInfo: c.userCostsInfo,
    routePath: m.routePath,
    order: m.order,
    pricing: null,
    addons: m.addons,
    activationInstructions,
    goActiveImmediately: m.goActiveImmediately,
    alwaysOn: m.alwaysOn,
    docsOnly: m.docsOnly,
    blockchain: m.programId ? { programId: m.programId } : undefined,
    docs,
  }
}

const rawFiles: ModuleCatalogFile[] = [
  dguild as ModuleCatalogFile,
  admin as ModuleCatalogFile,
  marketplace as ModuleCatalogFile,
  discord as ModuleCatalogFile,
  gates as ModuleCatalogFile,
  raffles as ModuleCatalogFile,
  watchtower as ModuleCatalogFile,
  shipment as ModuleCatalogFile,
  crafter as ModuleCatalogFile,
]

const entries: ModuleCatalogEntry[] = rawFiles.map(flattenEntry)

const catalog: Record<string, ModuleCatalogEntry> = Object.fromEntries(
  entries.map((entry) => [entry.id, entry]),
)

function addonToCatalogEntry(addon: ModuleCatalogAddon, parent: ModuleCatalogEntry): ModuleCatalogEntry {
  return {
    id: addon.id,
    status: parent.status,
    name: addon.name,
    icon: parent.icon,
    image: null,
    shortDescription: addon.shortDescription ?? addon.name,
    longDescription: addon.shortDescription ?? addon.name,
    keyInfo: [],
    routePath: parent.routePath,
    order: parent.order,
    pricing: addon.pricing,
    addons: undefined,
    docsOnly: undefined,
  }
}

/** All module catalog entries keyed by module id. Includes top-level modules only; addons resolved via getModuleCatalogEntry. */
export function getModuleCatalog(): Record<string, ModuleCatalogEntry> {
  return catalog
}

/** Single module catalog entry by id, or undefined if not found. Resolves addons (e.g. slug from admin). */
export function getModuleCatalogEntry(id: string): ModuleCatalogEntry | undefined {
  const direct = catalog[id]
  if (direct) return direct
  const adminEntry = catalog['admin'] as ModuleCatalogEntry & { addons?: Record<string, ModuleCatalogAddon> }
  const addon = adminEntry?.addons?.[id]
  if (addon) return addonToCatalogEntry(addon, adminEntry)
  return undefined
}

/** All catalog entries sorted by order. */
export function getModuleCatalogList(): ModuleCatalogEntry[] {
  return [...entries].sort((a, b) => a.order - b.order)
}

/** Addon module ids (e.g. slug from admin). Used by ops to include addons in subscription/module lists. */
export function getAddonModuleIds(): string[] {
  const adminEntry = catalog['admin'] as ModuleCatalogEntry & { addons?: Record<string, ModuleCatalogAddon> }
  const addons = adminEntry?.addons
  if (!addons || typeof addons !== 'object') return []
  return Object.keys(addons)
}

/** All catalog entries for ops: top-level modules plus addons (e.g. slug) as synthetic entries, sorted by order. */
export function getModuleCatalogListWithAddons(): ModuleCatalogEntry[] {
  const list = getModuleCatalogList()
  const adminEntry = catalog['admin'] as ModuleCatalogEntry & { addons?: Record<string, ModuleCatalogAddon> }
  const addons = adminEntry?.addons
  if (!addons || typeof addons !== 'object') return list
  const addonEntries = Object.values(addons).map((addon) => addonToCatalogEntry(addon, adminEntry))
  return [...list, ...addonEntries].sort((a, b) => a.order - b.order)
}

/** Billing period values accepted by the pricing engine and API. */
export const VALID_BILLING_PERIODS: ReadonlySet<string> = new Set(['monthly', 'yearly'])

/** Display name for a module (e.g. for invoices). Uses catalog name; falls back to module id. */
export function getModuleDisplayName(moduleId: string): string {
  const entry = getModuleCatalogEntry(moduleId)
  return entry?.name ?? moduleId
}

/** App-wide label for gate/whitelist (e.g. "Gate" or "Whitelist"). From gates catalog; default "Gate". */
export function getGateLabel(): string {
  const entry = getModuleCatalogEntry('gates')
  return (entry as { gateLabel?: string } | undefined)?.gateLabel ?? 'Gate'
}

/** Module ids that have per-module gate settings. Sorted by catalog order. */
const GATING_MODULE_IDS = ['gates', 'watchtower', 'raffles', 'marketplace'] as const

export type GatingScopeId = 'default' | (typeof GATING_MODULE_IDS)[number]

export interface GatingScope {
  id: GatingScopeId
  label: string
}

/** Ordered list of gate scopes: dGuild default first, then modules by catalog order. */
export function getGatingScopes(): GatingScope[] {
  const list = getModuleCatalogList()
  const byOrder = (a: string, b: string) => {
    const ea = list.find((m) => m.id === a)
    const eb = list.find((m) => m.id === b)
    return (ea?.order ?? 999) - (eb?.order ?? 999)
  }
  const sorted = [...GATING_MODULE_IDS].sort(byOrder)
  const result: GatingScope[] = [{ id: 'default', label: 'dGuild (default)' }]
  for (const id of sorted) {
    const entry = getModuleCatalogEntry(id)
    result.push({ id, label: entry?.name ?? id })
  }
  return result
}
