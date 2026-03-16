/**
 * Billing Edge Function. Pricing Engine v2: quote → charge → confirm.
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getWalletFromAuthHeader } from '../_shared/auth.ts'
import { verifyBillingPayment, BILLING_WALLET_ATA } from '../_shared/billing-verify.ts'
import {
  resolveQuote,
  charge,
  confirm,
  createUSDCTransferProvider,
} from '@decentraguild/billing'

const BILLING_ACTIONS_LEGACY = [
  'preview',
  'intent',
  'extend-intent',
  'raffle-intent',
  'crafter-intent',
  'register-intent',
  'register-confirm',
] as const

Deno.serve(async (req: Request) => {
  try {
    const preflight = handlePreflight(req)
    if (preflight) return preflight

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return errorResponse('Invalid JSON body', req)
    }

    const action = body.action as string
    const db = getAdminClient()

  if (BILLING_ACTIONS_LEGACY.includes(action as (typeof BILLING_ACTIONS_LEGACY)[number])) {
    return errorResponse('Legacy billing actions deprecated. Use quote, charge, confirm.', req, 410)
  }

  if (action === 'expire-stale') {
    const { error } = await db
      .from('billing_payments')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
    if (error) return errorResponse(error.message, req, 500)
    return jsonResponse({ ok: true }, req)
  }

  if (action === 'quote') {
    try {
      const tenantId = (body.tenantId as string)?.trim()
      if (!tenantId) return errorResponse('tenantId required', req)

      const { quote } = await resolveQuote(
        {
          tenantId,
          productKey: body.productKey as string | undefined,
          bundleId: body.bundleId as string | undefined,
          meterOverrides: body.meterOverrides as Record<string, number> | undefined,
          durationDays: body.durationDays as number | undefined,
        },
        db,
      )
      return jsonResponse(quote, req)
    } catch (e) {
      return errorResponse(e instanceof Error ? e.message : 'Quote failed', req, 400)
    }
  }

  if (action === 'charge') {
    try {
      const quoteId = (body.quoteId as string)?.trim()
      const payerWallet = (body.payerWallet as string)?.trim()
      if (!quoteId || !payerWallet) return errorResponse('quoteId and payerWallet required', req)

      const result = await charge(
        {
          quoteId,
          paymentMethod: (body.paymentMethod as 'usdc' | 'voucher') ?? 'usdc',
          voucherMint: body.voucherMint as string | undefined,
          payerWallet,
        },
        db,
      )
      return jsonResponse(
        {
          ...result,
          recipientAta: BILLING_WALLET_ATA.toBase58(),
        },
        req,
      )
    } catch (e) {
      return errorResponse(e instanceof Error ? e.message : 'Charge failed', req, 400)
    }
  }

  if (action === 'confirm') {
    try {
      const paymentId = (body.paymentId as string)?.trim()
      const txSignature = (body.txSignature as string)?.trim()
      const slugToClaim = (body.slugToClaim as string)?.trim()?.toLowerCase()
      if (!paymentId || !txSignature) return errorResponse('paymentId and txSignature required', req)

      const provider = createUSDCTransferProvider(verifyBillingPayment)
      const { success } = await confirm({ paymentId, txSignature }, db, provider)

      if (success && slugToClaim) {
        const { data: payment } = await db
          .from('billing_payments')
          .select('tenant_id')
          .eq('id', paymentId)
          .maybeSingle()
        const tenantId = (payment as { tenant_id: string } | null)?.tenant_id
        if (tenantId) {
          await db
            .from('tenant_config')
            .update({ slug: slugToClaim, updated_at: new Date().toISOString() })
            .eq('id', tenantId)
        }
      }

      return jsonResponse({ success }, req)
    } catch (e) {
      return errorResponse(e instanceof Error ? e.message : 'Confirm failed', req, 400)
    }
  }

  if (action === 'register-create') {
    const authHeader = req.headers.get('Authorization')
    const wallet = await getWalletFromAuthHeader(authHeader)
    if (!wallet) return errorResponse('Sign in required. Connect your wallet.', req, 401)

    const paymentId = (body.paymentId as string)?.trim()
    const name = (body.name as string)?.trim()
    const description = (body.description as string)?.trim() || null
    const logo = (body.logo as string)?.trim() || null
    const discordInviteLink = (body.discordInviteLink as string)?.trim() || null
    if (!paymentId || !name) return errorResponse('paymentId and name required', req)

    const { data: payment, error: payErr } = await db
      .from('billing_payments')
      .select('id, tenant_id, payer_wallet, status')
      .eq('id', paymentId)
      .maybeSingle()

    if (payErr || !payment) return errorResponse('Payment not found', req, 404)
    const p = payment as { tenant_id: string; payer_wallet: string; status: string }
    if (p.status !== 'confirmed') return errorResponse('Payment not confirmed', req, 400)
    if (p.payer_wallet?.toLowerCase() !== wallet.toLowerCase()) {
      return errorResponse('Payment was made by a different wallet', req, 403)
    }

    const { data: existing } = await db
      .from('tenant_config')
      .select('id')
      .eq('id', p.tenant_id)
      .maybeSingle()
    if (existing) return errorResponse('Tenant already exists', req, 409)

    const nowIso = new Date().toISOString()
    const branding = logo ? { logo } : {}
    const { error: insertErr } = await db.from('tenant_config').insert({
      id: p.tenant_id,
      slug: null,
      name,
      description,
      discord_server_invite_link: discordInviteLink,
      branding,
      modules: { admin: { state: 'active', deactivatedate: null, deactivatingUntil: null, settingsjson: {} } },
      admins: [wallet],
      updated_at: nowIso,
    })

    if (insertErr) return errorResponse(insertErr.message, req, 500)
    return jsonResponse({ success: true, tenantId: p.tenant_id }, req)
  }

  if (action === 'expire-entitlements') {
    const { data: pending, error } = await db
      .from('entitlement_expiry_queue')
      .select('id, tenant_id, meter_key, quantity')
      .lt('expires_at', new Date().toISOString())
      .eq('processed', false)
      .limit(100)

    if (error) return errorResponse(error.message, req, 500)
    const items = (pending ?? []) as Array<{ id: string; tenant_id: string; meter_key: string; quantity: number }>

    let processed = 0
    for (const item of items) {
      const { data: limit } = await db
        .from('tenant_meter_limits')
        .select('quantity_total')
        .eq('tenant_id', item.tenant_id)
        .eq('meter_key', item.meter_key)
        .maybeSingle()
      const current = limit ? Number((limit as { quantity_total: number }).quantity_total) : 0
      const next = Math.max(0, current - item.quantity)
      if (limit) {
        await db
          .from('tenant_meter_limits')
          .update({ quantity_total: next, updated_at: new Date().toISOString() })
          .eq('tenant_id', item.tenant_id)
          .eq('meter_key', item.meter_key)
      }
      await db
        .from('entitlement_expiry_queue')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', item.id)
      processed++
    }

    return jsonResponse({ processed }, req)
  }

  return errorResponse(`Unknown action: ${action}`, req, 400)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Billing function error:', e)
    return errorResponse(msg || 'Billing error', req, 500)
  }
})
