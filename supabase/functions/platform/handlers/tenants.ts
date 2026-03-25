import { generateRandomNumericTenantId } from '../../../../packages/core/src/tenant-id.ts'
import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requirePlatformAdmin } from '../../_shared/auth.ts'
import type { getAdminClient } from '../../_shared/supabase-admin.ts'
import { getModuleCatalogEntry, canActivateModule } from '@decentraguild/catalog'

type Db = ReturnType<typeof getAdminClient>

export async function handleTenantsList(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const { data: tenants, error } = await db
    .from('tenant_config')
    .select('id, slug, name, description, modules, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) return errorResponse(error.message, req, 500)
  return jsonResponse({ tenants: tenants ?? [] }, req)
}

export async function handleTenantGet(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const tenantId = body.tenantId as string
  if (!tenantId) return errorResponse('tenantId required', req)

  const { data: tenant } = await db.from('tenant_config').select('*').eq('id', tenantId).maybeSingle()
  if (!tenant) return errorResponse('Tenant not found', req, 404)

  const { data: limitsRows } = await db
    .from('tenant_meter_limits')
    .select('meter_key, quantity_total, expires_at_max')
    .eq('tenant_id', tenantId)
  const { data: metersRows } = await db.from('meters').select('meter_key, product_key')
  const productByMeter = Object.fromEntries(
    (metersRows ?? []).map((m) => [(m as { meter_key: string }).meter_key, (m as { product_key: string }).product_key]),
  )
  const subsByModule: Record<string, { periodEnd: string; quantity: number }> = {}
  for (const r of limitsRows ?? []) {
    const row = r as { meter_key: string; quantity_total: number; expires_at_max: string | null }
    const product = productByMeter[row.meter_key] ?? row.meter_key
    const existing = subsByModule[product]
    const periodEnd = row.expires_at_max ?? ''
    if (!existing || (periodEnd && (!existing.periodEnd || periodEnd > existing.periodEnd))) {
      subsByModule[product] = { periodEnd, quantity: Number(row.quantity_total) }
    }
  }
  const meterLimits = (limitsRows ?? []).map((r) => ({
    meter_key: (r as { meter_key: string }).meter_key,
    quantity_total: Number((r as { quantity_total: number }).quantity_total),
    expires_at_max: (r as { expires_at_max: string | null }).expires_at_max,
  }))
  const subs = Object.entries(subsByModule).map(([module_id, v]) => ({
    module_id,
    billing_period: v.periodEnd ? 'Active' : '—',
    period_start: null,
    period_end: v.periodEnd || null,
    recurring_amount_usdc: 0,
  }))

  const { data: paymentsRaw } = await db
    .from('billing_payments')
    .select('id, tenant_id, amount_usdc, status, confirmed_at, tx_signature, quote_id')
    .eq('tenant_id', tenantId)
    .order('confirmed_at', { ascending: false })
    .limit(50)

  const payments: Array<{
    id: string
    tenantSlug: string
    moduleId: string
    amountUsdc: number
    status: string
    confirmedAt: string | null
    txSignature: string | null
  }> = []
  for (const p of paymentsRaw ?? []) {
    let moduleId = '—'
    if (p.quote_id) {
      const { data: quote } = await db
        .from('billing_quotes')
        .select('line_items')
        .eq('id', p.quote_id)
        .maybeSingle()
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
    payments.push({
      id: p.id,
      tenantSlug: (tenant as Record<string, unknown>).slug ?? tenantId,
      moduleId,
      amountUsdc: Number(p.amount_usdc),
      status: p.status,
      confirmedAt: p.confirmed_at,
      txSignature: p.tx_signature,
    })
  }

  const activeModules = Object.entries((tenant.modules as Record<string, unknown>) ?? {}).filter(
    ([, m]) => (m as Record<string, unknown>)?.state === 'active',
  ).length

  const { count: totalPayments } = await db
    .from('billing_payments')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'confirmed')

  const stats = {
    activeModules,
    totalPayments: totalPayments ?? 0,
    lastPaymentAt: payments[0]?.confirmedAt ?? null,
  }

  const { data: gates } = await db.from('gate_lists').select('address, name').eq('tenant_id', tenantId)
  const { data: raffles } = await db.from('tenant_raffles').select('raffle_pubkey, created_at, closed_at').eq('tenant_id', tenantId)
  const { data: crafterTokens } = await db
    .from('crafter_tokens')
    .select('mint, name, symbol, decimals, authority, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  return jsonResponse({
    tenant,
    subscriptions: subs ?? [],
    billing: { subscriptions: subs ?? [], payments, meterLimits },
    stats,
    gates: gates ?? [],
    raffles: raffles ?? [],
    crafterTokens: crafterTokens ?? [],
  }, req)
}

export async function handleTenantSlugCheck(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const slug = body.slug as string
  if (!slug) return errorResponse('slug required', req)

  const { data } = await db.from('tenant_config').select('id').eq('slug', slug).maybeSingle()
  return jsonResponse({ available: !data }, req)
}

