/**
 * Tenant and theme types for DecentraGuild.
 * Aligned with C2C example-theme.json and skull-bones.json structure.
 */

/** Lifecycle state for a module. */
export type ModuleState = 'off' | 'staging' | 'active' | 'deactivating'

/** Per-module entry: state, optional dates for auto transition, optional settings. */
export interface TenantModuleEntry {
  state: ModuleState
  /** ISO datetime: when to transition active -> deactivating. Set by admin or Deploy (e.g. for testing). */
  deactivatedate?: string | null
  /** ISO datetime: when to transition deactivating -> off. Set by cron when entering deactivating. */
  deactivatingUntil?: string | null
  settingsjson?: Record<string, unknown>
}

/** Modules keyed by module id. */
export type TenantModulesMap = Record<string, TenantModuleEntry>

const VALID_STATES: ModuleState[] = ['off', 'staging', 'active', 'deactivating']

function toState(value: unknown): ModuleState {
  if (typeof value === 'string' && VALID_STATES.includes(value as ModuleState)) return value as ModuleState
  return 'off'
}

/** Normalize raw modules to TenantModulesMap. Accepts object keyed by id or a legacy array. Default state 'off'. */
export function normalizeModules(
  raw:
    | TenantModulesMap
    | Array<{ id: string; enabled?: boolean; state?: ModuleState }>
    | Record<string, { state?: ModuleState; active?: boolean; deactivatedate?: string | null; deactivatingUntil?: string | null; settingsjson?: Record<string, unknown> }>
    | null
    | undefined
): TenantModulesMap {
  if (raw == null) return {}
  if (Array.isArray(raw)) {
    const map: TenantModulesMap = {}
    for (const m of raw) {
      const state = m.state ?? ((m as { enabled?: boolean }).enabled !== false ? 'active' : 'off')
      map[m.id] = {
        state: toState(state),
        deactivatedate: null,
        deactivatingUntil: null,
        settingsjson: {},
      }
    }
    return map
  }
  const obj = raw as Record<string, unknown>
  const result: TenantModulesMap = {}
  for (const id of Object.keys(obj)) {
    const entry = obj[id] as Record<string, unknown> | undefined
    if (!entry || typeof entry !== 'object') continue
    const legacyActive = entry.active === true
    const state = toState(entry.state ?? (legacyActive ? 'active' : 'off'))
    result[id] = {
      state,
      deactivatedate: typeof entry.deactivatedate === 'string' ? entry.deactivatedate : null,
      deactivatingUntil: typeof entry.deactivatingUntil === 'string' ? entry.deactivatingUntil : null,
      settingsjson: (entry.settingsjson as Record<string, unknown>) ?? {},
    }
  }
  return result
}

/** True if members see the module in nav and can use it (active or deactivating). */
export function isModuleVisibleToMembers(state: ModuleState): boolean {
  return state === 'active' || state === 'deactivating'
}

/** True if admin sees the module in Admin (staging, active, or deactivating). */
export function isModuleVisibleInAdmin(state: ModuleState): boolean {
  return state === 'staging' || state === 'active' || state === 'deactivating'
}

/** Get module state from entry; default 'off'. */
export function getModuleState(entry: TenantModuleEntry | undefined): ModuleState {
  return entry?.state ? toState(entry.state) : 'off'
}

export interface TenantThemeColors {
  primary?: { main: string; hover?: string; light?: string; dark?: string }
  /** Second brand colour (gradients, outline actions); not the elevated surface. */
  secondary?: { main: string; hover?: string; light?: string; dark?: string }
  background?: { primary?: string; secondary?: string; card?: string; muted?: string; backdrop?: string }
  text?: { primary?: string; secondary?: string; muted?: string }
  border?: { default?: string; light?: string }
  status?: { success?: string; error?: string; warning?: string; destructive?: string }
  trade?: {
    buy?: string
    buyHover?: string
    buyLight?: string
    sell?: string
    sellHover?: string
    sellLight?: string
    trade?: string
    tradeHover?: string
    tradeLight?: string
  }
}

