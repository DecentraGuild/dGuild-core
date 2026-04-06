import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requirePlatformAdmin } from '../../_shared/auth.ts'
import type { getAdminClient } from '../../_shared/supabase-admin.ts'

type Db = ReturnType<typeof getAdminClient>

export async function handleBillingSummary(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const { data: paymentsRaw } = await db
    .from('billing_payments')
    .select('id, tenant_id, amount_usdc, status, confirmed_at, tx_signature, quote_id')
    .eq('status', 'confirmed')
    .order('confirmed_at', { ascending: false })
    .limit(50)

  const { data: tenants } = await db.from('tenant_config').select('id, slug')
  const slugByTenant = Object.fromEntries((tenants ?? []).map((t) => [t.id, t.slug ?? t.id]))

  const recentPayments: Array<{
    id: string
    tenantSlug: string
    moduleId: string
    amountUsdc: number
    confirmedAt: string | null
    txSignature: string | null
  }> = []

  for (const p of paymentsRaw ?? []) {
    let moduleId = '—'
    if (p.quote_id) {
      const { data: quote } = await db.from('billing_quotes').select('line_items').eq('id', p.quote_id).maybeSingle()
      const items = (quote?.line_items ?? []) as Array<{ meter_key?: string; bundleId?: string; source?: string }>
      const first = items[0]
      if (first?.source === 'bundle' && first.bundleId) {
        const { data: b } = await db.from('bundles').select('product_key').eq('id', first.bundleId).maybeSingle()
        if (b) moduleId = (b as { product_key: string }).product_key
      } else if (first?.meter_key) {
        const { data: m } = await db.from('meters').select('product_key').eq('meter_key', first.meter_key).maybeSingle()
        if (m) moduleId = (m as { product_key: string }).product_key
      }
    }
    recentPayments.push({
      id: p.id,
      tenantSlug: slugByTenant[p.tenant_id] ?? p.tenant_id,
      moduleId,
      amountUsdc: Number(p.amount_usdc),
      confirmedAt: p.confirmed_at,
      txSignature: p.tx_signature,
    })
  }

  return jsonResponse({ activeSubscriptions: 0, totalMrrUsdc: 0, recentPayments }, req)
}

export function handleBillingExtend(_body: Record<string, unknown>, _db: Db, _authHeader: string | null, req: Request): Promise<Response> {
  return Promise.resolve(errorResponse('Billing temporarily unavailable', req, 503))
}

export function handleBillingSetPeriodEnd(_body: Record<string, unknown>, _db: Db, _authHeader: string | null, req: Request): Promise<Response> {
  return Promise.resolve(errorResponse('Billing temporarily unavailable', req, 503))
}

function parseNonNegativeInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

/** Ops override: set watchtower meter capacities in tenant_meter_limits (no payment / Stripe). */
export async function handleBillingSetWatchtowerTracks(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const tenantId = body.tenantId as string
  if (!tenantId) return errorResponse('tenantId required', req, 400)

  const qCurrent = parseNonNegativeInt(body.mints_current)
  const qSnap = parseNonNegativeInt(body.mintsSnapshot)
  const qTx = parseNonNegativeInt(body.mintsTransactions)
  if (qCurrent === null || qSnap === null || qTx === null) {
    return errorResponse(
      'mints_current, mintsSnapshot, and mintsTransactions must be non-negative numbers',
      req,
      400,
    )
  }

  const { data: tenant, error: tenantErr } = await db
    .from('tenant_config')
    .select('id, modules')
    .eq('id', tenantId)
    .maybeSingle()
  if (tenantErr) return errorResponse(tenantErr.message, req, 500)
  if (!tenant) return errorResponse('Tenant not found', req, 404)

  const wtState = (tenant as { modules?: Record<string, { state?: string }> }).modules?.['watchtower']?.state
  if (wtState !== 'active' && wtState !== 'staging' && wtState !== 'deactivating') {
    return errorResponse('Watchtower is not enabled for this tenant', req, 400)
  }

  const now = new Date().toISOString()
  const pairs: Array<{ meter_key: string; quantity: number }> = [
    { meter_key: 'mints_current', quantity: qCurrent },
    { meter_key: 'mints_snapshot', quantity: qSnap },
    { meter_key: 'mints_transactions', quantity: qTx },
  ]

  for (const { meter_key, quantity } of pairs) {
    const { data: existing, error: selErr } = await db
      .from('tenant_meter_limits')
      .select('tenant_id')
      .eq('tenant_id', tenantId)
      .eq('meter_key', meter_key)
      .maybeSingle()
    if (selErr) return errorResponse(selErr.message, req, 500)

    if (existing) {
      const { error: upErr } = await db
        .from('tenant_meter_limits')
        .update({ quantity_total: quantity, updated_at: now })
        .eq('tenant_id', tenantId)
        .eq('meter_key', meter_key)
      if (upErr) return errorResponse(upErr.message, req, 500)
    } else if (quantity > 0) {
      const { error: insErr } = await db.from('tenant_meter_limits').insert({
        tenant_id: tenantId,
        meter_key,
        quantity_total: quantity,
        expires_at_max: null,
        updated_at: now,
      })
      if (insErr) return errorResponse(insErr.message, req, 500)
    }
  }

  const { error: auditErr } = await db.from('platform_audit_log').insert({
    actor_wallet: check.wallet,
    action: 'ops_set_watchtower_tracks',
    target_type: 'tenant',
    target_id: tenantId,
    details: {
      mints_current: qCurrent,
      mints_snapshot: qSnap,
      mints_transactions: qTx,
    },
  })
  if (auditErr) return errorResponse(auditErr.message, req, 500)

  return jsonResponse({ ok: true }, req)
}

export async function handleBillingConfirm(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const paymentId = body.paymentId as string
  if (!paymentId) return errorResponse('paymentId required', req)

  await db.from('billing_payments').update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', paymentId)

  await db.from('platform_audit_log').insert({
    actor_wallet: check.wallet,
    action: 'payment_manually_confirmed',
    target_type: 'billing_payment',
    target_id: paymentId,
    details: {},
  })

  return jsonResponse({ ok: true }, req)
}
