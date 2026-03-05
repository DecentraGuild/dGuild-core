import type { BillingPeriod, PriceResult } from '@decentraguild/billing'
import type { BillingSubscription } from '../db/billing.js'

const MS_PER_DAY = 86_400_000
const USDC_DECIMALS = 6

function roundUsdc(value: number): number {
  return Math.round(value * 10 ** USDC_DECIMALS) / 10 ** USDC_DECIMALS
}

/** Add calendar months. Yearly = 12 months, monthly = 1 month. Aligns with yearlyDiscountPercent (e.g. 25% = 3 months free). */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

function periodEndFromStart(start: Date, period: BillingPeriod): Date {
  const months = period === 'yearly' ? 12 : 1
  return addMonths(start, months)
}

/**
 * Resolve the USDC amount for the billing period from a PriceResult.
 * Yearly = recurringYearly (already discounted); monthly = recurringMonthly.
 * For one-time (e.g. add_unit), uses oneTimeTotal.
 */
function periodAmount(price: PriceResult, period: BillingPeriod): number {
  if (price.oneTimeTotal > 0) return price.oneTimeTotal
  return period === 'yearly' ? price.recurringYearly : price.recurringMonthly
}

export interface ChargeCalculation {
  amountUsdc: number
  paymentType: 'initial' | 'upgrade_prorate' | 'add_unit'
  periodStart: Date
  periodEnd: Date
  noPaymentRequired: boolean
  remainingDays?: number
}

/**
 * Calculate how much (if anything) to charge when a module is deployed or
 * its settings are saved with a new price.
 *
 * - No existing sub or expired: charge full price, period = from now (initial).
 * - Same or lower tier: no charge, keep current period.
 * - Upgrade (higher tier): credit = unused value of current period (prorate deduct),
 *   charge = (full new period price) - credit, period = full new period from now
 *   (e.g. pay for 1 year of grow → get 1 year from now, not just remainder of old period).
 * Extend (same tier, add time) is handled by calculateExtension; period is added on top of current end.
 */
export function calculateCharge(
  newPrice: PriceResult,
  billingPeriod: BillingPeriod,
  existing: BillingSubscription | null,
  now: Date = new Date(),
): ChargeCalculation {
  const newAmount = periodAmount(newPrice, billingPeriod)

  if (newPrice.oneTimeTotal > 0 && newPrice.recurringMonthly === 0 && newPrice.recurringYearly === 0) {
    const nowDate = now
    return {
      amountUsdc: roundUsdc(newAmount),
      paymentType: 'add_unit',
      periodStart: nowDate,
      periodEnd: periodEndFromStart(nowDate, billingPeriod),
      noPaymentRequired: newAmount <= 0,
    }
  }

  if (!existing || existing.periodEnd <= now) {
    const periodStart = now
    const periodEnd = periodEndFromStart(now, billingPeriod)
    return {
      amountUsdc: roundUsdc(newAmount),
      paymentType: 'initial',
      periodStart,
      periodEnd,
      noPaymentRequired: newAmount <= 0,
    }
  }

  const currentAmount = existing.recurringAmountUsdc
  if (newAmount <= currentAmount) {
    return {
      amountUsdc: 0,
      paymentType: 'upgrade_prorate',
      periodStart: existing.periodStart,
      periodEnd: existing.periodEnd,
      noPaymentRequired: true,
    }
  }

  const totalMs = existing.periodEnd.getTime() - existing.periodStart.getTime()
  const totalDays = Math.max(1, Math.ceil(totalMs / MS_PER_DAY))
  const remainingMs = existing.periodEnd.getTime() - now.getTime()
  const remainingDays = Math.max(1, Math.ceil(remainingMs / MS_PER_DAY))

  const credit = (currentAmount / totalDays) * remainingDays
  const charge = Math.max(0, newAmount - credit)

  return {
    amountUsdc: roundUsdc(charge),
    paymentType: 'upgrade_prorate',
    periodStart: now,
    periodEnd: periodEndFromStart(now, billingPeriod),
    noPaymentRequired: charge <= 0,
    remainingDays,
  }
}

export interface ExtensionCalculation {
  amountUsdc: number
  periodStart: Date
  periodEnd: Date
}

/**
 * Calculate the cost of extending a subscription by one full period.
 * The new period starts where the current one ends.
 */
export function calculateExtension(
  price: PriceResult,
  billingPeriod: BillingPeriod,
  existing: BillingSubscription,
): ExtensionCalculation {
  const amount = periodAmount(price, billingPeriod)
  const periodStart = existing.periodEnd
  const periodEnd = periodEndFromStart(periodStart, billingPeriod)
  return {
    amountUsdc: roundUsdc(amount),
    periodStart,
    periodEnd,
  }
}
