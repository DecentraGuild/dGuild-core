import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requirePlatformAdmin, requireTenantAdmin } from '../../_shared/auth.ts'
import { getSolanaConnection } from '../../_shared/solana-connection.ts'
import { readU32LE, toUint8Array } from '../../_shared/binary.ts'
import { PublicKey } from 'npm:@solana/web3.js@1'
import type { getAdminClient } from '../../_shared/supabase-admin.ts'

type Db = ReturnType<typeof getAdminClient>

export async function handleRaffleFetchUnbound(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
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
    } catch { /* ignore */ }
    unbound.push({ rafflePubkey: addr, name: name || addr.slice(0, 8) })
  }

  return jsonResponse({ unbound }, req)
}

export async function handleRaffleBind(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const tenantId = body.tenantId as string
  const rafflePubkey = (body.rafflePubkey as string)?.trim()
  if (!tenantId || !rafflePubkey) return errorResponse('tenantId and rafflePubkey required', req)

  const { data: existing } = await db.from('tenant_raffles').select('tenant_id').eq('raffle_pubkey', rafflePubkey).maybeSingle()
  if (existing) {
    return errorResponse(`Raffle already assigned to another tenant (${(existing as Record<string, unknown>).tenant_id})`, req, 409)
  }

  const { error } = await db.from('tenant_raffles').insert({ tenant_id: tenantId, raffle_pubkey: rafflePubkey })
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

export async function handleRaffleBindTenant(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const tenantId = body.tenantId as string
  const rafflePubkey = (body.rafflePubkey as string)?.trim()
  if (!tenantId || !rafflePubkey) return errorResponse('tenantId and rafflePubkey required', req)

  const check = await requireTenantAdmin(authHeader, tenantId, db)
  if (!check.ok) return check.response

  const { data: existing } = await db.from('tenant_raffles').select('tenant_id').eq('raffle_pubkey', rafflePubkey).maybeSingle()
  if (existing) {
    return errorResponse(`Raffle already assigned to another tenant (${(existing as Record<string, unknown>).tenant_id})`, req, 409)
  }

  const { error } = await db.from('tenant_raffles').insert({ tenant_id: tenantId, raffle_pubkey: rafflePubkey })
  if (error) return errorResponse(error.message, req, 500)

  return jsonResponse({ ok: true }, req)
}

export async function handleRaffleCloseTenant(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const tenantId = body.tenantId as string
  const rafflePubkey = (body.rafflePubkey as string)?.trim()
  if (!tenantId || !rafflePubkey) return errorResponse('tenantId and rafflePubkey required', req)

  const check = await requireTenantAdmin(authHeader, tenantId, db)
  if (!check.ok) return check.response

  const { data: row, error: selErr } = await db
    .from('tenant_raffles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('raffle_pubkey', rafflePubkey)
    .maybeSingle()
  if (selErr) return errorResponse(selErr.message, req, 500)
  if (!row) return errorResponse('Raffle not found for this tenant', req, 404)

  const { error } = await db
    .from('tenant_raffles')
    .update({ closed_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('raffle_pubkey', rafflePubkey)
  if (error) return errorResponse(error.message, req, 500)

  return jsonResponse({ ok: true }, req)
}

export async function handleRaffleUnbind(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const tenantId = body.tenantId as string
  const rafflePubkey = (body.rafflePubkey as string)?.trim()
  if (!tenantId || !rafflePubkey) return errorResponse('tenantId and rafflePubkey required', req)

  const { error } = await db.from('tenant_raffles').delete().eq('tenant_id', tenantId).eq('raffle_pubkey', rafflePubkey)
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