export interface TenantThemeEffects {
  /** Background pattern overlay. Default: 'none'. */
  pattern?: 'none' | 'dots' | 'grid'
  /**
   * Pattern tile size in pixels. Dots: dot spacing. Grid: cell size. Noise: grain pitch.
   * Reasonable range: 4–64. Default: 24.
   */
  patternSize?: number
  /** Intensity of glow on interactive elements. Default: 'subtle'. */
  glowIntensity?: 'none' | 'subtle' | 'medium' | 'strong'
}

export interface TenantTheme {
  colors?: TenantThemeColors
  fontSize?: Record<string, string>
  spacing?: Record<string, string>
  borderRadius?: Record<string, string>
  borderWidth?: Record<string, string>
  shadows?: Record<string, string>
  gradients?: Record<string, string>
  fonts?: {
    primary?: string[]
    mono?: string[]
  }
  effects?: TenantThemeEffects
}

export interface TenantBranding {
  logo?: string
  name?: string
  shortName?: string
  theme?: TenantTheme
  themeRef?: string
}

export interface TenantConfig {
  id: string
  /** Custom subdomain slug. Optional for new orgs; paid add-on claimable from Admin General. */
  slug?: string | null
  name: string
  description?: string
  /** Short greeting shown on the tenant home banner. General setting, editable in Admin > General. */
  welcomeMessage?: string
  /** Discord server invite link (for users to join the community). General setting, editable in Admin > General. */
  discordServerInviteLink?: string
  /** Homepage URL. General setting, editable in Admin > General. */
  homepage?: string
  /** X (Twitter) account URL. General setting, editable in Admin > General. */
  xLink?: string
  /** Telegram channel/group URL. General setting, editable in Admin > General. */
  telegramLink?: string
  /** Default gate for the tenant. When set, becomes base for transactions unless module/transaction overrides. 'admin-only' = admins only; null = public; object = specific list. */
  defaultGate?: MarketplaceGateSettings | null | 'admin-only'
  branding: TenantBranding
  /** Modules keyed by id. Use normalizeModules() when reading from JSON that may be a legacy array. */
  modules: TenantModulesMap
  admins: string[]
  treasury?: string
  /** Custom domain (e.g. www.skull.com). Reserved for future use. */
  customDomain?: string | null
  createdAt?: string
  updatedAt?: string
}

/** Ordered path segments for marketplace browse tree (unbounded depth). Shared by API and tenant app. */
export type MarketplaceGroupPath = string[]

export interface MarketplaceCollectionMint {
  mint: string
  name?: string
  image?: string
  sellerFeeBasisPoints?: number
  groupPath?: MarketplaceGroupPath
  /** Guild storefront fee (basis points). Persisted on tenant_mint_catalog; settlement not yet wired. */
  storeBps?: number | null
}

export interface MarketplaceCurrencyMint {
  mint: string
  name: string
  symbol: string
  image?: string
  decimals?: number
  sellerFeeBasisPoints?: number
  groupPath?: MarketplaceGroupPath
  storeBps?: number | null
}

export interface MarketplaceSplAsset {
  mint: string
  name?: string
  symbol?: string
  image?: string
  decimals?: number
  sellerFeeBasisPoints?: number
  groupPath?: MarketplaceGroupPath
  storeBps?: number | null
}

/** Gate (access list) settings: programId + account address. Alias: MarketplaceWhitelistSettings for backward compat. */
export interface MarketplaceGateSettings {
  programId: string
  account: string
}

export interface MarketplaceShopFee {
  wallet: string
  makerFlatFee: number
  takerFlatFee: number
  makerPercentFee: number
  takerPercentFee: number
}

/** Marketplace settings shape shared by API and tenant app. API extends with tenantSlug/tenantId. */
export interface MarketplaceSettings {
  collectionMints: MarketplaceCollectionMint[]
  splAssetMints?: MarketplaceSplAsset[]
  currencyMints: MarketplaceCurrencyMint[]
  /** undefined = use dGuild default, null = public (no list), object = specific list */
  gate?: MarketplaceGateSettings | null
  /** @deprecated Use gate */
  whitelist?: MarketplaceGateSettings | null
  shopFee: MarketplaceShopFee
}

