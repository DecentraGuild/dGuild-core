/**
 * Gates Edge Function.
 * Handles on-chain gate (whitelist) queries and list management.
 *
 * Actions:
 *   lists-public    – List gate lists for a tenant (public read).
 *   lists           – List gate lists for a tenant (admin).
 *   list-create     – Create a gate list (admin).
 *   list-update     – Update a gate list (admin).
 *   list-delete     – Delete a gate list (admin).
 *   entries         – Get on-chain entries for a gate list (public/admin).
 *   entries-public  – Public entries for a gate (public).
 *   check           – Check if a wallet is on a specific gate (on-chain).
 *   is-listed       – Check if a wallet is on any gate for a tenant (on-chain).
 *   my-memberships  – Get all gate memberships for the connected wallet.
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getWalletFromAuthHeader, requireTenantAdmin } from '../_shared/auth.ts'
import { getSolanaConnection } from '../_shared/solana-connection.ts'
import { Connection, PublicKey } from 'npm:@solana/web3.js@1'

const WHITELIST_PROGRAM_ID = Deno.env.get('WHITELIST_PROGRAM_ID') ?? 'WLSTEvb5PEG1HN6M5HAomdWQ6NyR7zFPwSVbzVJKHDZ'

interface GateEntry {
  wallet: string
}

async function fetchGateEntries(
  connection: Connection,
  listAddress: string,
): Promise<GateEntry[]> {
  try {
    const programId = new PublicKey(WHITELIST_PROGRAM_ID)
    const listPk = new PublicKey(listAddress)

    const accounts = await connection.getProgramAccounts(programId, {
      filters: [
        { memcmp: { offset: 8, bytes: listPk.toBase58() } },
      ],
    })

    const entries: GateEntry[] = []
    for (const { account } of accounts) {
      try {
        const data = account.data as Uint8Array
        if (data.length >= 72) {
          const wallet = new PublicKey(data.slice(40, 72)).toBase58()
          entries.push({ wallet })
        }
      } catch {
        // skip malformed accounts
      }
    }
    return entries
  } catch {
    return []
  }
}

async function isWalletOnList(
  connection: Connection,
  listAddress: string,
  wallet: string,
): Promise<boolean> {
  const entries = await fetchGateEntries(connection, listAddress)
  return entries.some((e) => e.wallet === wallet)
}

interface GateListMetadata {
  address: string
  name: string
  imageUrl?: string | null
}

async function getListsForTenant(
  db: ReturnType<typeof getAdminClient>,
  tenantId: string,
): Promise<GateListMetadata[]> {
  try {
    const { data } = await db
      .from('gate_lists')
      .select('address, name, image_url')
      .eq('tenant_id', tenantId)
    return (data ?? []).map((row) => ({
      address: row.address as string,
      name: row.name as string,
      imageUrl: row.image_url as string | null,
    }))
  } catch {
    return []
  }
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

  if (action === 'lists-public') {
    const tenantId = body.tenantId as string
    if (!tenantId) return errorResponse('tenantId required', req)

    const lists = await getListsForTenant(db, tenantId)
    return jsonResponse({ lists }, req)
  }

  if (action === 'lists') {
    const tenantId = body.tenantId as string
    if (!tenantId) return errorResponse('tenantId required', req)

    const check = await requireTenantAdmin(authHeader, tenantId, db, req)
    if (!check.ok) return check.response

    const lists = await getListsForTenant(db, tenantId)
    return jsonResponse({ lists }, req)
  }

  if (action === 'entries' || action === 'entries-public') {
    const listAddress = body.listAddress as string
    if (!listAddress) return errorResponse('listAddress required', req)

    const connection = getSolanaConnection()
    const entries = await fetchGateEntries(connection, listAddress)
    return jsonResponse({ entries: entries.map((e) => e.wallet) }, req)
  }

  if (action === 'check') {
    const listAddress = body.listAddress as string
    const wallet = body.wallet as string
    if (!listAddress || !wallet) return errorResponse('listAddress and wallet required', req)

    const connection = getSolanaConnection()
    const listed = await isWalletOnList(connection, listAddress, wallet)
    return jsonResponse({ listed }, req)
  }

  if (action === 'is-listed') {
    const tenantId = body.tenantId as string
    const wallet = body.wallet as string
    if (!tenantId || !wallet) return errorResponse('tenantId and wallet required', req)

    const lists = await getListsForTenant(db, tenantId)
    if (lists.length === 0) return jsonResponse({ listed: false }, req)

    const connection = getSolanaConnection()
    for (const list of lists) {
      const listed = await isWalletOnList(connection, list.address, wallet)
      if (listed) return jsonResponse({ listed: true }, req)
    }
    return jsonResponse({ listed: false }, req)
  }

  if (action === 'my-memberships') {
    const tenantId = body.tenantId as string
    if (!tenantId) return errorResponse('tenantId required', req)

    const wallet = await getWalletFromAuthHeader(authHeader)
    if (!wallet) return errorResponse('Unauthenticated', req, 401)

    const lists = await getListsForTenant(db, tenantId)
    const connection = getSolanaConnection()
    const memberships: GateListMetadata[] = []

    for (const list of lists) {
      const listed = await isWalletOnList(connection, list.address, wallet)
      if (listed) memberships.push(list)
    }

    return jsonResponse({ memberships }, req)
  }

  if (action === 'list-create' || action === 'list-update' || action === 'list-delete') {
    const tenantId = body.tenantId as string
    if (!tenantId) return errorResponse('tenantId required', req)

    const check = await requireTenantAdmin(authHeader, tenantId, db, req)
    if (!check.ok) return check.response

    const { data: tenant } = await db.from('tenant_config').select('id').eq('id', tenantId).maybeSingle()

    if (action === 'list-create') {
      const { data: created, error } = await db.from('gate_lists').insert({
        tenant_id: tenant?.id ?? tenantId,
        address: body.address,
        name: body.name,
        authority: (body.authority as string) ?? '',
        image_url: body.imageUrl ?? null,
      }).select().single()
      if (error) return errorResponse(error.message, req, 500)
      return jsonResponse({ list: created }, req)
    }

    if (action === 'list-update') {
      const address = body.address as string
      const { data: updated, error } = await db.from('gate_lists')
        .update({ name: body.name, image_url: body.imageUrl ?? null })
        .eq('address', address)
        .eq('tenant_id', tenant?.id ?? tenantId)
        .select().single()
      if (error) return errorResponse(error.message, req, 500)
      return jsonResponse({ list: updated }, req)
    }

    if (action === 'list-delete') {
      const address = body.address as string
      await db.from('gate_lists').delete().eq('address', address).eq('tenant_id', tenant?.id ?? tenantId)
      return jsonResponse({ ok: true }, req)
    }
  }

  return errorResponse(`Unknown action: ${action}`, req, 400)
})
