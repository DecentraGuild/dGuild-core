/**
 * Platform Edge Function.
 * Handles platform-level admin operations. Platform owner from platform_owner table (same auth path as tenant admin).
 *
 * Actions:
 *   tenants-list     – List all tenants.
 *   tenant-get       – Get tenant details + billing + whitelists + raffles.
 *   tenant-slug-check – Check slug availability.
 *   tenant-slug-set  – Set tenant slug.
 *   tenant-add-admin – Add wallet to tenant admins (e.g. creator not in list).
 *   tenant-create    – Create tenant with creator as admin (no payment).
 *   tenant-module    – Enable/disable a module for a tenant.
 *   billing-summary  – Billing summary + recent payments + MRR.
 *   billing-extend   – Extend subscription for a tenant (platform override).
 *   billing-set-period-end – Manually set subscription period end.
 *   billing-set-watchtower-tracks – Ops override: set paid track counts (Holders, Snapshot, Transactions).
 *   billing-confirm  – Manually confirm a payment.
 *   whitelist-fetch-unbound – Fetch whitelists by tenant authority not yet bound.
 *   whitelist-bind   – Bind whitelist to tenant (one list = one tenant).
 *   whitelist-unbind – Remove whitelist from tenant.
 *   raffle-fetch-unbound – Fetch raffles by tenant creator not yet bound.
 *   raffle-bind      – Bind raffle to tenant (one raffle = one tenant). Platform admin.
 *   raffle-bind-tenant – Bind raffle to tenant. Tenant admin (for in-app create flow).
 *   raffle-unbind    – Remove raffle from tenant.
 *   crafter-import-token – Ops: add mint to crafter_tokens when confirm failed but tx succeeded.
 *   crafter-remove-token – Ops: remove mint from crafter_tokens (e.g. after user closed their ATA).
 *   audit-log        – Get platform audit log.
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, getUserClient } from '../_shared/supabase-admin.ts'
import { getSolanaConnection } from '../_shared/solana-connection.ts'
import { PublicKey } from 'npm:@solana/web3.js@1'
import { TOKEN_PROGRAM_ID } from 'npm:@solana/spl-token@0.4'

const SPL_TOKEN_ACCOUNT_DATA_SIZE = 165

function readU32LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)
}

function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (typeof data === 'string') {
    const binary = atob(data)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  }
  if (data && typeof data === 'object' && 'buffer' in data) {
    const v = data as ArrayBufferView
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
  }
  return new Uint8Array(0)
}

async function requireTenantAdmin(
  authHeader: string | null,
  tenantId: string,
  req: Request,
): Promise<{ ok: true; wallet: string } | { ok: false; response: Response }> {
  const { getWalletFromAuthHeader } = await import('../_shared/auth.ts')
  const wallet = await getWalletFromAuthHeader(authHeader)
  if (!wallet) {
    return { ok: false, response: errorResponse('Not signed in. Connect your wallet and sign in first.', req, 401) }
  }
  const db = getAdminClient()
  const { data: tenant } = await db.from('tenant_config').select('admins').eq('id', tenantId).maybeSingle()
  const admins = (tenant?.admins as string[]) ?? []
  if (!admins.includes(wallet)) {
    return { ok: false, response: errorResponse('Tenant admin only.', req, 403) }
  }
  return { ok: true, wallet }
}

/** Same auth path as tenant admin: RPC uses auth_wallet() from JWT. */
async function requirePlatformAdmin(
  authHeader: string | null,
  req: Request,
): Promise<{ ok: true; wallet: string } | { ok: false; response: Response }> {
  const bearer = authHeader?.trim()
  if (!bearer || !bearer.toLowerCase().startsWith('bearer ')) {
    return { ok: false, response: errorResponse('Not signed in. Connect your wallet and sign in first.', req, 401) }
  }

  const userClient = getUserClient(authHeader)
  const { data: wallet, error } = await userClient.rpc('check_platform_admin')
  if (error) {
    return { ok: false, response: errorResponse(`Auth error: ${error.message}`, req, 401) }
  }
  if (!wallet) {
    return { ok: false, response: errorResponse('Platform admin only. Your wallet is not authorised.', req, 403) }
  }
  return { ok: true, wallet }
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  const authHeader = req.headers.get('Authorization')
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', req)
  }

  const action = body.action as string
  const db = getAdminClient()

  // ---------------------------------------------------------------------------
  // tenants-list
  // ---------------------------------------------------------------------------
  if (action === 'tenants-list') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const { data: tenants, error } = await db
      .from('tenant_config')
      .select('id, slug, name, description, modules, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (error) return errorResponse(error.message, req, 500)
    return jsonResponse({ tenants: tenants ?? [] }, req)
  }

  // ---------------------------------------------------------------------------
  // tenant-get
  // ---------------------------------------------------------------------------
  if (action === 'tenant-get') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const tenantId = body.tenantId as string
    if (!tenantId) return errorResponse('tenantId required', req)

    const { data: tenant } = await db
      .from('tenant_config')
      .select('*')
      .eq('id', tenantId)
      .maybeSingle()
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

    const { data: gates } = await db
      .from('gate_lists')
      .select('address, name')
      .eq('tenant_id', tenantId)

    const { data: raffles } = await db
      .from('tenant_raffles')
      .select('raffle_pubkey, created_at, closed_at')
      .eq('tenant_id', tenantId)

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

  // ---------------------------------------------------------------------------
  // tenant-slug-check
  // ---------------------------------------------------------------------------
  if (action === 'tenant-slug-check') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const slug = body.slug as string
    if (!slug) return errorResponse('slug required', req)

    const { data } = await db.from('tenant_config').select('id').eq('slug', slug).maybeSingle()
    return jsonResponse({ available: !data }, req)
  }

  // ---------------------------------------------------------------------------
  // tenant-add-admin – add wallet to tenant admins (e.g. creator not in list)
  // ---------------------------------------------------------------------------
  if (action === 'tenant-add-admin') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const tenantId = body.tenantId as string
    const wallet = body.wallet as string
    if (!tenantId || !wallet?.trim()) return errorResponse('tenantId and wallet required', req)

    const { data: tenant } = await db
      .from('tenant_config')
      .select('id, admins')
      .eq('id', tenantId)
      .maybeSingle()
    if (!tenant) return errorResponse('Tenant not found', req, 404)

    const admins = (tenant.admins as string[]) ?? []
    const walletTrimmed = wallet.trim()
    if (admins.includes(walletTrimmed)) {
      return jsonResponse({ ok: true, message: 'Already admin' }, req)
    }

    const updatedAdmins = [...admins, walletTrimmed]
    await db
      .from('tenant_config')
      .update({ admins: updatedAdmins, updated_at: new Date().toISOString() })
      .eq('id', tenantId)

    await db.from('platform_audit_log').insert({
      actor_wallet: check.wallet,
      action: 'tenant_admin_added',
      target_type: 'tenant',
      target_id: tenantId,
      details: { added_wallet: walletTrimmed },
    })

    return jsonResponse({ ok: true, admins: updatedAdmins }, req)
  }

  // ---------------------------------------------------------------------------
  // tenant-create – create tenant with creator as admin (platform ops, no payment)
  // ---------------------------------------------------------------------------
  if (action === 'tenant-create') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const tenantName = body.tenantName as string
    const creatorWallet = body.creatorWallet as string
    if (!tenantName?.trim() || !creatorWallet?.trim()) {
      return errorResponse('tenantName and creatorWallet required', req)
    }

    const tenantId = crypto.randomUUID().replace(/-/g, '').slice(0, 7)
    const walletTrimmed = creatorWallet.trim()
    // Slug is left null; org uses id in URLs until slug add-on is paid and claimed in Admin > General.
    await db.from('tenant_config').insert({
      id: tenantId,
      slug: null,
      name: tenantName.trim(),
      admins: [walletTrimmed],
      modules: { admin: { state: 'active', deactivatedate: null, deactivatingUntil: null, settingsjson: {} } },
    })

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

  // ---------------------------------------------------------------------------
  // tenant-slug-set
  // ---------------------------------------------------------------------------
  if (action === 'tenant-slug-set') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const tenantId = body.tenantId as string
    const slug = body.slug as string
    if (!tenantId || !slug) return errorResponse('tenantId and slug required', req)

    const { data: existing } = await db.from('tenant_config').select('id').eq('slug', slug).maybeSingle()
    if (existing && (existing as Record<string, unknown>).id !== tenantId) {
      return errorResponse('Slug already taken', req, 409)
    }

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

  // ---------------------------------------------------------------------------
  // tenant-module – enable/disable module
  // ---------------------------------------------------------------------------
  if (action === 'tenant-module') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const tenantId = body.tenantId as string
    const moduleId = body.moduleId as string
    const state = body.state as string
    if (!tenantId || !moduleId || !state) return errorResponse('tenantId, moduleId, state required', req)

    const { data: tenant } = await db
      .from('tenant_config')
      .select('id, modules')
      .eq('id', tenantId)
      .maybeSingle()
    if (!tenant) return errorResponse('Tenant not found', req, 404)

    const currentModules = (tenant.modules as Record<string, unknown>) ?? {}
    const existing = (currentModules[moduleId] as Record<string, unknown>) ?? {}
    const updatedModules = {
      ...currentModules,
      [moduleId]: {
        state,
        deactivatedate: existing.deactivatedate ?? null,
        deactivatingUntil: existing.deactivatingUntil ?? null,
        settingsjson: existing.settingsjson ?? {},
      },
    }

    await db
      .from('tenant_config')
      .update({ modules: updatedModules, updated_at: new Date().toISOString() })
      .eq('id', (tenant as Record<string, unknown>).id)

    await db.from('platform_audit_log').insert({
      actor_wallet: check.wallet,
      action: 'module_state_changed',
      target_type: 'tenant_module',
      target_id: `${tenantId}/${moduleId}`,
      details: { state },
    })

    return jsonResponse({ ok: true }, req)
  }

  // ---------------------------------------------------------------------------
  // billing-summary
  // ---------------------------------------------------------------------------
  if (action === 'billing-summary') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const { data: paymentsRaw } = await db
      .from('billing_payments')
      .select('id, tenant_id, amount_usdc, status, confirmed_at, tx_signature, quote_id')
      .eq('status', 'confirmed')
      .order('confirmed_at', { ascending: false })
      .limit(50)

    const { data: tenants } = await db
      .from('tenant_config')
      .select('id, slug')
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
      recentPayments.push({
        id: p.id,
        tenantSlug: slugByTenant[p.tenant_id] ?? p.tenant_id,
        moduleId,
        amountUsdc: Number(p.amount_usdc),
        confirmedAt: p.confirmed_at,
        txSignature: p.tx_signature,
      })
    }

    const activeSubCount = 0
    const totalMrrUsdc = 0

    return jsonResponse({
      activeSubscriptions: activeSubCount,
      totalMrrUsdc,
      recentPayments,
    }, req)
  }

  // ---------------------------------------------------------------------------
  // billing-extend – platform override extend
  // ---------------------------------------------------------------------------
  if (action === 'billing-extend') {
    return errorResponse('Billing temporarily unavailable', req, 503)
  }

  // ---------------------------------------------------------------------------
  // billing-set-period-end – manually set period end
  // ---------------------------------------------------------------------------
  if (action === 'billing-set-period-end') {
    return errorResponse('Billing temporarily unavailable', req, 503)
  }

  // ---------------------------------------------------------------------------
  // billing-set-watchtower-tracks – ops override: set paid track counts for Watchtower
  // ---------------------------------------------------------------------------
  if (action === 'billing-set-watchtower-tracks') {
    return errorResponse('Billing temporarily unavailable', req, 503)
  }

  // ---------------------------------------------------------------------------
  // billing-confirm – manually confirm a payment
  // ---------------------------------------------------------------------------
  if (action === 'billing-confirm') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const paymentId = body.paymentId as string
    if (!paymentId) return errorResponse('paymentId required', req)

    await db
      .from('billing_payments')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', paymentId)

    await db.from('platform_audit_log').insert({
      actor_wallet: check.wallet,
      action: 'payment_manually_confirmed',
      target_type: 'billing_payment',
      target_id: paymentId,
      details: {},
    })

    return jsonResponse({ ok: true }, req)
  }

  // ---------------------------------------------------------------------------
  // whitelist-fetch-unbound – fetch ALL whitelists, filter to those not yet assigned
  // ---------------------------------------------------------------------------
  if (action === 'gate-fetch-unbound' || action === 'whitelist-fetch-unbound') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const WHITELIST_PROGRAM_ID = Deno.env.get('WHITELIST_PROGRAM_ID') ?? 'whi5uDPWK4rAE9Sus6hdxdHwsG1hjDBn6kXM6pyqwTn'
    const connection = getSolanaConnection()

    let accounts: Array<{ pubkey: PublicKey; account: { data: unknown } }>
    try {
      accounts = await connection.getProgramAccounts(new PublicKey(WHITELIST_PROGRAM_ID))
    } catch (e) {
      return errorResponse(`RPC error: ${e instanceof Error ? e.message : String(e)}`, req, 500)
    }

    const { data: bound } = await db
      .from('tenant_gate_lists')
      .select('address')
    const boundSet = new Set((bound ?? []).map((r) => r.address as string))

    const unbound: { address: string; name: string }[] = []
    for (const { pubkey, account } of accounts) {
      const addr = pubkey.toBase58()
      if (boundSet.has(addr)) continue
      const data = toUint8Array(account.data)
      if (data.length < 44) continue
      if (data.length === 72) continue
      let name = ''
      try {
        if (data.length >= 48) {
          const nameLen = readU32LE(data, 40)
          if (nameLen >= 0 && nameLen < 200 && data.length >= 44 + nameLen) {
            name = new TextDecoder().decode(data.slice(44, 44 + nameLen))
          }
        }
      } catch {
        /* ignore */
      }
      unbound.push({ address: addr, name: name || addr.slice(0, 8) })
    }

    return jsonResponse({ unbound }, req)
  }

  // ---------------------------------------------------------------------------
  // whitelist-bind – bind a whitelist to a tenant (one list = one tenant)
  // ---------------------------------------------------------------------------
  if (action === 'gate-bind' || action === 'whitelist-bind') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const tenantId = body.tenantId as string
    const address = (body.address as string)?.trim()
    if (!tenantId || !address) return errorResponse('tenantId and address required', req)

    const { data: existing } = await db
      .from('tenant_gate_lists')
      .select('tenant_id')
      .eq('address', address)
      .maybeSingle()
    if (existing) {
      return errorResponse(
        `Gate already assigned to another tenant (${(existing as Record<string, unknown>).tenant_id})`,
        req,
        409,
      )
    }

    const connection = getSolanaConnection()
    const WHITELIST_PROGRAM_ID = Deno.env.get('WHITELIST_PROGRAM_ID') ?? 'whi5uDPWK4rAE9Sus6hdxdHwsG1hjDBn6kXM6pyqwTn'
    let name = address.slice(0, 8)
    let authority = ''
    try {
      const accountInfo = await connection.getAccountInfo(new PublicKey(address))
      if (accountInfo?.data && accountInfo.data.length >= 40) {
        authority = new PublicKey(accountInfo.data.slice(8, 40)).toBase58()
        const nameLen = readU32LE(accountInfo.data as Uint8Array, 40)
        if (accountInfo.data.length >= 44 + nameLen) {
          name = new TextDecoder().decode(accountInfo.data.slice(44, 44 + nameLen))
        }
      }
    } catch {
      /* use defaults */
    }

    await db.from('gate_metadata').upsert(
      { address, name, authority, image_url: null, updated_at: new Date().toISOString() },
      { onConflict: 'address' },
    )
    const { error: insertErr } = await db.from('tenant_gate_lists').insert({
      tenant_id: tenantId,
      address,
    })
    if (insertErr) return errorResponse(insertErr.message, req, 500)

    await db.from('platform_audit_log').insert({
      actor_wallet: check.wallet,
      action: 'gate_bound',
      target_type: 'gates',
      target_id: address,
      details: { tenant_id: tenantId },
    })

    return jsonResponse({ ok: true }, req)
  }

  // ---------------------------------------------------------------------------
  // whitelist-unbind – remove whitelist from tenant
  // ---------------------------------------------------------------------------
  if (action === 'gate-unbind' || action === 'whitelist-unbind') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const tenantId = body.tenantId as string
    const address = (body.address as string)?.trim()
    if (!tenantId || !address) return errorResponse('tenantId and address required', req)

    const { error } = await db
      .from('tenant_gate_lists')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('address', address)
    if (error) return errorResponse(error.message, req, 500)

    await db.from('platform_audit_log').insert({
      actor_wallet: check.wallet,
      action: 'gate_unbound',
      target_type: 'gates',
      target_id: address,
      details: { tenant_id: tenantId },
    })

    return jsonResponse({ ok: true }, req)
  }

  // ---------------------------------------------------------------------------
  // raffle-fetch-unbound – fetch ALL raffles, filter to those not yet assigned
  // ---------------------------------------------------------------------------
  if (action === 'raffle-fetch-unbound') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const RAFFLE_PROGRAM_ID = Deno.env.get('RAFFLE_PROGRAM_ID') ?? 'rafxXxjw9fkAuQhCJ1A4gmX1oqgvRrSeXyRPUE9K2Yx'
    const connection = getSolanaConnection()

    let accounts: Array<{ pubkey: PublicKey; account: { data: unknown } }>
    try {
      accounts = await connection.getProgramAccounts(new PublicKey(RAFFLE_PROGRAM_ID))
    } catch (e) {
      return errorResponse(`RPC error: ${e instanceof Error ? e.message : String(e)}`, req, 500)
    }

    const { data: bound } = await db.from('tenant_raffles').select('raffle_pubkey')
    const boundSet = new Set((bound ?? []).map((r) => r.raffle_pubkey as string))

    const unbound: { rafflePubkey: string; name: string }[] = []
    for (const { pubkey, account } of accounts) {
      const addr = pubkey.toBase58()
      if (boundSet.has(addr)) continue
      const data = toUint8Array(account.data)
      if (data.length < 54) continue
      let name = ''
      try {
        const nameLen = readU32LE(data, 50)
        if (nameLen > 0 && nameLen < 200 && data.length >= 54 + nameLen) {
          name = new TextDecoder().decode(data.slice(54, 54 + nameLen))
        }
      } catch {
        /* ignore */
      }
      unbound.push({ rafflePubkey: addr, name: name || addr.slice(0, 8) })
    }

    return jsonResponse({ unbound }, req)
  }

  // ---------------------------------------------------------------------------
  // raffle-bind – bind a raffle to a tenant (one raffle = one tenant)
  // ---------------------------------------------------------------------------
  if (action === 'raffle-bind') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const tenantId = body.tenantId as string
    const rafflePubkey = (body.rafflePubkey as string)?.trim()
    if (!tenantId || !rafflePubkey) return errorResponse('tenantId and rafflePubkey required', req)

    const { data: existing } = await db
      .from('tenant_raffles')
      .select('tenant_id')
      .eq('raffle_pubkey', rafflePubkey)
      .maybeSingle()
    if (existing) {
      return errorResponse(
        `Raffle already assigned to another tenant (${(existing as Record<string, unknown>).tenant_id})`,
        req,
        409,
      )
    }

    const { error } = await db.from('tenant_raffles').insert({
      tenant_id: tenantId,
      raffle_pubkey: rafflePubkey,
    })
    if (error) return errorResponse(error.message, req, 500)

    await db.from('platform_audit_log').insert({
      actor_wallet: check.wallet,
      action: 'raffle_bound',
      target_type: 'raffle',
      target_id: rafflePubkey,
      details: { tenant_id: tenantId },
    })

    return jsonResponse({ ok: true }, req)
  }

  // ---------------------------------------------------------------------------
  // raffle-bind-tenant – bind raffle to tenant (tenant admin, for in-app create)
  // ---------------------------------------------------------------------------
  if (action === 'raffle-bind-tenant') {
    const tenantId = body.tenantId as string
    const rafflePubkey = (body.rafflePubkey as string)?.trim()
    if (!tenantId || !rafflePubkey) return errorResponse('tenantId and rafflePubkey required', req)

    const check = await requireTenantAdmin(authHeader, tenantId, req)
    if (!check.ok) return check.response

    const { data: existing } = await db
      .from('tenant_raffles')
      .select('tenant_id')
      .eq('raffle_pubkey', rafflePubkey)
      .maybeSingle()
    if (existing) {
      return errorResponse(
        `Raffle already assigned to another tenant (${(existing as Record<string, unknown>).tenant_id})`,
        req,
        409,
      )
    }

    const { error } = await db.from('tenant_raffles').insert({
      tenant_id: tenantId,
      raffle_pubkey: rafflePubkey,
    })
    if (error) return errorResponse(error.message, req, 500)

    return jsonResponse({ ok: true }, req)
  }

  // ---------------------------------------------------------------------------
  // raffle-unbind – remove raffle from tenant
  // ---------------------------------------------------------------------------
  if (action === 'raffle-unbind') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const tenantId = body.tenantId as string
    const rafflePubkey = (body.rafflePubkey as string)?.trim()
    if (!tenantId || !rafflePubkey) return errorResponse('tenantId and rafflePubkey required', req)

    const { error } = await db
      .from('tenant_raffles')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('raffle_pubkey', rafflePubkey)
    if (error) return errorResponse(error.message, req, 500)

    await db.from('platform_audit_log').insert({
      actor_wallet: check.wallet,
      action: 'raffle_unbound',
      target_type: 'raffle',
      target_id: rafflePubkey,
      details: { tenant_id: tenantId },
    })

    return jsonResponse({ ok: true }, req)
  }

  // ---------------------------------------------------------------------------
  // crafter-import-token – ops recovery when confirm failed but tx succeeded
  // ---------------------------------------------------------------------------
  if (action === 'crafter-import-token') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const tenantId = body.tenantId as string
    const mint = (body.mint as string)?.trim()
    const name = (body.name as string)?.trim() || null
    const symbol = (body.symbol as string)?.trim() || null
    const decimals = typeof body.decimals === 'number' ? body.decimals : 6
    const authority = (body.authority as string)?.trim()

    if (!tenantId || !mint) return errorResponse('tenantId and mint required', req)

    const { data: tenant } = await db
      .from('tenant_config')
      .select('id, admins')
      .eq('id', tenantId)
      .maybeSingle()
    if (!tenant) return errorResponse('Tenant not found', req, 404)

    const authorityWallet = authority || ((tenant as { admins?: string[] }).admins)?.[0]
    if (!authorityWallet) return errorResponse('authority required (or tenant must have admins)', req)

    let resolvedDecimals = decimals
    try {
      const connection = getSolanaConnection()
      const mintPk = new PublicKey(mint)
      const accountInfo = await connection.getAccountInfo(mintPk)
      if (accountInfo?.data && accountInfo.data.length >= 46) {
        resolvedDecimals = (accountInfo.data as Uint8Array)[44]
      }
    } catch {
      /* use provided */
    }

    const resolvedName = name || mint.slice(0, 8)
    const resolvedSymbol = symbol || 'TOKEN'
    const nowIso = new Date().toISOString()
    const { error: insertErr } = await db.from('crafter_tokens').insert({
      tenant_id: tenantId,
      mint,
      billing_payment_id: null,
      name: resolvedName,
      symbol: resolvedSymbol,
      decimals: resolvedDecimals,
      description: null,
      image_url: null,
      metadata_uri: '',
      storage_backend: 'api',
      authority: authorityWallet,
    })

    if (insertErr) {
      if (insertErr.code === '23505') return errorResponse('Token already in crafter for this tenant', req, 409)
      return errorResponse(insertErr.message, req, 500)
    }

    await db.from('mint_metadata').upsert(
      {
        mint,
        name: resolvedName,
        symbol: resolvedSymbol,
        image: null,
        decimals: resolvedDecimals,
        updated_at: nowIso,
      },
      { onConflict: 'mint' },
    )

    await db
      .from('tenant_mint_catalog')
      .upsert(
        {
          tenant_id: tenantId,
          mint,
          kind: 'SPL',
          label: resolvedName || resolvedSymbol,
          updated_at: nowIso,
        },
        { onConflict: 'tenant_id,mint' },
      )

    await db.from('platform_audit_log').insert({
      actor_wallet: check.wallet,
      action: 'crafter_token_imported',
      target_type: 'crafter_token',
      target_id: mint,
      details: { tenant_id: tenantId },
    })

    const { fetchMintMetadata } = await import('../_shared/mint-metadata.ts')
    const onChainMeta = await fetchMintMetadata(mint, 'SPL')
    if (onChainMeta?.uri) {
      const crafterUpdates: Record<string, unknown> = { metadata_uri: onChainMeta.uri }
      if (onChainMeta.name != null) crafterUpdates.name = onChainMeta.name
      if (onChainMeta.image != null) crafterUpdates.image_url = onChainMeta.image
      if (onChainMeta.sellerFeeBasisPoints != null) crafterUpdates.seller_fee_basis_points = onChainMeta.sellerFeeBasisPoints
      await db.from('crafter_tokens').update(crafterUpdates).eq('tenant_id', tenantId).eq('mint', mint)

      const mintMetaUpdates: Record<string, unknown> = { uri: onChainMeta.uri, updated_at: nowIso }
      if (onChainMeta.name != null) mintMetaUpdates.name = onChainMeta.name
      if (onChainMeta.image != null) mintMetaUpdates.image = onChainMeta.image
      await db.from('mint_metadata').update(mintMetaUpdates).eq('mint', mint)
    }

    return jsonResponse({ ok: true, mint }, req)
  }

  // ---------------------------------------------------------------------------
  // crafter-remove-token – ops: remove token from crafter_tokens
  // ---------------------------------------------------------------------------
  if (action === 'crafter-remove-token') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const tenantId = body.tenantId as string
    const mint = (body.mint as string)?.trim()
    if (!tenantId || !mint) return errorResponse('tenantId and mint required', req)

    const { error } = await db
      .from('crafter_tokens')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('mint', mint)
    if (error) return errorResponse(error.message, req, 500)

    await db.from('platform_audit_log').insert({
      actor_wallet: check.wallet,
      action: 'crafter_token_removed',
      target_type: 'crafter_token',
      target_id: mint,
      details: { tenant_id: tenantId },
    })

    return jsonResponse({ ok: true }, req)
  }

  // ---------------------------------------------------------------------------
  // bundle-create – create bundle + entitlements (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'bundle-create') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const bundleId = (body.bundleId as string)?.trim()
    const label = (body.label as string)?.trim()
    const priceUsdc = typeof body.priceUsdc === 'number' ? body.priceUsdc : Number(body.priceUsdc)
    const productKey = (body.productKey as string)?.trim()
    const entitlements = body.entitlements as Array<{ meter_key: string; quantity: number; duration_days: number }>

    if (!bundleId || !label || !productKey) {
      return errorResponse('bundleId, label, and productKey required', req)
    }
    if (!Array.isArray(entitlements) || entitlements.length === 0) {
      return errorResponse('entitlements array with at least one item (meter_key, quantity, duration_days) required', req)
    }

    const { error: bundleErr } = await db.from('bundles').insert({
      id: bundleId,
      product_key: productKey,
      price_usdc: priceUsdc,
      label,
      version: 1,
      price_version: 1,
    })
    if (bundleErr) {
      if (bundleErr.code === '23505') return errorResponse('Bundle id already exists', req, 409)
      return errorResponse(bundleErr.message, req, 500)
    }

    const rows = entitlements
      .filter((e) => e.meter_key?.trim())
      .map((e) => ({
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

  // ---------------------------------------------------------------------------
  // bundle-get – fetch bundle by id with entitlements (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'bundle-get') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const bundleId = (body.bundleId as string)?.trim()
    if (!bundleId) return errorResponse('bundleId required', req)

    const { data: bundle, error: bundleErr } = await db
      .from('bundles')
      .select('id, label, product_key, price_usdc')
      .eq('id', bundleId)
      .single()
    if (bundleErr || !bundle) return errorResponse('Bundle not found', req, 404)

    const { data: entitlements, error: entsErr } = await db
      .from('bundle_entitlements')
      .select('meter_key, quantity, duration_days')
      .eq('bundle_id', bundleId)
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

  // ---------------------------------------------------------------------------
  // bundle-update – update bundle label, product_key, price_usdc, entitlements (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'bundle-update') {
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
        const rows = entitlements
          .filter((e) => e.meter_key?.trim())
          .map((e) => ({
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

  // ---------------------------------------------------------------------------
  // voucher-prepare-metadata – upload metadata JSON to voucher-metadata bucket (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'voucher-prepare-metadata') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const name = (body.name as string)?.trim()
    const symbol = (body.symbol as string)?.trim()
    const imageUrl = (body.imageUrl as string)?.trim() || undefined
    const rawBps = body.sellerFeeBasisPoints
    const sellerFeeBasisPoints =
      typeof rawBps === 'number'
        ? Math.max(0, Math.min(10000, rawBps))
        : typeof rawBps === 'string'
          ? Math.max(0, Math.min(10000, parseInt(rawBps, 10) || 0))
          : 0
    const voucherType = (body.voucherType as 'bundle' | 'individual') ?? 'individual'
    const bundleId = (body.bundleId as string)?.trim() || undefined

    if (!name || !symbol) return errorResponse('name and symbol required', req)

    const decentraguild: Record<string, unknown> = {
      createdVia: 'voucher',
      type: voucherType,
      version: 1,
    }
    if (voucherType === 'bundle' && bundleId) decentraguild.bundleId = bundleId

    const metadataJson = {
      name,
      symbol,
      description: '',
      image: imageUrl ?? undefined,
      seller_fee_basis_points: sellerFeeBasisPoints,
      external_url: '',
      attributes: [],
      properties: { files: [], category: 'token' },
      decentraguild,
    }

    const uuid = crypto.randomUUID()
    const path = `${uuid}.json`
    const { error: uploadErr } = await db.storage
      .from('voucher-metadata')
      .upload(path, JSON.stringify(metadataJson), {
        contentType: 'application/json',
        upsert: false,
      })

    if (uploadErr) return errorResponse(uploadErr.message, req, 500)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '') ?? ''
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/voucher-metadata/${path}`

    return jsonResponse({ metadataUri: publicUrl }, req)
  }

  // ---------------------------------------------------------------------------
  // voucher-register-draft – store mint after step 1 (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'voucher-register-draft') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const mint = (body.mint as string)?.trim()
    if (!mint) return errorResponse('mint required', req)

    const { error } = await db.from('voucher_drafts').insert({
      mint,
      actor_wallet: check.wallet,
    })
    if (error) {
      if (error.code === '23505') return errorResponse('Mint already registered', req, 409)
      return errorResponse(error.message, req, 500)
    }
    return jsonResponse({ ok: true, mint }, req)
  }

  // ---------------------------------------------------------------------------
  // voucher-list – drafts + linked for OPS (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'voucher-list') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const { data: drafts } = await db
      .from('voucher_drafts')
      .select('mint, created_at')
      .order('created_at', { ascending: false })

    const { data: bundleRows } = await db
      .from('bundle_vouchers')
      .select('token_mint, bundle_id')
    const { data: indRows } = await db
      .from('individual_vouchers')
      .select('mint, label')

    const linked = [
      ...(bundleRows ?? []).map((r) => ({
        mint: (r as { token_mint: string }).token_mint,
        type: 'bundle' as const,
        bundleId: (r as { bundle_id: string }).bundle_id,
      })),
      ...(indRows ?? []).map((r) => ({
        mint: (r as { mint: string }).mint,
        type: 'individual' as const,
        label: (r as { label: string | null }).label,
      })),
    ]

    return jsonResponse({
      drafts: drafts ?? [],
      linked,
    }, req)
  }

  // ---------------------------------------------------------------------------
  // voucher-remove-draft – remove draft after link or cancel (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'voucher-remove-draft') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const mint = (body.mint as string)?.trim()
    if (!mint) return errorResponse('mint required', req)

    await db.from('voucher_drafts').delete().eq('mint', mint)
    return jsonResponse({ ok: true }, req)
  }

  // ---------------------------------------------------------------------------
  // voucher-create-bundle – link mint to bundle (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'voucher-create-bundle') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const mint = (body.mint as string)?.trim()
    const bundleId = (body.bundleId as string)?.trim()
    const tokensRequired = typeof body.tokensRequired === 'number' ? body.tokensRequired : Number(body.tokensRequired) || 1
    const maxRedemptionsPerTenant =
      body.maxRedemptionsPerTenant != null
        ? (typeof body.maxRedemptionsPerTenant === 'number' ? body.maxRedemptionsPerTenant : Number(body.maxRedemptionsPerTenant))
        : null

    if (!mint || !bundleId) return errorResponse('mint and bundleId required', req)

    const { data: bundle } = await db.from('bundles').select('id').eq('id', bundleId).maybeSingle()
    if (!bundle) return errorResponse('Bundle not found', req, 404)

    const { error } = await db.from('bundle_vouchers').insert({
      bundle_id: bundleId,
      token_mint: mint,
      decimals: 0,
      tokens_required: tokensRequired,
      max_redemptions_per_tenant: maxRedemptionsPerTenant,
    })
    if (error) {
      if (error.code === '23505') return errorResponse('Voucher already linked to this bundle', req, 409)
      return errorResponse(error.message, req, 500)
    }

    await db.from('platform_audit_log').insert({
      actor_wallet: check.wallet,
      action: 'voucher_bundle_created',
      target_type: 'bundle_voucher',
      target_id: mint,
      details: { bundleId, tokensRequired },
    })

    await db.from('voucher_drafts').delete().eq('mint', mint)

    return jsonResponse({ ok: true, mint }, req)
  }

  // ---------------------------------------------------------------------------
  // voucher-create-individual – create individual voucher + entitlements (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'voucher-create-individual') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const mint = (body.mint as string)?.trim()
    const label = (body.label as string)?.trim() || null
    const maxRedemptionsPerTenant =
      body.maxRedemptionsPerTenant != null
        ? (typeof body.maxRedemptionsPerTenant === 'number' ? body.maxRedemptionsPerTenant : Number(body.maxRedemptionsPerTenant))
        : null
    const entitlements = body.entitlements as Array<{ meter_key: string; quantity: number; duration_days: number }>

    if (!mint) return errorResponse('mint required', req)
    if (!Array.isArray(entitlements) || entitlements.length === 0) {
      return errorResponse('entitlements array with at least one item required', req)
    }

    const { error: voucherErr } = await db.from('individual_vouchers').insert({
      mint,
      max_redemptions_per_tenant: maxRedemptionsPerTenant,
      label,
    })
    if (voucherErr) {
      if (voucherErr.code === '23505') return errorResponse('Voucher mint already exists', req, 409)
      return errorResponse(voucherErr.message, req, 500)
    }

    const rows = entitlements
      .filter((e) => e.meter_key?.trim())
      .map((e) => ({
        mint,
        meter_key: (e.meter_key as string).trim(),
        quantity: typeof e.quantity === 'number' ? e.quantity : Number(e.quantity) || 1,
        duration_days: typeof e.duration_days === 'number' ? e.duration_days : Number(e.duration_days) || 30,
      }))
    if (rows.length === 0) {
      await db.from('individual_vouchers').delete().eq('mint', mint)
      return errorResponse('No valid entitlements', req)
    }

    const { error: entsErr } = await db.from('individual_voucher_entitlements').insert(rows)
    if (entsErr) {
      await db.from('individual_vouchers').delete().eq('mint', mint)
      return errorResponse(entsErr.message, req, 500)
    }

    await db.from('platform_audit_log').insert({
      actor_wallet: check.wallet,
      action: 'voucher_individual_created',
      target_type: 'individual_voucher',
      target_id: mint,
      details: { label, entitlementsCount: rows.length },
    })

    await db.from('voucher_drafts').delete().eq('mint', mint)

    return jsonResponse({ ok: true, mint }, req)
  }

  // ---------------------------------------------------------------------------
  // individual-voucher-get – fetch individual voucher by mint (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'individual-voucher-get') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const mint = (body.mint as string)?.trim()
    if (!mint) return errorResponse('mint required', req)

    const { data: voucher, error: vErr } = await db
      .from('individual_vouchers')
      .select('mint, label, max_redemptions_per_tenant')
      .eq('mint', mint)
      .single()
    if (vErr || !voucher) return errorResponse('Individual voucher not found', req, 404)

    const { data: entitlements, error: eErr } = await db
      .from('individual_voucher_entitlements')
      .select('meter_key, quantity, duration_days')
      .eq('mint', mint)
    if (eErr) return errorResponse(eErr.message, req, 500)

    return jsonResponse({
      voucher: {
        mint: (voucher as { mint: string }).mint,
        label: (voucher as { label: string | null }).label,
        max_redemptions_per_tenant: (voucher as { max_redemptions_per_tenant: number | null }).max_redemptions_per_tenant,
      },
      entitlements: (entitlements ?? []).map((e) => ({
        meter_key: (e as { meter_key: string }).meter_key,
        quantity: Number((e as { quantity: number }).quantity),
        duration_days: (e as { duration_days: number }).duration_days,
      })),
    }, req)
  }

  // ---------------------------------------------------------------------------
  // bundle-voucher-get – fetch bundle voucher by mint (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'bundle-voucher-get') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const mint = (body.mint as string)?.trim()
    if (!mint) return errorResponse('mint required', req)

    const { data: bv, error: bvErr } = await db
      .from('bundle_vouchers')
      .select('bundle_id, token_mint, tokens_required, max_redemptions_per_tenant')
      .eq('token_mint', mint)
      .single()
    if (bvErr || !bv) return errorResponse('Bundle voucher not found', req, 404)

    const { data: bundle } = await db
      .from('bundles')
      .select('id, label, product_key')
      .eq('id', (bv as { bundle_id: string }).bundle_id)
      .single()

    return jsonResponse({
      voucher: {
        mint: (bv as { token_mint: string }).token_mint,
        bundle_id: (bv as { bundle_id: string }).bundle_id,
        tokens_required: Number((bv as { tokens_required: number }).tokens_required),
        max_redemptions_per_tenant: (bv as { max_redemptions_per_tenant: number | null }).max_redemptions_per_tenant,
      },
      bundle: bundle ? { id: (bundle as { id: string }).id, label: (bundle as { label: string }).label, product_key: (bundle as { product_key: string }).product_key } : null,
    }, req)
  }

  // ---------------------------------------------------------------------------
  // individual-voucher-update – update individual voucher (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'individual-voucher-update') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const mint = (body.mint as string)?.trim()
    if (!mint) return errorResponse('mint required', req)

    const label = (body.label as string)?.trim()
    const maxRedemptionsPerTenant = body.maxRedemptionsPerTenant != null ? Number(body.maxRedemptionsPerTenant) : undefined
    const entitlements = body.entitlements as Array<{ meter_key: string; quantity: number; duration_days: number }> | undefined

    const updates: Record<string, unknown> = {}
    if (label !== undefined) updates.label = label
    if (maxRedemptionsPerTenant !== undefined) updates.max_redemptions_per_tenant = maxRedemptionsPerTenant

    if (Object.keys(updates).length > 0) {
      const { error: updErr } = await db.from('individual_vouchers').update(updates).eq('mint', mint)
      if (updErr) return errorResponse(updErr.message, req, 500)
    }

    if (Array.isArray(entitlements)) {
      const { error: delErr } = await db.from('individual_voucher_entitlements').delete().eq('mint', mint)
      if (delErr) return errorResponse(delErr.message, req, 500)

      if (entitlements.length > 0) {
        const rows = entitlements
          .filter((e) => e.meter_key?.trim())
          .map((e) => ({
            mint,
            meter_key: (e.meter_key as string).trim(),
            quantity: typeof e.quantity === 'number' ? e.quantity : Number(e.quantity) || 1,
            duration_days: typeof e.duration_days === 'number' ? e.duration_days : Number(e.duration_days) || 30,
          }))
        if (rows.length > 0) {
          const { error: insErr } = await db.from('individual_voucher_entitlements').insert(rows)
          if (insErr) return errorResponse(insErr.message, req, 500)
        }
      }
    }

    return jsonResponse({ ok: true, mint }, req)
  }

  // ---------------------------------------------------------------------------
  // bundle-voucher-update – update bundle voucher (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'bundle-voucher-update') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const mint = (body.mint as string)?.trim()
    if (!mint) return errorResponse('mint required', req)

    const tokensRequired = body.tokensRequired != null ? Number(body.tokensRequired) : undefined
    const maxRedemptionsPerTenant = body.maxRedemptionsPerTenant != null ? Number(body.maxRedemptionsPerTenant) : undefined

    const updates: Record<string, unknown> = {}
    if (tokensRequired !== undefined) updates.tokens_required = tokensRequired
    if (maxRedemptionsPerTenant !== undefined) updates.max_redemptions_per_tenant = maxRedemptionsPerTenant

    if (Object.keys(updates).length === 0) return jsonResponse({ ok: true, mint }, req)

    const { error } = await db.from('bundle_vouchers').update(updates).eq('token_mint', mint)
    if (error) return errorResponse(error.message, req, 500)

    return jsonResponse({ ok: true, mint }, req)
  }

  // ---------------------------------------------------------------------------
  // bundles-list – list bundles for voucher form (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'bundles-list') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const { data: bundles, error } = await db
      .from('bundles')
      .select('id, label, product_key')
      .order('id')
    if (error) return errorResponse(error.message, req, 500)
    return jsonResponse({ bundles: bundles ?? [] }, req)
  }

  // ---------------------------------------------------------------------------
  // meters-list – list meter_key options for bundle/voucher forms (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'meters-list') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const { data: meters, error } = await db
      .from('meters')
      .select('meter_key, product_key, description')
      .order('meter_key')
    if (error) return errorResponse(error.message, req, 500)
    return jsonResponse({ meters: meters ?? [] }, req)
  }

  // ---------------------------------------------------------------------------
  // products-list – distinct product_key for voucher product dropdown (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'products-list') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const { data: rows, error } = await db
      .from('meters')
      .select('product_key')
    if (error) return errorResponse(error.message, req, 500)
    const seen = new Set<string>()
    const products: Array<{ product_key: string }> = []
    for (const r of rows ?? []) {
      const pk = (r as { product_key: string }).product_key
      if (pk && !seen.has(pk)) {
        seen.add(pk)
        products.push({ product_key: pk })
      }
    }
    products.sort((a, b) => a.product_key.localeCompare(b.product_key))
    return jsonResponse({ products }, req)
  }

  // ---------------------------------------------------------------------------
  // product-tier-defaults – default entitlements for a product (from tier_rules)
  // Returns one row per meter_key with min quantity from first tier, duration 30
  // ---------------------------------------------------------------------------
  if (action === 'product-tier-defaults') {
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
      if (!byMeter.has(row.meter_key)) {
        byMeter.set(row.meter_key, { quantity: row.min_quantity || 1, duration_days: 30 })
      }
    }
    const entitlements = Array.from(byMeter.entries()).map(([meter_key, v]) => ({
      meter_key,
      quantity: v.quantity,
      duration_days: v.duration_days,
    }))
    return jsonResponse({ entitlements }, req)
  }

  // ---------------------------------------------------------------------------
  // voucher-detail – fetch voucher config + redemptions (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'voucher-detail') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const mint = (body.mint as string)?.trim()
    if (!mint) return errorResponse('mint required', req)

    const { data: bv } = await db
      .from('bundle_vouchers')
      .select('bundle_id, token_mint, tokens_required, max_redemptions_per_tenant')
      .eq('token_mint', mint)
      .maybeSingle()

    if (bv) {
      const bvRow = bv as { bundle_id: string; token_mint: string; tokens_required: number; max_redemptions_per_tenant: number | null }
      const { data: bundle } = await db.from('bundles').select('id, label, product_key').eq('id', bvRow.bundle_id).single()

      const { data: redemptions } = await db
        .from('voucher_redemptions')
        .select('tenant_id, voucher_mint, bundle_id, quantity, redeemed_at, payment_id')
        .eq('voucher_mint', mint)
        .order('redeemed_at', { ascending: false })
        .limit(200)

      const paymentIds = [...new Set((redemptions ?? []).map((r) => (r as { payment_id: string }).payment_id))]
      const paymentsMap = new Map<string, { payer_wallet: string; status: string }>()
      if (paymentIds.length > 0) {
        const { data: payments } = await db
          .from('billing_payments')
          .select('id, payer_wallet, status')
          .in('id', paymentIds)
        for (const p of payments ?? []) {
          const row = p as { id: string; payer_wallet: string; status: string }
          paymentsMap.set(row.id, { payer_wallet: row.payer_wallet, status: row.status })
        }
      }

      const redemptionsList = (redemptions ?? []).map((r) => {
        const row = r as { tenant_id: string; voucher_mint: string; bundle_id: string; quantity: number; redeemed_at: string; payment_id: string }
        const pay = paymentsMap.get(row.payment_id)
        return {
          tenant_id: row.tenant_id,
          voucher_mint: row.voucher_mint,
          bundle_id: row.bundle_id,
          quantity: Number(row.quantity),
          redeemed_at: row.redeemed_at,
          payer_wallet: pay?.payer_wallet ?? null,
          status: pay?.status ?? null,
        }
      })

      return jsonResponse({
        type: 'bundle',
        voucher: {
          mint: bvRow.token_mint,
          bundle_id: bvRow.bundle_id,
          tokens_required: Number(bvRow.tokens_required),
          max_redemptions_per_tenant: bvRow.max_redemptions_per_tenant,
        },
        bundle: bundle ? { id: (bundle as { id: string }).id, label: (bundle as { label: string }).label, product_key: (bundle as { product_key: string }).product_key } : null,
        redemptions: redemptionsList,
      }, req)
    }

    const { data: iv } = await db
      .from('individual_vouchers')
      .select('mint, label, max_redemptions_per_tenant')
      .eq('mint', mint)
      .maybeSingle()

    if (iv) {
      const ivRow = iv as { mint: string; label: string | null; max_redemptions_per_tenant: number | null }
      const { data: entitlements } = await db
        .from('individual_voucher_entitlements')
        .select('meter_key, quantity, duration_days')
        .eq('mint', mint)

      const { data: redemptions } = await db
        .from('individual_voucher_redemptions')
        .select('tenant_id, voucher_mint, quantity, redeemed_at, payment_id')
        .eq('voucher_mint', mint)
        .order('redeemed_at', { ascending: false })
        .limit(200)

      const paymentIds = [...new Set((redemptions ?? []).map((r) => (r as { payment_id: string }).payment_id))]
      const paymentsMap = new Map<string, { payer_wallet: string; status: string }>()
      if (paymentIds.length > 0) {
        const { data: payments } = await db
          .from('billing_payments')
          .select('id, payer_wallet, status')
          .in('id', paymentIds)
        for (const p of payments ?? []) {
          const row = p as { id: string; payer_wallet: string; status: string }
          paymentsMap.set(row.id, { payer_wallet: row.payer_wallet, status: row.status })
        }
      }

      const redemptionsList = (redemptions ?? []).map((r) => {
        const row = r as { tenant_id: string; voucher_mint: string; quantity: number; redeemed_at: string; payment_id: string }
        const pay = paymentsMap.get(row.payment_id)
        return {
          tenant_id: row.tenant_id,
          voucher_mint: row.voucher_mint,
          quantity: Number(row.quantity),
          redeemed_at: row.redeemed_at,
          payer_wallet: pay?.payer_wallet ?? null,
          status: pay?.status ?? null,
        }
      })

      return jsonResponse({
        type: 'individual',
        voucher: {
          mint: ivRow.mint,
          label: ivRow.label,
          max_redemptions_per_tenant: ivRow.max_redemptions_per_tenant,
        },
        entitlements: (entitlements ?? []).map((e) => ({
          meter_key: (e as { meter_key: string }).meter_key,
          quantity: Number((e as { quantity: number }).quantity),
          duration_days: (e as { duration_days: number }).duration_days,
        })),
        redemptions: redemptionsList,
      }, req)
    }

    return errorResponse('Voucher not found', req, 404)
  }

  // ---------------------------------------------------------------------------
  // voucher-holders – fetch on-chain token holders for a mint (owner-only)
  // ---------------------------------------------------------------------------
  if (action === 'voucher-holders') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const mint = (body.mint as string)?.trim()
    if (!mint) return errorResponse('mint required', req)

    const mintPk = new PublicKey(mint)
    const connection = getSolanaConnection()
    const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
      commitment: 'confirmed',
      filters: [
        { dataSize: SPL_TOKEN_ACCOUNT_DATA_SIZE },
        { memcmp: { offset: 0, bytes: mintPk.toBase58() } },
      ],
    })

    const byWallet = new Map<string, bigint>()
    for (const { account } of accounts) {
      const data = account.data as Uint8Array
      if (data.length < 72) continue
      const owner = new PublicKey(data.slice(32, 64)).toBase58()
      const view = new DataView(data.buffer, data.byteOffset)
      const amount = view.getBigUint64(64, true)
      if (amount > 0n) byWallet.set(owner, (byWallet.get(owner) ?? 0n) + amount)
    }

    const holders = [...byWallet.entries()].map(([owner, amount]) => ({
      owner,
      amount: String(amount),
    }))

    return jsonResponse({ holders }, req)
  }

  // ---------------------------------------------------------------------------
  // audit-log
  // ---------------------------------------------------------------------------
  if (action === 'audit-log') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const limit = Math.min((body.limit as number) ?? 50, 200)
    const offset = (body.offset as number) ?? 0

    const { data: entries } = await db
      .from('platform_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    return jsonResponse({ entries: entries ?? [] }, req)
  }

  return errorResponse(`Unknown action: ${action}`, req, 400)
})