export async function handleTenantAddAdmin(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const tenantId = body.tenantId as string
  const wallet = body.wallet as string
  if (!tenantId || !wallet?.trim()) return errorResponse('tenantId and wallet required', req)

  const { data: tenant } = await db.from('tenant_config').select('id, admins').eq('id', tenantId).maybeSingle()
  if (!tenant) return errorResponse('Tenant not found', req, 404)

  const admins = (tenant.admins as string[]) ?? []
  const walletTrimmed = wallet.trim()
  if (admins.includes(walletTrimmed)) return jsonResponse({ ok: true, message: 'Already admin' }, req)

  const updatedAdmins = [...admins, walletTrimmed]
  await db.from('tenant_config').update({ admins: updatedAdmins, updated_at: new Date().toISOString() }).eq('id', tenantId)

  await db.from('platform_audit_log').insert({
    actor_wallet: check.wallet,
    action: 'tenant_admin_added',
    target_type: 'tenant',
    target_id: tenantId,
    details: { added_wallet: walletTrimmed },
  })

  return jsonResponse({ ok: true, admins: updatedAdmins }, req)
}

export async function handleTenantCreate(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const tenantName = body.tenantName as string
  const creatorWallet = body.creatorWallet as string
  if (!tenantName?.trim() || !creatorWallet?.trim()) return errorResponse('tenantName and creatorWallet required', req)

  const walletTrimmed = creatorWallet.trim()
  const maxAttempts = 12
  let tenantId = ''
  let insertErr: { code?: string; message: string } | null = null
  for (let i = 0; i < maxAttempts; i++) {
    tenantId = generateRandomNumericTenantId()
    const { error } = await db.from('tenant_config').insert({
      id: tenantId,
      slug: null,
      name: tenantName.trim(),
      admins: [walletTrimmed],
      modules: { admin: { state: 'active', deactivatedate: null, deactivatingUntil: null, settingsjson: {} } },
    })
    if (!error) {
      insertErr = null
      break
    }
    insertErr = error
    if (error.code !== '23505') break
  }
  if (insertErr) return errorResponse(insertErr.message, req, 500)

  await db.from('platform_audit_log').insert({
    actor_wallet: check.wallet,
    action: 'tenant_created',
    target_type: 'tenant',
    target_id: tenantId,
    details: { tenantName: tenantName.trim(), creatorWallet: walletTrimmed },
  })

  const { data: t } = await db.from('tenant_config').select('*').eq('id', tenantId).maybeSingle()
  return jsonResponse({ success: true, tenant: t }, req)
}

export async function handleTenantSlugSet(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const tenantId = body.tenantId as string
  const slug = body.slug as string
  if (!tenantId || !slug) return errorResponse('tenantId and slug required', req)

  const { data: existing } = await db.from('tenant_config').select('id').eq('slug', slug).maybeSingle()
  if (existing && (existing as Record<string, unknown>).id !== tenantId) return errorResponse('Slug already taken', req, 409)

  await db.from('tenant_config').update({ slug }).eq('id', tenantId)

  await db.from('platform_audit_log').insert({
    actor_wallet: check.wallet,
    action: 'tenant_subdomain_updated',
    target_type: 'tenant',
    target_id: tenantId,
    details: { slug },
  })

  return jsonResponse({ ok: true }, req)
}

export async function handleTenantModule(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const tenantId = body.tenantId as string
  const moduleId = body.moduleId as string
  const state = body.state as string
  if (!tenantId || !moduleId || !state) return errorResponse('tenantId, moduleId, state required', req)

  const { data: tenant } = await db.from('tenant_config').select('id, modules').eq('id', tenantId).maybeSingle()
  if (!tenant) return errorResponse('Tenant not found', req, 404)

  const currentModules = (tenant.modules as Record<string, unknown>) ?? {}
  const existing = (currentModules[moduleId] as Record<string, unknown>) ?? {}
  const currentState = (existing.state as string | undefined) ?? 'off'

  const isNewActivation = currentState === 'off' && (state === 'active' || state === 'staging')
  if (isNewActivation) {
    const catalogEntry = getModuleCatalogEntry(moduleId)
    if (catalogEntry && !canActivateModule(catalogEntry.status, tenantId)) {
      return errorResponse(`Module "${moduleId}" cannot be activated: status is "${catalogEntry.status}"`, req, 403)
    }
  }

  const updatedModules = {
    ...currentModules,
    [moduleId]: {
      state,
      deactivatedate: existing.deactivatedate ?? null,
      deactivatingUntil: existing.deactivatingUntil ?? null,
      settingsjson: existing.settingsjson ?? {},
    },
  }

  await db.from('tenant_config').update({ modules: updatedModules, updated_at: new Date().toISOString() }).eq('id', (tenant as Record<string, unknown>).id)

  await db.from('platform_audit_log').insert({
    actor_wallet: check.wallet,
    action: 'module_state_changed',
    target_type: 'tenant_module',
    target_id: `${tenantId}/${moduleId}`,
    details: { state },
  })

  return jsonResponse({ ok: true }, req)
}
