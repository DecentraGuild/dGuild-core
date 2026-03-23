import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requirePlatformAdmin } from '../../_shared/auth.ts'
import type { getAdminClient } from '../../_shared/supabase-admin.ts'

type Db = ReturnType<typeof getAdminClient>

export async function handleBundleCreate(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const bundleId = (body.bundleId as string)?.trim()
  const label = (body.label as string)?.trim()
  const priceUsdc = typeof body.priceUsdc === 'number' ? body.priceUsdc : Number(body.priceUsdc)
  const productKey = (body.productKey as string)?.trim()
  const entitlements = body.entitlements as Array<{ meter_key: string; quantity: number; duration_days: number }>

  if (!bundleId || !label || !productKey) return errorResponse('bundleId, label, and productKey required', req)
  if (!Array.isArray(entitlements) || entitlements.length === 0) {
    return errorResponse('entitlements array with at least one item (meter_key, quantity, duration_days) required', req)
  }

  const { error: bundleErr } = await db.from('bundles').insert({
    id: bundleId, product_key: productKey, price_usdc: priceUsdc, label, version: 1, price_version: 1,
  })
  if (bundleErr) {
    if (bundleErr.code === '23505') return errorResponse('Bundle id already exists', req, 409)
    return errorResponse(bundleErr.message, req, 500)
  }

  const rows = entitlements.filter((e) => e.meter_key?.trim()).map((e) => ({
    bundle_id: bundleId,
    meter_key: (e.meter_key as string).trim(),
    quantity: typeof e.quantity === 'number' ? e.quantity : Number(e.quantity) || 1,
    duration_days: typeof e.duration_days === 'number' ? e.duration_days : Number(e.duration_days) || 30,
  }))
  if (rows.length === 0) {
    await db.from('bundles').delete().eq('id', bundleId)
    return errorResponse('No valid entitlements', req)
  }

  const { error: entsErr } = await db.from('bundle_entitlements').insert(rows)
  if (entsErr) {
    await db.from('bundles').delete().eq('id', bundleId)
    return errorResponse(entsErr.message, req, 500)
  }

  await db.from('platform_audit_log').insert({
    actor_wallet: check.wallet,
    action: 'bundle_created',
    target_type: 'bundle',
    target_id: bundleId,
    details: { label, productKey, entitlementsCount: rows.length },
  })

  return jsonResponse({ ok: true, bundleId }, req)
}

export async function handleBundleGet(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const bundleId = (body.bundleId as string)?.trim()
  if (!bundleId) return errorResponse('bundleId required', req)

  const { data: bundle, error: bundleErr } = await db.from('bundles').select('id, label, product_key, price_usdc').eq('id', bundleId).single()
  if (bundleErr || !bundle) return errorResponse('Bundle not found', req, 404)

  const { data: entitlements, error: entsErr } = await db.from('bundle_entitlements').select('meter_key, quantity, duration_days').eq('bundle_id', bundleId)
  if (entsErr) return errorResponse(entsErr.message, req, 500)

  return jsonResponse({
    bundle: {
      id: (bundle as { id: string }).id,
      label: (bundle as { label: string }).label,
      product_key: (bundle as { product_key: string }).product_key,
      price_usdc: Number((bundle as { price_usdc: number }).price_usdc),
    },
    entitlements: (entitlements ?? []).map((e) => ({
      meter_key: (e as { meter_key: string }).meter_key,
      quantity: Number((e as { quantity: number }).quantity),
      duration_days: (e as { duration_days: number }).duration_days,
    })),
  }, req)
}

export async function handleBundleUpdate(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const bundleId = (body.bundleId as string)?.trim()
  if (!bundleId) return errorResponse('bundleId required', req)

  const label = (body.label as string)?.trim()
  const productKey = (body.productKey as string)?.trim()
  const priceUsdc = body.priceUsdc != null ? Number(body.priceUsdc) : undefined
  const entitlements = body.entitlements as Array<{ meter_key: string; quantity: number; duration_days: number }> | undefined

  const updates: Record<string, unknown> = {}
  if (label !== undefined) updates.label = label
  if (productKey !== undefined) updates.product_key = productKey
  if (priceUsdc !== undefined) updates.price_usdc = priceUsdc

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await db.from('bundles').update(updates).eq('id', bundleId)
    if (updateErr) return errorResponse(updateErr.message, req, 500)
  }

  if (Array.isArray(entitlements)) {
    const { error: delErr } = await db.from('bundle_entitlements').delete().eq('bundle_id', bundleId)
    if (delErr) return errorResponse(delErr.message, req, 500)

    if (entitlements.length > 0) {
      const rows = entitlements.filter((e) => e.meter_key?.trim()).map((e) => ({
        bundle_id: bundleId,
        meter_key: (e.meter_key as string).trim(),
        quantity: typeof e.quantity === 'number' ? e.quantity : Number(e.quantity) || 1,
        duration_days: typeof e.duration_days === 'number' ? e.duration_days : Number(e.duration_days) || 30,
      }))
      if (rows.length > 0) {
        const { error: insErr } = await db.from('bundle_entitlements').insert(rows)
        if (insErr) return errorResponse(insErr.message, req, 500)
      }
    }
  }

  await db.from('platform_audit_log').insert({
    actor_wallet: check.wallet,
    action: 'bundle_updated',
    target_type: 'bundle',
    target_id: bundleId,
    details: { label, productKey, entitlementsCount: Array.isArray(entitlements) ? entitlements.filter((e) => e.meter_key?.trim()).length : undefined },
  })

  return jsonResponse({ ok: true, bundleId }, req)
}

export async function handleBundlesList(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const { data: bundles, error } = await db.from('bundles').select('id, label, product_key').order('id')
  if (error) return errorResponse(error.message, req, 500)
  return jsonResponse({ bundles: bundles ?? [] }, req)
}
