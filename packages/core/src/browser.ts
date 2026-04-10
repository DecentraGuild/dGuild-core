/** Browser-safe exports: types + resolver + API helpers. No Node.js APIs. */
export type {
  TenantConfig,
  TenantTheme,
  TenantThemeColors,
  TenantBranding,
  TenantModuleEntry,
  TenantModulesMap,
  ModuleState,
  ModuleGateModuleId,
  MarketplaceGateSettings,
  TransactionGateOverride,
  ProfileFieldKey,
  ProfileFieldConfig,
} from './types.js'
export {
  isModuleVisibleToMembers,
  isModuleVisibleInAdmin,
  getModuleState,
  getEffectiveGate,
  getModuleGateFromTenant,
  resolveGateForTransaction,
  PROFILE_FIELD_KEYS,
  coerceProfileFieldValue,
  normalizeProfileFieldConfig,
} from './types.js'
export { getTenantSlugFromHost } from './resolver.js'
export {
  BASE_CURRENCY_MINTS,
  BASE_CURRENCY_MINT_ADDRESSES,
  isBaseCurrencyMint,
} from './currencies.js'
export { ADDRESS_BOOK_DEFAULT_MINTS } from './address-book-defaults.js'
export { generateRandomNumericTenantId } from './tenant-id.js'
export {
  isMintSupportedByMarketplaceEscrow,
  type SplTokenProgramKind,
} from './marketplace-escrow-mint.js'
