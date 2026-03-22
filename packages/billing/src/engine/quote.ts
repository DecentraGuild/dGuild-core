/**
 * Quote resolution: adapter → usage → tier_rules + duration_rules → lineItems.
 */
import type { DbClient } from '../types.js'
import type { QuoteLineItem, QuoteParams, QuoteResult } from '../types.js'
import { getAdapter } from '../adapters/registry.js'

const QUOTE_TTL_MINUTES = 60
const DURATION_WHITELIST = [0, 30, 90, 365] as const

interface TierRow {
  min_quantity: number
  max_quantity: number | null
  unit_price: number
  tier_price: number | null
  label: string | null
}

interface DurationRow {
  duration_days: number
  price_multiplier: number
}

interface BundleRow {
  id: string
  price_usdc: number
  version: number
  price_version: number
  label: string
}

function findTier(tiers: TierRow[], quantity: number): TierRow | null {
  let best: TierRow | null = null
  for (const t of tiers) {
    if (t.min_quantity <= quantity && (t.max_quantity == null || quantity <= t.max_quantity)) {
      if (!best || t.min_quantity > best.min_quantity) best = t
    }
  }
  return best
}

function displayPriceAtTarget(
  tiers: TierRow[],
  target: number,
  priceMultiplier: number,
  productKey: string,
  meterKey: string,
): number {
  if (target <= 0) return 0
  if (tiers.length === 0) {
    throw new Error(`No pricing tiers configured for ${productKey} / ${meterKey}`)
  }
  const tier = findTier(tiers, target)
  if (!tier) {
    throw new Error(`No pricing tier matches display quantity ${target} for ${productKey} / ${meterKey}`)
  }
  const hasTierPrice = tier.tier_price != null && Number(tier.tier_price) > 0
  if (hasTierPrice) {
    return Number(tier.tier_price) * priceMultiplier
  }
  return target * tier.unit_price * priceMultiplier
}

export async function resolveQuote(
  params: QuoteParams,
  db: DbClient,
): Promise<{ quote: QuoteResult; quoteId: string }> {
  const durationDays = params.durationDays ?? 30
  if (!DURATION_WHITELIST.includes(durationDays as (typeof DURATION_WHITELIST)[number])) {
    throw new Error(`Invalid duration_days: ${durationDays}. Must be one of ${DURATION_WHITELIST.join(', ')}`)
  }

  const lineItems: QuoteLineItem[] = []
  let priceUsdc = 0
  let recurringDisplayUsdc = 0
  const meters: Record<string, { used: number; limit: number }> = {}

  if (params.bundleId) {
    const { data: bundle } = await db
      .from('bundles')
      .select('id, price_usdc, version, price_version, label')
      .eq('id', params.bundleId)
      .maybeSingle()
    if (!bundle) throw new Error(`Bundle not found: ${params.bundleId}`)
    const b = bundle as BundleRow
    lineItems.push({
      source: 'bundle',
      bundleId: b.id,
      bundle_version: b.version,
      price_version: b.price_version,
      meter_key: b.id,
      quantity: 1,
      duration_days: 0,
      price_usdc: b.price_usdc,
      label: b.label,
    })
    priceUsdc += b.price_usdc
  }

  if (params.productKey) {
    const adapter = getAdapter(params.productKey)
    if (!adapter) throw new Error(`Unknown product: ${params.productKey}`)

    const usage = await adapter.resolveUsage({ tenantId: params.tenantId, db })
    const { data: limitsRows } = await db
      .from('tenant_meter_limits')
      .select('meter_key, quantity_total')
      .eq('tenant_id', params.tenantId)
    const limits = (limitsRows ?? []).reduce(
      (acc: Record<string, number>, r: { meter_key: string; quantity_total: number }) => {
        acc[r.meter_key] = Number(r.quantity_total)
        return acc
      },
      {},
    )

    const meterOverrides = params.meterOverrides ?? {}
    const meterKeys = [...new Set([...Object.keys(usage), ...Object.keys(meterOverrides)])]

    const { data: durationRows } = await db
      .from('duration_rules')
      .select('duration_days, price_multiplier')
      .eq('duration_days', durationDays)
    const durationRule = (durationRows as DurationRow[] | null)?.[0]
    if (!durationRule) throw new Error(`No duration rule for ${durationDays} days`)

    for (const meterKey of meterKeys) {
      const used = usage[meterKey] ?? 0
      const limit = limits[meterKey] ?? 0
      meters[meterKey] = { used, limit }

      const target = meterOverrides[meterKey] ?? Math.max(limit, used)
      const gap = Math.max(0, target - limit)

      const { data: tierRows } = await db
        .from('tier_rules')
        .select('min_quantity, max_quantity, unit_price, tier_price, label')
        .eq('product_key', params.productKey)
        .eq('meter_key', meterKey)
      const tiers = (tierRows ?? []) as TierRow[]

      if (target > 0) {
        recurringDisplayUsdc += displayPriceAtTarget(
          tiers,
          target,
          durationRule.price_multiplier,
          params.productKey,
          meterKey,
        )
      }

      if (gap <= 0) continue

      if (gap > 0 && tiers.length === 0) {
        throw new Error(`No pricing tiers configured for ${params.productKey} / ${meterKey}`)
      }
      const isFlatTier = tiers.some((t) => t.tier_price != null && Number(t.tier_price) > 0)
      const tierLookupQty = isFlatTier ? target : gap
      const tier = findTier(tiers, tierLookupQty)
      if (gap > 0 && !tier) {
        throw new Error(
          `No pricing tier matches quantity ${tierLookupQty} for ${params.productKey} / ${meterKey}`,
        )
      }
      if (!tier) continue

      const hasTierPrice = tier.tier_price != null && Number(tier.tier_price) > 0
      const itemPrice = hasTierPrice
        ? Number(tier.tier_price) * durationRule.price_multiplier
        : gap * tier.unit_price * durationRule.price_multiplier
      const grantQty = hasTierPrice && tier.max_quantity != null
        ? Number(tier.max_quantity)
        : gap
      lineItems.push({
        source: 'tier',
        meter_key: meterKey,
        quantity: grantQty,
        duration_days: durationDays,
        price_usdc: itemPrice,
        label: tier.label ?? undefined,
        unit_price: hasTierPrice ? undefined : tier.unit_price,
        price_multiplier: durationRule.price_multiplier,
      })
      priceUsdc += itemPrice
    }
  }

  const expiresAt = new Date(Date.now() + QUOTE_TTL_MINUTES * 60 * 1000).toISOString()
  const { data: inserted, error } = await db
    .from('billing_quotes')
    .insert({
      tenant_id: params.tenantId,
      line_items: lineItems,
      price_usdc: priceUsdc,
      meter_snapshot: meters,
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (error || !inserted) throw new Error(error?.message ?? 'Failed to create quote')
  const quoteId = (inserted as { id: string }).id

  return {
    quote: {
      quoteId,
      lineItems,
      priceUsdc,
      recurringDisplayUsdc,
      meters,
      expiresAt,
    },
    quoteId,
  }
}
