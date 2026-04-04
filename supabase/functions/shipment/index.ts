/**
 * Shipment Edge Function.
 * Records executed shipments.
 *
 * Actions:
 *   record-shipment – Persist shipment after successful compress tx (admin).
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { requireTenantAdmin } from '../_shared/auth.ts'

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
    const leavesRaw = body.leaves

    if (!tenantId || !mint || !txSignature) {
      return errorResponse('tenantId, mint, txSignature required', req)
    }

    if (leavesRaw != null && !Array.isArray(leavesRaw)) {
      return errorResponse('leaves must be an array when provided', req)
    }

    const { data: row, error } = await db
      .from('shipment_records')
      .insert({
        tenant_id: tenantId,
        mint,
        recipient_count: recipientCount,
        total_amount: totalAmount,
        tx_signature: txSignature,
        created_by: authCheck.wallet,
      })
      .select('id')
      .single()

    if (error) return errorResponse(error.message, req, 500)

    const leaves = leavesRaw as Array<Record<string, unknown>> | undefined
    if (leaves && leaves.length > 0) {
      const rows = []
      for (const l of leaves) {
        const recipientWallet = typeof l.recipientWallet === 'string' ? l.recipientWallet.trim() : ''
        const leafHashDecimal =
          typeof l.leafHashDecimal === 'string' ? l.leafHashDecimal.trim() : ''
        const amountRaw = l.amountRaw
        if (!recipientWallet || !leafHashDecimal) {
          return errorResponse('Each leaf needs recipientWallet and leafHashDecimal', req)
        }
        if (
          typeof amountRaw !== 'string' &&
          typeof amountRaw !== 'number' &&
          typeof amountRaw !== 'bigint'
        ) {
          return errorResponse('Each leaf needs amountRaw', req)
        }
        rows.push({
          tenant_id: tenantId,
          shipment_record_id: row.id,
          recipient_wallet: recipientWallet,
          mint,
          leaf_hash_decimal: leafHashDecimal,
          amount_raw: String(amountRaw),
        })
      }
      const { error: leafErr } = await db.from('shipment_compressed_leaves').insert(rows)
      if (leafErr) return errorResponse(leafErr.message, req, 500)
    }

    return jsonResponse({ ok: true }, req)
  }

  return errorResponse('Unknown action', req, 400)
})
