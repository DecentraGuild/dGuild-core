/**
 * Pricing Engine v2 types.
 * Server authority: quote → charge → confirm.
 */

export interface MeterDefinition {
  meterKey: string
  unit?: string
}

export interface PricingAdapter {
  productKey: string
  resolveUsage(ctx: { tenantId: string; db: DbClient }): Promise<Record<string, number>>
  getMeterDefinitions?(): MeterDefinition[]
}

/** DB client for adapters. Use SupabaseClient from @supabase/supabase-js. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = any

export interface QuoteLineItem {
  source: 'bundle' | 'tier'
  bundleId?: string
  bundle_version?: number
  price_version?: number
  meter_key: string
  quantity: number
  duration_days: number
  price_usdc: number
  label?: string
  unit_price?: number
  price_multiplier?: number
}

/** Tier row matching `target` quantity for a meter; from `tier_rules` + duration multiplier. */
export interface QuotedMeterTierInfo {
  label: string | null
  minQuantity: number
  maxQuantity: number | null
  /**
   * OTC for one marginal unit at this tier (after duration multiplier).
   * Zero when the tier uses flat `tier_price` (Grow/Pro style).
   */
  perMarginalUnitUsdc: number
}

export interface QuoteResult {
  quoteId: string
  lineItems: QuoteLineItem[]
  /** Amount due now (upgrade / new entitlement gaps only). */
  priceUsdc: number
  /**
   * Recurring component for admin display (flat `tier_price` rows, and quantity×`unit_price` for
   * classic metered products like watchtower). For `tiered_with_one_time`, only flat `tier_price`
   * counts — marginal `unit_price` is OTC only (`quotedMeterTiers.perMarginalUnitUsdc`).
   */
  recurringDisplayUsdc: number
  meters: Record<string, { used: number; limit: number }>
  /**
   * Per-meter tier match at quoted target (from `tier_rules`). UI must not hardcode tier prices.
   */
  quotedMeterTiers?: Record<string, QuotedMeterTierInfo>
  expiresAt: string
}

export interface ChargeResult {
  paymentId: string
  amountUsdc: number
  memo?: string
  recipientAta?: string
  voucherRecipientAta?: string
  expiresAt: string
}

export interface PaymentIntent {
  paymentId: string
  amountUsdc: number
  memo?: string
  recipientAta?: string
  voucherRecipientAta?: string
  expiresAt: string
}

export interface PaymentProvider {
  readonly id: 'usdc' | 'voucher'
  createIntent?(params: {
    amountUsdc: number
    tenantId: string
    bundleId?: string
    payerWallet?: string
    voucherMint?: string
  }): Promise<PaymentIntent>
  verify(params: {
    txSignature: string
    expectedAmountUsdc?: number
    expectedMemo?: string
    voucherMint?: string
  }): Promise<{ valid: boolean; error?: string }>
}

export interface QuoteParams {
  tenantId: string
  productKey?: string
  bundleId?: string
  meterOverrides?: Record<string, number>
  durationDays?: number
  extendScope?: 'all' | 'grant_ids' | 'soonest'
  grantIds?: string[]
  syncToLongest?: boolean
  syncAllModules?: boolean
}

export interface ChargeParams {
  quoteId: string
  paymentMethod: 'usdc' | 'voucher'
  voucherMint?: string
  payerWallet: string
}

export interface ConfirmParams {
  paymentId: string
  txSignature: string
}
