/**
 * Pricing Engine v2. Server authority: quote → charge → confirm.
 */
import { registerAllAdapters } from './adapters/index.js'

export type {
  QuotedMeterTierInfo,
  QuoteLineItem,
  QuoteResult,
  QuoteParams,
  ChargeResult,
  ChargeParams,
  ConfirmParams,
  OnboardingOrgPayload,
  PaymentProvider,
  PaymentIntent,
  PricingAdapter,
  MeterDefinition,
  DbClient,
} from './types.js'

export type {
  BillingPeriod,
  ConditionSet,
  PriceResult,
  TierDefinition,
  TieredAddonsPricing,
  TieredWithOneTimePerUnitPricing,
} from './legacy-types.js'

import type { TieredAddonsPricing, TieredWithOneTimePerUnitPricing } from './legacy-types.js'
export type PricingModel = TieredAddonsPricing | TieredWithOneTimePerUnitPricing

export { adapterRegistry, getAdapter, registerAdapter, registerAllAdapters } from './adapters/index.js'
export { getProductDisplayType, getProductUnitLabel, type ProductDisplayType } from './product-display.js'
export { resolveQuote } from './engine/quote.js'
export { charge } from './engine/charge.js'
export { confirm } from './engine/confirm.js'
export { createUSDCTransferProvider } from './payments/usdc-provider.js'
export { createVoucherTransferProvider } from './payments/voucher-provider.js'
export {
  MODULE_TO_PRODUCT,
  CONDITION_TO_METER,
  METER_TO_CONDITION_KEYS,
  MODULE_TENANT_METER_LIMIT_KEY,
  toMeterOverrides,
  valueFromConditionSetForMeter,
  numberFromConditionSetForMeter,
  tenantMeterLimitKeyForModule,
} from './module-product-map.js'
export { USAGE_DISPLAY_SKIP_METERS, USAGE_METER_LABELS, usageMeterLabel } from './pricing-usage-display.js'
export { primaryQuotedMeterKey, tierDefinitionFromQuotedMeter } from './quoted-tier-display.js'

registerAllAdapters()
