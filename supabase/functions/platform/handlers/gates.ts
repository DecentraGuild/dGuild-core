import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requirePlatformAdmin } from '../../_shared/auth.ts'
import { getSolanaConnection } from '../../_shared/solana-connection.ts'
import { readU32LE, toUint8Array } from '../../_shared/binary.ts'
import { PublicKey } from 'npm:@solana/web3.js@1'
import type { getAdminClient } from '../../_shared/supabase-admin.ts'

type Db = ReturnType<typeof getAdminClient>

export async function handleGateFetchUnbound(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
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

  const { data: bound } = await db.from('tenant_gate_lists').select('address')
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
    } catch { /* ignore */ }
    unbound.push({ address: addr, name: name || addr.slice(0, 8) })
  }

  return jsonResponse({ unbound }, req)
}

export async function handleGateBind(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const tenantId = body.tenantId as string
  const address = (body.address as string)?.trim()
  if (!tenantId || !address) return errorResponse('tenantId and address required', req)

  const { data: existing } = await db.from('tenant_gate_lists').select('tenant_id').eq('address', address).maybeSingle()
  if (existing) {
    return errorResponse(`Gate already assigned to another tenant (${(existing as Record<string, unknown>).tenant_id})`, req, 409)
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
  } catch { /* use defaults */ }

  await db.from('gate_metadata').upsert(
    { address, name, authority, image_url: null, updated_at: new Date().toISOString() },
    { onConflict: 'address' },
  )
  const { error: insertErr } = await db.from('tenant_gate_lists').insert({ tenant_id: tenantId, address })
  if (insertErr) return errorResponse(insertErr.message, req, 500)

  await db.from('platform_audit_log').insert({
    actor_wallet: check.wallet,
    action: 'gate_bound',
    target_type: 'gates',
    target_id: address,
    details: { tenant_id: tenantId },
  })

  // Suppress unused warning
  void WHITELIST_PROGRAM_ID

  return jsonResponse({ ok: true }, req)
}

export async function handleGateUnbind(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const tenantId = body.tenantId as string
  const address = (body.address as string)?.trim()
  if (!tenantId || !address) return errorResponse('tenantId and address required', req)

  const { error } = await db.from('tenant_gate_lists').delete().eq('tenant_id', tenantId).eq('address', address)
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
