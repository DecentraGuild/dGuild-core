/**
 * Bounded USDC reconciliation: match chain transfers to pending billing_payments by memo.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Connection } from 'npm:@solana/web3.js@1'
import {
  BILLING_WALLET_ATA,
  extractBillingMemoFromParsedTransaction,
} from './billing-verify.ts'
import { runBillingPostConfirm } from './billing-post-confirm.ts'
import type { PaymentProvider } from '@decentraguild/billing'
import { confirm } from '@decentraguild/billing'

export function parseTxSignatureFromWebhookBody(body: Record<string, unknown>): string | null {
  const top = body.txSignature ?? body.signature
  if (typeof top === 'string' && top.trim()) return top.trim()
  const tx = body.transaction as Record<string, unknown> | undefined
  const sigs = tx?.signatures as unknown
  if (Array.isArray(sigs) && typeof sigs[0] === 'string') return sigs[0].trim()
  const ev = (body as { events?: Array<{ signature?: string }> }).events
  if (Array.isArray(ev) && typeof ev[0]?.signature === 'string') return ev[0].signature.trim()
  return null
}

const PENDING_MIN_AGE_MS = 2 * 60 * 1000
const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_PENDING_ROWS = 12
const MAX_SIGNATURES = 28
const MAX_GET_TX = 36

export async function reconcileSingleUsdcTx(params: {
  db: SupabaseClient
  connection: Connection
  txSignature: string
  createProvider: (paymentMethod: string, voucherMint: string | null) => PaymentProvider
}): Promise<{ ok: boolean; paymentId?: string; error?: string }> {
  const { db, connection, txSignature, createProvider } = params
  const tx = await connection.getParsedTransaction(txSignature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  })
  if (!tx || tx.meta?.err) return { ok: false, error: 'Transaction not found or failed' }

  const memo = extractBillingMemoFromParsedTransaction(tx)
  if (!memo) return { ok: false, error: 'No billing memo in transaction' }

  const { data: pay, error } = await db
    .from('billing_payments')
    .select('id, payment_method, voucher_mint')
    .eq('memo', memo)
    .eq('status', 'pending')
    .eq('payment_method', 'usdc')
    .maybeSingle()

  if (error || !pay) return { ok: false, error: 'No pending USDC payment for this memo' }

  const row = pay as { id: string; payment_method: string; voucher_mint: string | null }
  const provider = createProvider(row.payment_method, row.voucher_mint)

  await confirm({ paymentId: row.id, txSignature }, db, provider)
  await runBillingPostConfirm(db, row.id, txSignature)
  return { ok: true, paymentId: row.id }
}

export async function reconcileUsdcBatch(params: {
  db: SupabaseClient
  connection: Connection
  createProvider: (paymentMethod: string, voucherMint: string | null) => PaymentProvider
}): Promise<{ scanned: number; confirmed: number }> {
  const { db, connection, createProvider } = params
  const now = Date.now()
  const minCreated = new Date(now - PENDING_MAX_AGE_MS).toISOString()
  const maxCreated = new Date(now - PENDING_MIN_AGE_MS).toISOString()

  const { data: pendingRows } = await db
    .from('billing_payments')
    .select('id, memo')
    .eq('status', 'pending')
    .eq('payment_method', 'usdc')
    .gte('created_at', minCreated)
    .lte('created_at', maxCreated)
    .order('created_at', { ascending: true })
    .limit(MAX_PENDING_ROWS)

  const pending = (pendingRows ?? []) as Array<{ id: string; memo: string }>
  if (pending.length === 0) return { scanned: 0, confirmed: 0 }

  const memoToPaymentId = new Map(pending.map((p) => [p.memo, p.id]))
  const sigs = await connection.getSignaturesForAddress(BILLING_WALLET_ATA, {
    limit: MAX_SIGNATURES,
  })

  let getTxCalls = 0
  let confirmed = 0

  for (const s of sigs) {
    if (getTxCalls >= MAX_GET_TX) break
    if (memoToPaymentId.size === 0) break

    const tx = await connection.getParsedTransaction(s.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })
    getTxCalls++
    if (!tx || tx.meta?.err) continue

    const memo = extractBillingMemoFromParsedTransaction(tx)
    if (!memo) continue

    const paymentId = memoToPaymentId.get(memo)
    if (!paymentId) continue

    const { data: pay } = await db
      .from('billing_payments')
      .select('id, payment_method, voucher_mint, status')
      .eq('id', paymentId)
      .maybeSingle()

    const pr = pay as { id: string; payment_method: string; voucher_mint: string | null; status: string } | null
    if (!pr || pr.status !== 'pending') {
      memoToPaymentId.delete(memo)
      continue
    }

    try {
      const provider = createProvider(pr.payment_method, pr.voucher_mint)
      await confirm({ paymentId: pr.id, txSignature: s.signature }, db, provider)
      await runBillingPostConfirm(db, pr.id, s.signature)
      confirmed++
    } catch {
      /* wrong tx / verification; try next signature */
    }
    memoToPaymentId.delete(memo)
  }

  return { scanned: getTxCalls, confirmed }
}
