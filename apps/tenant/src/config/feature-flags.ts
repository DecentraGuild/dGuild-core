/**
 * Central feature flags per module.
 * Global on/off for a feature. Per-tenant lifecycle (e.g. "create disabled when module is deactivating")
 * is NOT controlled here: that comes from tenant context (module state from API). See e.g. market page
 * createDisabled = !FEATURES.marketplace.createTrade || marketplaceDeactivating.
 */

export const FEATURES = {
  marketplace: {
    /** When true, create trade is available for dGuilds whose marketplace module is active. When module is deactivating (after paid period), create is disabled regardless. */
    createTrade: true,
    shopFees: false,
  },
} as const

export type FeatureFlags = typeof FEATURES
