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

export interface QuoteResult {
  quoteId: string
  lineItems: QuoteLineItem[]
  /** Amount due now (upgrade / new entitlement gaps only). */
  priceUsdc: number
  /**
   * Full price for the quoted duration at current target quantities (paid + pending).
   * Use for admin “current monthly/yearly cost” when `priceUsdc` is zero but entitlements exist.
   */
  recurringDisplayUsdc: number
  meters: Record<string, { used: number; limit: number }>
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
