/**
 * confirm(): Verify payment, grant entitlements from quote line items.
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
}

interface QuoteRow {
  line_items: QuoteLineItem[]
}

interface BundleEntitlementRow {
  meter_key: string
  quantity: number
  duration_days: number
}

export async function confirm(
  params: ConfirmParams,
  db: DbClient,
  paymentProvider: PaymentProvider,
): Promise<{ success: boolean }> {
  const { paymentId, txSignature } = params

  const { data: payment, error: payErr } = await db
    .from('billing_payments')
    .select('id, tenant_id, quote_id, amount_usdc, memo, status, tx_signature')
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
          await db.from('granted_entitlements').insert({
            tenant_id: tenantId,
            meter_key: ent.meter_key,
            quantity: ent.quantity,
            expires_at: expiresAt,
            payment_id: paymentId,
            bundle_id: item.bundleId,
          })
        }
      }
    } else if (item.source === 'tier') {
      const expiresAt =
        item.duration_days === 0
          ? null
          : new Date(Date.now() + item.duration_days * 24 * 60 * 60 * 1000).toISOString()
      await db.from('granted_entitlements').insert({
        tenant_id: tenantId,
        meter_key: item.meter_key,
        quantity: item.quantity,
        expires_at: expiresAt,
        payment_id: paymentId,
        bundle_id: null,
      })
    }
  }

  await db
    .from('billing_payments')
    .update({ status: 'confirmed', tx_signature: txSignature, confirmed_at: now })
    .eq('id', paymentId)

  return { success: true }
}
