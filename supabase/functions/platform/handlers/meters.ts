import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requirePlatformAdmin } from '../../_shared/auth.ts'
import type { getAdminClient } from '../../_shared/supabase-admin.ts'

type Db = ReturnType<typeof getAdminClient>

export async function handleMetersList(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const { data: meters, error } = await db.from('meters').select('meter_key, product_key, description').order('meter_key')
  if (error) return errorResponse(error.message, req, 500)
  return jsonResponse({ meters: meters ?? [] }, req)
}

export async function handleProductsList(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const { data: rows, error } = await db.from('meters').select('product_key')
  if (error) return errorResponse(error.message, req, 500)
  const seen = new Set<string>()
  const products: Array<{ product_key: string }> = []
  for (const r of rows ?? []) {
    const pk = (r as { product_key: string }).product_key
    if (pk && !seen.has(pk)) { seen.add(pk); products.push({ product_key: pk }) }
  }
  products.sort((a, b) => a.product_key.localeCompare(b.product_key))
  return jsonResponse({ products }, req)
}

export async function handleProductTierDefaults(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const productKey = (body.productKey as string)?.trim()
  if (!productKey) return errorResponse('productKey required', req)

  const { data: tiers, error } = await db
    .from('tier_rules')
    .select('meter_key, min_quantity')
    .eq('product_key', productKey)
    .order('meter_key')
    .order('min_quantity')
  if (error) return errorResponse(error.message, req, 500)

  const byMeter = new Map<string, { quantity: number; duration_days: number }>()
  for (const t of tiers ?? []) {
    const row = t as { meter_key: string; min_quantity: number }
    if (!byMeter.has(row.meter_key)) byMeter.set(row.meter_key, { quantity: row.min_quantity || 1, duration_days: 30 })
  }
  const entitlements = Array.from(byMeter.entries()).map(([meter_key, v]) => ({ meter_key, quantity: v.quantity, duration_days: v.duration_days }))
  return jsonResponse({ entitlements }, req)
}