/** Effective gate result: list, public (null), or admin-only. */
export type EffectiveGateResult = MarketplaceGateSettings | null | 'admin-only'

/**
 * Effective gate for a module. Four-way:
 * - moduleGate === 'admin-only' → returns 'admin-only'
 * - moduleGate === null | 'public' → Public (no list), returns null
 * - moduleGate === undefined (or 'use-default') → follow dGuild setting, returns tenantDefault or null or 'admin-only'
 * - moduleGate === { programId, account } → use that list (or null if account is empty)
 */
export function getEffectiveGate(
  tenantDefault: MarketplaceGateSettings | null | 'admin-only' | undefined,
  moduleGate: MarketplaceGateSettings | null | 'admin-only' | 'use-default' | 'public' | undefined
): EffectiveGateResult {
  if (moduleGate === 'admin-only') return 'admin-only'
  if (moduleGate === null || moduleGate === 'public') return null
  if (moduleGate !== undefined && typeof moduleGate === 'object') {
    return moduleGate.account?.trim() ? moduleGate : null
  }
  if (tenantDefault === 'admin-only') return 'admin-only'
  if (tenantDefault !== undefined && tenantDefault !== null && tenantDefault.account?.trim()) {
    return tenantDefault
  }
  return null
}

/** Module id that stores gate in tenant.modules[].settingsjson. */
export type ModuleGateModuleId = 'gates' | 'marketplace' | 'raffles' | 'watchtower'

/** Stored gate value: list object, null (public), or sentinel string. */
export type StoredGateValue = MarketplaceGateSettings | null | 'use-default' | 'admin-only' | 'public'

/**
 * Read module gate setting from tenant (available at first fetch).
 * Gates: tenant.modules.gates.settingsjson.gate
 * Marketplace: tenant.modules.marketplace.settingsjson.gate
 * Raffles: tenant.modules.raffles.settingsjson.defaultGate
 * Watchtower: tenant.modules.watchtower.settingsjson.gate
 */
export function getModuleGateFromTenant(
  tenant: { modules?: TenantModulesMap } | null | undefined,
  moduleId: ModuleGateModuleId
): StoredGateValue | undefined {
  const entry = tenant?.modules?.[moduleId]
  const sj = entry?.settingsjson as Record<string, unknown> | undefined
  if (!sj) return undefined
  if (moduleId === 'gates' || moduleId === 'marketplace' || moduleId === 'watchtower') {
    const v = sj.gate
    if (v === 'admin-only') return 'admin-only'
    if (v === 'public') return 'public'
    return v as MarketplaceGateSettings | null | undefined
  }
  if (moduleId === 'raffles') {
    const v = sj.defaultGate
    if (v === 'use-default') return undefined
    if (v === 'admin-only') return 'admin-only'
    if (v === 'public') return 'public'
    return v as MarketplaceGateSettings | null | undefined
  }
  return undefined
}

/** Per-transaction gate override: use effective, public, or specific list. */
export type TransactionGateOverride = MarketplaceGateSettings | null | 'use-default'

/**
 * Resolve the final gate config for a transaction (escrow, raffle, etc.).
 * Given effective gate (from getEffectiveGate/useEffectiveGate) and per-transaction override.
 * Returns { programId, account } for the tx, or null for public.
 */
export function resolveGateForTransaction(
  effective: EffectiveGateResult,
  formOverride: TransactionGateOverride
): MarketplaceGateSettings | null {
  if (effective && typeof effective === 'object' && effective.account?.trim()) {
    return { programId: effective.programId ?? '', account: effective.account }
  }
  if (formOverride === 'use-default' && effective && typeof effective === 'object') {
    return effective.account?.trim()
      ? { programId: effective.programId ?? '', account: effective.account }
      : null
  }
  if (formOverride && typeof formOverride === 'object' && formOverride.account?.trim()) {
    return formOverride
  }
  return null
}

