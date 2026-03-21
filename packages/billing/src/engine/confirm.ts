/**
 * confirm(): Verify payment, grant entitlements from quote line items.
 * Extend-or-add: if tenant already has active entitlements for a meter, extend expiry; else add.
 */
import type { DbClient } from '../types.js'
import type { ConfirmParams, QuoteLineItem } from '../types.js'
import type { PaymentProvider } from '../types.js'

interface PaymentRow {
  id: string
  tenant_id: string
  quote_id: string
  amount_usdc: number
  memo: string
  status: string
  tx_signature: string | null
  payment_method?: string
  voucher_mint?: string | null
}

interface QuoteRow {
  line_items: QuoteLineItem[]
}

interface BundleEntitlementRow {
  meter_key: string
  quantity: number
  duration_days: number
}

interface MeterLimitRow {
  quantity_total: number
  expires_at_max: string | null
}

interface GrantRow {
  id: string
  expires_at: string | null
}

async function grantOrExtend(
  db: DbClient,
  tenantId: string,
  paymentId: string,
  meterKey: string,
  quantity: number,
  durationDays: number,
  expiresAt: string | null,
  bundleId: string | null,
): Promise<void> {
  if (durationDays === 0 || expiresAt == null) {
    await db.from('granted_entitlements').insert({
      tenant_id: tenantId,
      meter_key: meterKey,
      quantity,
      expires_at: expiresAt,
      payment_id: paymentId,
      bundle_id: bundleId,
    })
    return
  }

  const { data: limit } = await db
    .from('tenant_meter_limits')
    .select('quantity_total, expires_at_max')
    .eq('tenant_id', tenantId)
    .eq('meter_key', meterKey)
    .maybeSingle()

  const lim = limit as MeterLimitRow | null
  const quantityTotal = lim ? Number(lim.quantity_total) : 0
  const expiresAtMax = lim?.expires_at_max ? new Date(lim.expires_at_max) : null
  const now = new Date()

  if (quantityTotal > 0 && quantity === quantityTotal && expiresAtMax != null && expiresAtMax > now) {
    const { data: grant } = await db
      .from('granted_entitlements')
      .select('id, expires_at')
      .eq('tenant_id', tenantId)
      .eq('meter_key', meterKey)
      .gt('expires_at', now.toISOString())
      .order('expires_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (grant) {
      const g = grant as GrantRow
      const currentExpires = g.expires_at ? new Date(g.expires_at) : null
      const newExpires = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
      const extended = currentExpires && currentExpires > newExpires ? currentExpires : newExpires

      await db
        .from('granted_entitlements')
        .update({ expires_at: extended.toISOString() })
        .eq('id', g.id)
      return
    }
  }

  await db.from('granted_entitlements').insert({
    tenant_id: tenantId,
    meter_key: meterKey,
    quantity,
    expires_at: expiresAt,
    payment_id: paymentId,
    bundle_id: bundleId,
  })
}

export async function confirm(
  params: ConfirmParams,
  db: DbClient,
  paymentProvider: PaymentProvider,
): Promise<{ success: boolean }> {
  const { paymentId, txSignature } = params

  const { data: payment, error: payErr } = await db
    .from('billing_payments')
    .select('id, tenant_id, quote_id, amount_usdc, memo, status, tx_signature, payment_method, voucher_mint')
    .eq('id', paymentId)
    .maybeSingle()

  if (payErr || !payment) throw new Error('Payment not found')
  const p = payment as PaymentRow
  if (p.status === 'confirmed') return { success: true }
  if (p.status !== 'pending') throw new Error(`Payment not pending: ${p.status}`)

  const { valid, error } = await paymentProvider.verify({
    txSignature,
    expectedAmountUsdc: p.amount_usdc,
    expectedMemo: p.memo,
  })
  if (!valid) throw new Error(error ?? 'Payment verification failed')

  const { data: quote, error: quoteErr } = await db
    .from('billing_quotes')
    .select('line_items')
    .eq('id', p.quote_id)
    .maybeSingle()

  if (quoteErr || !quote) throw new Error('Quote not found')
  const q = quote as QuoteRow
  const lineItems = (q.line_items ?? []) as QuoteLineItem[]

  const tenantId = p.tenant_id
  const now = new Date().toISOString()

  for (const item of lineItems) {
    if (item.source === 'bundle' && item.bundleId) {
      const { data: ents } = await db
        .from('bundle_entitlements')
        .select('meter_key, quantity, duration_days')
        .eq('bundle_id', item.bundleId)
      const entitlements = (ents ?? []) as BundleEntitlementRow[]
      for (let i = 0; i < (item.quantity ?? 1); i++) {
        for (const ent of entitlements) {
          const expiresAt =
            ent.duration_days === 0 ? null : new Date(Date.now() + ent.duration_days * 24 * 60 * 60 * 1000).toISOString()
          await grantOrExtend(
            db,
            tenantId,
            paymentId,
            ent.meter_key,
            ent.quantity,
            ent.duration_days,
            expiresAt,
            item.bundleId,
          )
        }
      }
    } else if (item.source === 'tier') {
      const durationDays = item.duration_days ?? 0
      const expiresAt =
        durationDays === 0
          ? null
          : new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
      await grantOrExtend(
        db,
        tenantId,
        paymentId,
        item.meter_key,
        item.quantity,
        durationDays,
        expiresAt,
        null,
      )
    }
  }

  if (p.payment_method === 'voucher' && p.voucher_mint) {
    const firstItem = lineItems[0]
    if (firstItem?.source === 'bundle' && firstItem.bundleId) {
      await db.from('voucher_redemptions').insert({
        tenant_id: tenantId,
        voucher_mint: p.voucher_mint,
        bundle_id: firstItem.bundleId,
        payment_id: paymentId,
        quantity: 1,
      })
      const { data: bundleTotal } = await db
        .from('tenant_voucher_redemption_totals')
        .select('count')
        .eq('tenant_id', tenantId)
        .eq('voucher_mint', p.voucher_mint)
        .eq('bundle_id', firstItem.bundleId)
        .maybeSingle()
      const nextCount = (bundleTotal ? Number((bundleTotal as { count: number }).count) : 0) + 1
      await db.from('tenant_voucher_redemption_totals').upsert(
        {
          tenant_id: tenantId,
          voucher_mint: p.voucher_mint,
          bundle_id: firstItem.bundleId,
          count: nextCount,
          updated_at: now,
        },
        { onConflict: 'tenant_id,voucher_mint,bundle_id' },
      )
    } else {
      await db.from('individual_voucher_redemptions').insert({
        tenant_id: tenantId,
        voucher_mint: p.voucher_mint,
        payment_id: paymentId,
        quantity: 1,
      })
      const { data: existing } = await db
        .from('individual_voucher_redemption_totals')
        .select('count')
        .eq('tenant_id', tenantId)
        .eq('voucher_mint', p.voucher_mint)
        .maybeSingle()
      const nextCount = (existing ? Number((existing as { count: number }).count) : 0) + 1
      await db.from('individual_voucher_redemption_totals').upsert(
        {
          tenant_id: tenantId,
          voucher_mint: p.voucher_mint,
          count: nextCount,
          updated_at: now,
        },
        { onConflict: 'tenant_id,voucher_mint' },
      )
    }
  }

  await db
    .from('billing_payments')
    .update({ status: 'confirmed', tx_signature: txSignature, confirmed_at: now })
    .eq('id', paymentId)

  return { success: true }
}
