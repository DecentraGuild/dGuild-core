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
} from './types.js'
export {
  isModuleVisibleToMembers,
  isModuleVisibleInAdmin,
  getModuleState,
  getEffectiveGate,
  getModuleGateFromTenant,
  resolveGateForTransaction,
} from './types.js'
export { getTenantSlugFromHost } from './resolver.js'
export {
  BASE_CURRENCY_MINTS,
  BASE_CURRENCY_MINT_ADDRESSES,
  isBaseCurrencyMint,
} from './currencies.js'
export { ADDRESS_BOOK_DEFAULT_MINTS } from './address-book-defaults.js'
export { generateRandomNumericTenantId } from './tenant-id.js'
