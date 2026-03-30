/**
 * Billing Edge Function. Pricing Engine v2: quote → charge → confirm.
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getWalletFromAuthHeader, isServiceRoleAuthorization, requireTenantAdmin } from '../_shared/auth.ts'
import { verifyBillingPayment, BILLING_WALLET_ATA } from '../_shared/billing-verify.ts'
import { getVoucherRecipientAta, verifyVoucherPayment } from '../_shared/voucher-verify.ts'
import {
  resolveQuote,
  charge,
  confirm,
  createUSDCTransferProvider,
  createVoucherTransferProvider,
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
    if (!isServiceRoleAuthorization(req)) {
      return errorResponse('Unauthorized', req, 401)
    }
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

  if (action === 'voucher-quote') {
    try {
      const tenantId = (body.tenantId as string)?.trim()
      const voucherMint = (body.voucherMint as string)?.trim()
      if (!tenantId || !voucherMint) return errorResponse('tenantId and voucherMint required', req)

      const { data: bundleVoucher } = await db
        .from('bundle_vouchers')
        .select('bundle_id, tokens_required, max_redemptions_per_tenant')
        .eq('token_mint', voucherMint)
        .maybeSingle()

      if (bundleVoucher) {
        const bv = bundleVoucher as { bundle_id: string; tokens_required: number; max_redemptions_per_tenant: number | null }
        if (bv.max_redemptions_per_tenant != null && bv.max_redemptions_per_tenant > 0) {
          const { data: total } = await db
            .from('tenant_voucher_redemption_totals')
            .select('count')
            .eq('tenant_id', tenantId)
            .eq('voucher_mint', voucherMint)
            .eq('bundle_id', bv.bundle_id)
            .maybeSingle()
          const count = total ? Number((total as { count: number }).count) : 0
          if (count >= bv.max_redemptions_per_tenant) {
            return errorResponse('Max redemptions reached for this voucher', req, 400)
          }
        }
        const { data: ents } = await db
          .from('bundle_entitlements')
          .select('meter_key, quantity, duration_days')
          .eq('bundle_id', bv.bundle_id)
        const entitlements = (ents ?? []) as Array<{ meter_key: string; quantity: number; duration_days: number }>
        const lineItems = entitlements.map((e) => ({
          source: 'bundle' as const,
          bundleId: bv.bundle_id,
          meter_key: e.meter_key,
          quantity: e.quantity,
          duration_days: e.duration_days,
          price_usdc: 0,
        }))
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
        const { data: inserted, error } = await db
          .from('billing_quotes')
          .insert({
            tenant_id: tenantId,
            line_items: lineItems,
            price_usdc: 0,
            meter_snapshot: {},
            expires_at: expiresAt,
          })
          .select('id')
          .single()
        if (error || !inserted) throw new Error(error?.message ?? 'Failed to create quote')
        const quoteId = (inserted as { id: string }).id
        const memo = `billing:${tenantId}:${quoteId}`
        const voucherRecipientAta = getVoucherRecipientAta(voucherMint)
        const voucherWallet = Deno.env.get('VOUCHER_WALLET') ?? '89s4gjt2STRy83XQrxmYrWRkQBH3CL228BRVs6Qbed2Q'
        return jsonResponse({
          quoteId,
          quote: { quoteId, lineItems, priceUsdc: 0, recurringDisplayUsdc: 0, meters: {}, expiresAt },
          memo,
          voucherRecipientAta,
          voucherWallet,
          tokensRequired: bv.tokens_required ?? 1,
        }, req)
      }

      const { data: indVoucher } = await db
        .from('individual_vouchers')
        .select('max_redemptions_per_tenant')
        .eq('mint', voucherMint)
        .maybeSingle()

      if (indVoucher) {
        const iv = indVoucher as { max_redemptions_per_tenant: number | null }
        if (iv.max_redemptions_per_tenant != null && iv.max_redemptions_per_tenant > 0) {
          const { data: total } = await db
            .from('individual_voucher_redemption_totals')
            .select('count')
            .eq('tenant_id', tenantId)
            .eq('voucher_mint', voucherMint)
            .maybeSingle()
          const count = total ? Number((total as { count: number }).count) : 0
          if (count >= iv.max_redemptions_per_tenant) {
            return errorResponse('Max redemptions reached for this voucher', req, 400)
          }
        }
        const { data: ents } = await db
          .from('individual_voucher_entitlements')
          .select('meter_key, quantity, duration_days')
          .eq('mint', voucherMint)
        const entitlements = (ents ?? []) as Array<{ meter_key: string; quantity: number; duration_days: number }>
        if (entitlements.length === 0) return errorResponse('Voucher has no entitlements', req, 400)
        const lineItems = entitlements.map((e) => ({
          source: 'tier' as const,
          meter_key: e.meter_key,
          quantity: e.quantity,
          duration_days: e.duration_days,
          price_usdc: 0,
        }))
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
        const { data: inserted, error } = await db
          .from('billing_quotes')
          .insert({
            tenant_id: tenantId,
            line_items: lineItems,
            price_usdc: 0,
            meter_snapshot: {},
            expires_at: expiresAt,
          })
          .select('id')
          .single()
        if (error || !inserted) throw new Error(error?.message ?? 'Failed to create quote')
        const quoteId = (inserted as { id: string }).id
        const memo = `billing:${tenantId}:${quoteId}`
        const voucherRecipientAta = getVoucherRecipientAta(voucherMint)
        const voucherWallet = Deno.env.get('VOUCHER_WALLET') ?? '89s4gjt2STRy83XQrxmYrWRkQBH3CL228BRVs6Qbed2Q'
        return jsonResponse({
          quoteId,
          quote: { quoteId, lineItems, priceUsdc: 0, recurringDisplayUsdc: 0, meters: {}, expiresAt },
          memo,
          voucherRecipientAta,
          voucherWallet,
          tokensRequired: 1,
        }, req)
      }

      return errorResponse('Voucher not found', req, 404)
    } catch (e) {
      return errorResponse(e instanceof Error ? e.message : 'Voucher quote failed', req, 400)
    }
  }

  if (action === 'list-voucher-mints') {
    try {
      const authHeader = req.headers.get('Authorization')
      const listTenantId = (body.tenantId as string)?.trim()
      if (!listTenantId) return errorResponse('tenantId required', req)
      const adminCheck = await requireTenantAdmin(authHeader, listTenantId, db, req)
      if (!adminCheck.ok) return adminCheck.response

      const { data: bundleMints } = await db
        .from('bundle_vouchers')
        .select('token_mint, bundle_id, tokens_required')
      const { data: indMints } = await db
        .from('individual_vouchers')
        .select('mint, label')
      const bundleList = (bundleMints ?? []) as Array<{ token_mint: string; bundle_id: string; tokens_required: number }>
      const indList = (indMints ?? []) as Array<{ mint: string; label: string | null }>

      const bundleIds = [...new Set(bundleList.map((b) => b.bundle_id).filter(Boolean))]
      const { data: bundleRows } = bundleIds.length > 0
        ? await db.from('bundles').select('id, label').in('id', bundleIds)
        : { data: [] as Array<{ id: string; label: string }> }
      const bundleLabelById = new Map((bundleRows ?? []).map((r) => [(r as { id: string }).id, ((r as { label: string }).label ?? '').trim()]))

      const allMintSet = new Set<string>()
      for (const b of bundleList) allMintSet.add(b.token_mint)
      for (const i of indList) allMintSet.add(i.mint)
      const allMints = [...allMintSet]
      const { data: metaRows } = allMints.length > 0
        ? await db.from('mint_metadata').select('mint, name').in('mint', allMints)
        : { data: [] as Array<{ mint: string; name: string | null }> }
      const metaNameByMint = new Map(
        (metaRows ?? []).map((r) => {
          const row = r as { mint: string; name: string | null }
          const n = (row.name ?? '').trim()
          return [row.mint, n || null] as const
        }),
      )

      function resolveVoucherLabel(
        mintAddr: string,
        kind: 'bundle' | 'individual',
        dbLabel: string | null | undefined,
        bundleId: string | undefined,
      ): string | null {
        const chainName = metaNameByMint.get(mintAddr) ?? null
        if (kind === 'individual') {
          const manual = (dbLabel ?? '').trim()
          return manual || chainName
        }
        const bl = bundleId ? bundleLabelById.get(bundleId) ?? null : null
        const bundleLbl = bl && bl.length > 0 ? bl : null
        return chainName || bundleLbl
      }

      const bundleEntitlements = new Map<string, Array<{ meter_key: string; quantity: number; duration_days: number }>>()
      for (const b of bundleList) {
        const { data: ents } = await db
          .from('bundle_entitlements')
          .select('meter_key, quantity, duration_days')
          .eq('bundle_id', b.bundle_id)
        bundleEntitlements.set(b.token_mint, (ents ?? []) as Array<{ meter_key: string; quantity: number; duration_days: number }>)
      }

      const indEntitlements = new Map<string, Array<{ meter_key: string; quantity: number; duration_days: number }>>()
      for (const i of indList) {
        const { data: ents } = await db
          .from('individual_voucher_entitlements')
          .select('meter_key, quantity, duration_days')
          .eq('mint', i.mint)
        indEntitlements.set(i.mint, (ents ?? []) as Array<{ meter_key: string; quantity: number; duration_days: number }>)
      }

      const vouchers = [
        ...bundleList.map((b) => ({
          mint: b.token_mint,
          type: 'bundle' as const,
          bundleId: b.bundle_id,
          label: resolveVoucherLabel(b.token_mint, 'bundle', null, b.bundle_id),
          tokensRequired: b.tokens_required ?? 1,
          entitlements: bundleEntitlements.get(b.token_mint) ?? [],
        })),
        ...indList.map((i) => ({
          mint: i.mint,
          type: 'individual' as const,
          label: resolveVoucherLabel(i.mint, 'individual', i.label, undefined),
          tokensRequired: 1,
          entitlements: indEntitlements.get(i.mint) ?? [],
        })),
      ]

      const nowIso = new Date().toISOString()
      const displayByMint = new Map<string, string>()
      for (const v of vouchers) {
        const display = (v.label ?? '').trim()
        if (display) displayByMint.set(v.mint, display)
      }
      const catalogMints = [...displayByMint.keys()]
      if (catalogMints.length > 0) {
        const { data: existingCat } = await db
          .from('tenant_mint_catalog')
          .select('mint, label')
          .eq('tenant_id', listTenantId)
          .in('mint', catalogMints)
        const existingLabelByMint = new Map(
          (existingCat ?? []).map((r) => {
            const row = r as { mint: string; label: string | null }
            return [row.mint, (row.label ?? '').trim()] as const
          }),
        )
        const inserts: Array<{ tenant_id: string; mint: string; kind: string; label: string; updated_at: string }> = []
        const updateMints = new Set<string>()
        for (const [mintAddr, display] of displayByMint) {
          const existingLbl = existingLabelByMint.get(mintAddr) ?? ''
          if (existingLbl.length > 0) continue
          if (existingLabelByMint.has(mintAddr)) updateMints.add(mintAddr)
          else inserts.push({ tenant_id: listTenantId, mint: mintAddr, kind: 'NFT', label: display, updated_at: nowIso })
        }
        if (inserts.length > 0) {
          await db.from('tenant_mint_catalog').insert(inserts)
        }
        for (const m of updateMints) {
          const display = displayByMint.get(m)
          if (!display) continue
          await db
            .from('tenant_mint_catalog')
            .update({ label: display, updated_at: nowIso })
            .eq('tenant_id', listTenantId)
            .eq('mint', m)
        }
      }

      return jsonResponse({ vouchers }, req)
    } catch (e) {
      return errorResponse(e instanceof Error ? e.message : 'List vouchers failed', req, 400)
    }
  }

  if (action === 'charge') {
    try {
      const quoteId = (body.quoteId as string)?.trim()
      const payerWallet = (body.payerWallet as string)?.trim()
      if (!quoteId || !payerWallet) return errorResponse('quoteId and payerWallet required', req)

      const paymentMethod = (body.paymentMethod as 'usdc' | 'voucher') ?? 'usdc'
      const voucherMint = (body.voucherMint as string)?.trim() || undefined

      const result = await charge(
        {
          quoteId,
          paymentMethod,
          voucherMint,
          payerWallet,
        },
        db,
      )

      const response: Record<string, unknown> = { ...result }
      if (paymentMethod === 'voucher' && voucherMint) {
        response.voucherRecipientAta = getVoucherRecipientAta(voucherMint)
      } else {
        response.recipientAta = BILLING_WALLET_ATA.toBase58()
      }
      return jsonResponse(response, req)
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
      if (slugToClaim && !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(slugToClaim)) {
        return errorResponse('Invalid slug: must be 1–63 characters, only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.', req, 400)
      }

      const { data: payment } = await db
        .from('billing_payments')
        .select('payment_method, voucher_mint')
        .eq('id', paymentId)
        .maybeSingle()

      const pm = payment as { payment_method?: string; voucher_mint?: string | null } | null
      const provider =
        pm?.payment_method === 'voucher' && pm?.voucher_mint
          ? createVoucherTransferProvider(verifyVoucherPayment, pm.voucher_mint)
          : createUSDCTransferProvider(verifyBillingPayment)

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
    if (!isServiceRoleAuthorization(req)) {
      return errorResponse('Unauthorized', req, 401)
    }
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
