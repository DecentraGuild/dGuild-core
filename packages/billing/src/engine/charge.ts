/**
 * charge(): Create pending payment from quote.
 */
import type { DbClient } from '../types.js'
import type { ChargeParams, ChargeResult } from '../types.js'

interface QuoteRow {
  id: string
  tenant_id: string
  line_items: unknown[]
  price_usdc: number
  expires_at: string
}

export async function charge(params: ChargeParams, db: DbClient): Promise<ChargeResult> {
  const { quoteId, paymentMethod, payerWallet, voucherMint } = params

  const { data: quote, error: quoteError } = await db
    .from('billing_quotes')
    .select('id, tenant_id, line_items, price_usdc, expires_at')
    .eq('id', quoteId)
    .maybeSingle()

  if (quoteError || !quote) throw new Error('Quote not found')
  const q = quote as QuoteRow
  if (new Date(q.expires_at) < new Date()) throw new Error('Quote expired')

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const memo = `billing:${q.tenant_id}:${quoteId}`

  if (!payerWallet) throw new Error('payerWallet required for charge')

  const { data: payment, error: payError } = await db
    .from('billing_payments')
    .insert({
      tenant_id: q.tenant_id,
      amount_usdc: q.price_usdc,
      status: 'pending',
      memo,
      payer_wallet: payerWallet,
      expires_at: expiresAt,
      payment_method: paymentMethod,
      voucher_mint: voucherMint ?? null,
      quote_id: quoteId,
    })
    .select('id')
    .single()

  if (payError || !payment) throw new Error(payError?.message ?? 'Failed to create payment')
  const paymentId = (payment as { id: string }).id

  return {
    paymentId,
    amountUsdc: q.price_usdc,
    memo,
    expiresAt,
  }
}
