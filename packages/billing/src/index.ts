/**
 * Pricing Engine v2. Server authority: quote → charge → confirm.
 */
import { registerAllAdapters } from './adapters/index.js'

export type {
  QuoteLineItem,
  QuoteResult,
  QuoteParams,
  ChargeResult,
  ChargeParams,
  ConfirmParams,
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
export { getProductDisplayType, getProductUnitLabel, getRafflesTiers, RAFFLES_TIERS, type ProductDisplayType } from './product-display.js'
export { resolveQuote } from './engine/quote.js'
export { charge } from './engine/charge.js'
export { confirm } from './engine/confirm.js'
export { createUSDCTransferProvider } from './payments/usdc-provider.js'
export { MODULE_TO_PRODUCT, CONDITION_TO_METER, toMeterOverrides } from './module-product-map.js'

registerAllAdapters()
