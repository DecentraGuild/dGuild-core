/**
 * Shipment Edge Function.
 * Records executed shipments.
 *
 * Actions:
 *   record-shipment – Persist shipment after successful compress tx (admin).
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getWalletFromAuthHeader } from '../_shared/auth.ts'

async function requireTenantAdmin(
  authHeader: string | null,
  tenantId: string,
  db: ReturnType<typeof getAdminClient>,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const wallet = await getWalletFromAuthHeader(authHeader)
  if (!wallet) {
    return { ok: false, response: new Response(JSON.stringify({ error: 'Unauthenticated' }), { status: 401 }) }
  }
  const { data: tenant } = await db
    .from('tenant_config')
    .select('admins')
    .eq('id', tenantId)
    .maybeSingle()
  const admins = (tenant?.admins as string[]) ?? []
  if (!admins.includes(wallet)) {
    return { ok: false, response: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) }
  }
  return { ok: true }
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

  if (action === 'record-shipment') {
    const tenantId = body.tenantId as string
    const authCheck = await requireTenantAdmin(authHeader, tenantId, db)
    if (!authCheck.ok) return authCheck.response

    const mint = body.mint as string
    const recipientCount = Number(body.recipientCount) || 0
    const totalAmount = Number(body.totalAmount) || 0
    const txSignature = body.txSignature as string
    const createdBy = body.createdBy as string

    if (!tenantId || !mint || !txSignature || !createdBy) {
      return errorResponse('tenantId, mint, txSignature, createdBy required', req)
    }

    const { error } = await db.from('shipment_records').insert({
      tenant_id: tenantId,
      mint,
      recipient_count: recipientCount,
      total_amount: totalAmount,
      tx_signature: txSignature,
      created_by: createdBy,
    })

    if (error) return errorResponse(error.message, req, 500)
    return jsonResponse({ ok: true }, req)
  }

  return errorResponse('Unknown action', req, 400)
})
