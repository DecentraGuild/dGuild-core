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
 *   entries-public  – Public entries (list must belong to tenantId).
 *   check           – Check if a wallet is on a specific gate (on-chain).
 *   is-listed       – Check if a wallet is on any gate for a tenant (on-chain).
 *   my-memberships  – Get all gate memberships for the connected wallet.
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getWalletFromAuthHeader, requireTenantAdmin } from '../_shared/auth.ts'
import { getSolanaConnection } from '../_shared/solana-connection.ts'
import { fetchGateEntries, isWalletOnList } from '../_shared/gates.ts'

interface GateListMetadata {
  address: string
  name: string
  imageUrl?: string | null
  isPrimary?: boolean
}

async function getListsForTenant(
  db: ReturnType<typeof getAdminClient>,
  tenantId: string,
): Promise<{ lists: GateListMetadata[]; dbError: string | null }> {
  const { data, error } = await db
    .from('gate_lists')
    .select('address, name, image_url, is_primary')
    .eq('tenant_id', tenantId)
  if (error) return { lists: [], dbError: error.message }
  return {
    lists: (data ?? []).map((row) => ({
      address: row.address as string,
      name: row.name as string,
      imageUrl: row.image_url as string | null,
      isPrimary: row.is_primary === true,
    })),
    dbError: null,
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
    const tenantId = (body.tenantId as string)?.trim()
    if (!tenantId) return errorResponse('tenantId required', req)

    const { lists, dbError } = await getListsForTenant(db, tenantId)
    if (dbError) return errorResponse(dbError, req, 500)
    return jsonResponse({ lists }, req)
  }

  if (action === 'lists') {
    const tenantId = (body.tenantId as string)?.trim()
    if (!tenantId) return errorResponse('tenantId required', req)

    const check = await requireTenantAdmin(authHeader, tenantId, db, req)
    if (!check.ok) return check.response

    const { lists, dbError } = await getListsForTenant(db, tenantId)
    if (dbError) return errorResponse(dbError, req, 500)
    return jsonResponse({ lists }, req)
  }

  if (action === 'entries' || action === 'entries-public') {
    const listAddress = (body.listAddress as string)?.trim()
    if (!listAddress) return errorResponse('listAddress required', req)

    if (action === 'entries-public') {
      const tenantId = (body.tenantId as string)?.trim()
      if (!tenantId) return errorResponse('tenantId required', req)
      const { data: row, error: rowErr } = await db
        .from('gate_lists')
        .select('address')
        .eq('tenant_id', tenantId)
        .eq('address', listAddress)
        .maybeSingle()
      if (rowErr) return errorResponse(rowErr.message, req, 500)
      if (!row) return errorResponse('List not found for this tenant', req, 404)
    }

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
    const tenantId = (body.tenantId as string)?.trim()
    const wallet = (body.wallet as string)?.trim()
    if (!tenantId || !wallet) return errorResponse('tenantId and wallet required', req)

    const { lists, dbError } = await getListsForTenant(db, tenantId)
    if (dbError) return errorResponse(dbError, req, 500)
    if (lists.length === 0) return jsonResponse({ listed: false }, req)

    const connection = getSolanaConnection()
    const flags = await Promise.all(lists.map((list) => isWalletOnList(connection, list.address, wallet)))
    if (flags.some(Boolean)) return jsonResponse({ listed: true }, req)
    return jsonResponse({ listed: false }, req)
  }

  if (action === 'my-memberships') {
    const tenantId = (body.tenantId as string)?.trim()
    if (!tenantId) return errorResponse('tenantId required', req)

    const wallet = await getWalletFromAuthHeader(authHeader)
    if (!wallet) return errorResponse('Unauthenticated', req, 401)

    const { lists, dbError } = await getListsForTenant(db, tenantId)
    if (dbError) return errorResponse(dbError, req, 500)
    const connection = getSolanaConnection()
    const flags = await Promise.all(lists.map((list) => isWalletOnList(connection, list.address, wallet)))
    const memberships = lists.filter((_, i) => flags[i])

    return jsonResponse({ memberships }, req)
  }

  if (action === 'list-create' || action === 'list-update' || action === 'list-delete') {
    const tenantId = (body.tenantId as string)?.trim()
    if (!tenantId) return errorResponse('tenantId required', req)

    const check = await requireTenantAdmin(authHeader, tenantId, db, req)
    if (!check.ok) return check.response

    const { data: tenant } = await db.from('tenant_config').select('id').eq('id', tenantId).maybeSingle()

    if (action === 'list-create') {
      const isPrimary = body.isPrimary === true
      if (isPrimary) {
        await db
          .from('tenant_gate_lists')
          .update({ is_primary: false })
          .eq('tenant_id', tenant?.id ?? tenantId)
          .eq('is_primary', true)
      }
      const { data: created, error } = await db.from('gate_lists').insert({
        tenant_id: tenant?.id ?? tenantId,
        address: body.address,
        name: body.name,
        authority: (body.authority as string) ?? '',
        image_url: body.imageUrl ?? null,
        is_primary: isPrimary,
      }).select().single()
      if (error) return errorResponse(error.message, req, 500)
      return jsonResponse({ list: created }, req)
    }

    if (action === 'list-update') {
      const address = body.address as string
      const tid = tenant?.id ?? tenantId
      const isPrimary = body.isPrimary as boolean | undefined
      if (isPrimary === true) {
        await db
          .from('tenant_gate_lists')
          .update({ is_primary: false })
          .eq('tenant_id', tid)
          .eq('is_primary', true)
      }
      const updatePayload: Record<string, unknown> = {
        name: body.name,
        image_url: body.imageUrl ?? null,
      }
      if (isPrimary !== undefined) updatePayload.is_primary = isPrimary
      const { data: updated, error } = await db.from('gate_lists')
        .update(updatePayload)
        .eq('address', address)
        .eq('tenant_id', tid)
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
