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
 *   raffle-bind      – Bind raffle to tenant (one raffle = one tenant).
 *   raffle-unbind    – Remove raffle from tenant.
 *   crafter-import-token – Ops: add mint to crafter_tokens when confirm failed but tx succeeded.
 *   crafter-remove-token – Ops: remove mint from crafter_tokens (e.g. after user closed their ATA).
 *   audit-log        – Get platform audit log.
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, getUserClient } from '../_shared/supabase-admin.ts'
import { getSolanaConnection } from '../_shared/solana-connection.ts'
import { PublicKey } from 'npm:@solana/web3.js@1'

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

    const { data: subs } = await db
      .from('billing_subscriptions')
      .select('*')
      .eq('tenant_id', (tenant as Record<string, unknown>).id)

    const { data: paymentsRaw } = await db
      .from('billing_payments')
      .select('id, tenant_id, module_id, amount_usdc, billing_period, period_start, period_end, status, confirmed_at, tx_signature')
      .eq('tenant_id', tenantId)
      .order('confirmed_at', { ascending: false })
      .limit(50)

    const payments = (paymentsRaw ?? []).map((p) => ({
      id: p.id,
      tenantSlug: (tenant as Record<string, unknown>).slug ?? tenantId,
      moduleId: p.module_id,
      amountUsdc: Number(p.amount_usdc),
      billingPeriod: p.billing_period,
      periodStart: p.period_start,
      periodEnd: p.period_end,
      status: p.status,
      confirmedAt: p.confirmed_at,
      txSignature: p.tx_signature,
    }))

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
      billing: { subscriptions: subs ?? [], payments },
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
      .select('id, tenant_id, module_id, amount_usdc, billing_period, period_start, period_end, status, confirmed_at, tx_signature')
      .eq('status', 'confirmed')
      .order('confirmed_at', { ascending: false })
      .limit(50)

    const { data: tenants } = await db
      .from('tenant_config')
      .select('id, slug')
    const slugByTenant = Object.fromEntries((tenants ?? []).map((t) => [t.id, t.slug ?? t.id]))

    const recentPayments = (paymentsRaw ?? []).map((p) => ({
      id: p.id,
      tenantSlug: slugByTenant[p.tenant_id] ?? p.tenant_id,
      moduleId: p.module_id,
      amountUsdc: Number(p.amount_usdc),
      billingPeriod: p.billing_period,
      periodStart: p.period_start,
      periodEnd: p.period_end,
      confirmedAt: p.confirmed_at,
      txSignature: p.tx_signature,
    }))

    const { data: activeSubs } = await db
      .from('billing_subscriptions')
      .select('recurring_amount_usdc, billing_period')
      .gt('period_end', new Date().toISOString())

    const activeSubCount = activeSubs?.length ?? 0
    let totalMrrUsdc = 0
    for (const s of activeSubs ?? []) {
      const monthly = s.billing_period === 'yearly'
        ? Number(s.recurring_amount_usdc) / 12
        : Number(s.recurring_amount_usdc)
      totalMrrUsdc += monthly
    }

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
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const tenantId = body.tenantId as string
    const moduleId = body.moduleId as string
    const months = (body.months as number) ?? 1
    if (!tenantId || !moduleId) return errorResponse('tenantId and moduleId required', req)

    const { data: rows } = await db
      .from('billing_subscriptions')
      .select('scope_key, period_end')
      .eq('tenant_id', tenantId)
      .eq('module_id', moduleId)

    if (!rows?.length) return errorResponse('Subscription not found', req, 404)
    const earliest = (rows as { period_end: string }[]).reduce(
      (a, b) => (new Date(a.period_end) < new Date(b.period_end) ? a : b),
    )
    const currentEnd = new Date(earliest.period_end)
    const newEnd = new Date(currentEnd)
    newEnd.setMonth(newEnd.getMonth() + months)

    await db
      .from('billing_subscriptions')
      .update({ period_end: newEnd.toISOString(), updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('module_id', moduleId)

    await db.from('platform_audit_log').insert({
      actor_wallet: check.wallet,
      action: 'subscription_extended',
      target_type: 'subscription',
      target_id: `${tenantId}/${moduleId}`,
      details: { months, newPeriodEnd: newEnd.toISOString() },
    })

    return jsonResponse({ ok: true, periodEnd: newEnd.toISOString() }, req)
  }

  // ---------------------------------------------------------------------------
  // billing-set-period-end – manually set period end
  // ---------------------------------------------------------------------------
  if (action === 'billing-set-period-end') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const tenantId = body.tenantId as string
    const moduleId = body.moduleId as string
    const periodEnd = body.periodEnd as string
    if (!tenantId || !moduleId || !periodEnd) return errorResponse('tenantId, moduleId, periodEnd required', req)

    await db
      .from('billing_subscriptions')
      .update({ period_end: periodEnd, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('module_id', moduleId)

    await db.from('platform_audit_log').insert({
      actor_wallet: check.wallet,
      action: 'subscription_period_end_set',
      target_type: 'subscription',
      target_id: `${tenantId}/${moduleId}`,
      details: { periodEnd },
    })

    return jsonResponse({ ok: true }, req)
  }

  // ---------------------------------------------------------------------------
  // billing-set-watchtower-tracks – ops override: set paid track counts for Watchtower
  // ---------------------------------------------------------------------------
  if (action === 'billing-set-watchtower-tracks') {
    const check = await requirePlatformAdmin(authHeader, req)
    if (!check.ok) return check.response

    const tenantId = body.tenantId as string
    const mints_current = typeof body.mints_current === 'number' ? Math.max(0, Math.floor(body.mints_current)) : undefined
    const mintsSnapshot = typeof body.mintsSnapshot === 'number' ? Math.max(0, Math.floor(body.mintsSnapshot)) : undefined
    const mintsTransactions = typeof body.mintsTransactions === 'number' ? Math.max(0, Math.floor(body.mintsTransactions)) : undefined
    if (!tenantId) return errorResponse('tenantId required', req)
    if (mints_current === undefined && mintsSnapshot === undefined && mintsTransactions === undefined) {
      return errorResponse('At least one track count (mints_current, mintsSnapshot, mintsTransactions) required', req)
    }

    const SCOPE_KEYS = ['mints_current', 'mintsSnapshot', 'mintsTransactions'] as const
    const updates: Array<{ scopeKey: string; count: number }> = []
    if (mints_current !== undefined) updates.push({ scopeKey: 'mints_current', count: mints_current })
    if (mintsSnapshot !== undefined) updates.push({ scopeKey: 'mintsSnapshot', count: mintsSnapshot })
    if (mintsTransactions !== undefined) updates.push({ scopeKey: 'mintsTransactions', count: mintsTransactions })

    for (const { scopeKey, count } of updates) {
      const { data: existing } = await db
        .from('billing_subscriptions')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('module_id', 'watchtower')
        .eq('scope_key', scopeKey)
        .maybeSingle()

      if (existing) {
        await db
          .from('billing_subscriptions')
          .update({
            conditions_snapshot: { [scopeKey]: count },
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenantId)
          .eq('module_id', 'watchtower')
          .eq('scope_key', scopeKey)
      } else {
        const { data: anyRow } = await db
          .from('billing_subscriptions')
          .select('period_start, period_end, billing_period')
          .eq('tenant_id', tenantId)
          .eq('module_id', 'watchtower')
          .limit(1)
          .maybeSingle()
        const periodEnd = anyRow?.period_end ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        const periodStart = anyRow?.period_start ?? new Date().toISOString()
        const billingPeriod = (anyRow?.billing_period as string) ?? 'monthly'
        await db.from('billing_subscriptions').insert({
          tenant_id: tenantId,
          module_id: 'watchtower',
          scope_key: scopeKey,
          billing_period: billingPeriod,
          recurring_amount_usdc: 0,
          period_start: periodStart,
          period_end: periodEnd,
          conditions_snapshot: { [scopeKey]: count },
          price_snapshot: {},
        })
      }
    }

    await db.from('platform_audit_log').insert({
      actor_wallet: check.wallet,
      action: 'watchtower_tracks_set',
      target_type: 'subscription',
      target_id: `${tenantId}/watchtower`,
      details: { mints_current, mintsSnapshot, mintsTransactions },
    })

    return jsonResponse({ ok: true }, req)
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
