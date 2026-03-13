/**
 * Crafter Edge Function. 3-stage flow: create mint+billing → add metadata → mint/burn/edit.
 *
 * Actions:
 *   create         – Store pending, return memo + amountUsdc + recipientAta
 *   confirm        – Verify tx, create billing_payments, insert crafter_tokens
 *   list           – List tokens for tenant
 *   remove         – Remove token from crafter_tokens (after user closed their ATA)
 *   prepare-metadata – Upload metadata JSON to dGuild storage, return URI
 *   publish-metadata – Record metadata URI after CreateMetadataAccountV3
 *   update-metadata – Sync crafter_tokens + mint_metadata + tenant_mint_catalog
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getWalletFromAuthHeader } from '../_shared/auth.ts'
import { verifyBillingPayment, BILLING_WALLET_ATA } from '../_shared/billing-verify.ts'
import { getModuleCatalogEntry } from '@decentraguild/config'

const PENDING_EXPIRY_MINUTES = 15

const CRAFTER_FALLBACK_USDC = 5

function getCrafterAmountUsdc(): number {
  const catalogEntry = getModuleCatalogEntry('crafter')
  const pricing = catalogEntry?.pricing as { pricePerUnit?: number } | null
  return pricing?.pricePerUnit ?? CRAFTER_FALLBACK_USDC
}

function generateMemo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return `dg:${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

async function requireTenantAdmin(
  authHeader: string | null,
  tenantId: string,
  req: Request,
): Promise<{ ok: true; wallet: string } | { ok: false; response: Response }> {
  const wallet = await getWalletFromAuthHeader(authHeader)
  if (!wallet) {
    return { ok: false, response: errorResponse('Not signed in. Connect your wallet and sign in first.', req, 401) }
  }

  const db = getAdminClient()
  const { data: tenant, error } = await db
    .from('tenant_config')
    .select('admins')
    .eq('id', tenantId)
    .maybeSingle()

  if (error || !tenant) {
    return { ok: false, response: errorResponse('Tenant not found', req, 404) }
  }

  const admins = tenant.admins as string[]
  const isAdmin = Array.isArray(admins) && admins.some((a) => String(a).toLowerCase() === wallet.toLowerCase())
  if (!isAdmin) {
    return { ok: false, response: errorResponse('Tenant admin only', req, 403) }
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
  const tenantId = (body.tenantId as string)?.trim()
  if (!tenantId) return errorResponse('tenantId required', req)

  const check = await requireTenantAdmin(authHeader, tenantId, req)
  if (!check.ok) return check.response
  const adminWallet = check.wallet

  const db = getAdminClient()
  const now = new Date()
  const nowIso = now.toISOString()

  // ---------------------------------------------------------------------------
  // prepare-metadata – upload metadata JSON to dGuild storage, return public URI
  // ---------------------------------------------------------------------------
  if (action === 'prepare-metadata') {
    const name = (body.name as string)?.trim()
    const symbol = (body.symbol as string)?.trim()
    const decimals = typeof body.decimals === 'number' ? body.decimals : 6
    const description = (body.description as string)?.trim() || ''
    const imageUrl = (body.imageUrl as string)?.trim() || ''
    const sellerFeeBasisPoints = Math.max(0, Math.min(10000, typeof body.sellerFeeBasisPoints === 'number' ? body.sellerFeeBasisPoints : 0))

    if (!name || !symbol) return errorResponse('name and symbol required', req)

    const metadataJson = {
      name,
      symbol,
      description,
      image: imageUrl || undefined,
      seller_fee_basis_points: sellerFeeBasisPoints,
      external_url: '',
      attributes: [],
      properties: { files: [], category: 'token' },
      decentraguild: {
        tenantId,
        createdVia: 'crafter',
        version: 1,
      },
    }

    const uuid = crypto.randomUUID()
    const path = `${tenantId}/${uuid}.json`
    const { data: uploadData, error: uploadErr } = await db.storage
      .from('crafter-metadata')
      .upload(path, JSON.stringify(metadataJson), {
        contentType: 'application/json',
        upsert: false,
      })

    if (uploadErr) return errorResponse(uploadErr.message, req, 500)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '') ?? ''
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/crafter-metadata/${path}`

    return jsonResponse({ metadataUri: publicUrl }, req)
  }

  // ---------------------------------------------------------------------------
  // create – store pending, return memo + recipientAta (stage 1: mint + billing only)
  // ---------------------------------------------------------------------------
  if (action === 'create') {
    const mint = (body.mint as string)?.trim()
    const name = (body.name as string)?.trim() || null
    const symbol = (body.symbol as string)?.trim() || null
    const decimals = typeof body.decimals === 'number' ? body.decimals : 6

    if (!mint) return errorResponse('mint required', req)
    if (!name || !symbol) return errorResponse('name and symbol required', req)

    const memo = generateMemo()
    const expiresAt = new Date(now.getTime() + PENDING_EXPIRY_MINUTES * 60 * 1000)

    const metadataJson = { name, symbol, decimals }

    const { error: insertErr } = await db.from('crafter_pending').insert({
      tenant_id: tenantId,
      mint,
      memo,
      metadata_json: metadataJson,
      authority: adminWallet,
      expires_at: expiresAt.toISOString(),
    })

    if (insertErr) return errorResponse(insertErr.message, req, 500)

    const amountUsdc = getCrafterAmountUsdc()

    return jsonResponse(
      {
        memo,
        amountUsdc,
        recipientAta: BILLING_WALLET_ATA.toBase58(),
      },
      req,
    )
  }

  // ---------------------------------------------------------------------------
  // confirm – verify tx, create billing_payments, insert crafter_tokens, upsert address book
  // ---------------------------------------------------------------------------
  if (action === 'confirm') {
    const mint = (body.mint as string)?.trim()
    const txSignature = (body.txSignature as string)?.trim()
    const memo = (body.memo as string)?.trim()

    if (!mint || !txSignature || !memo) {
      return errorResponse('mint, txSignature, memo required', req)
    }

    const { data: pending, error: pendingErr } = await db
      .from('crafter_pending')
      .select('*')
      .eq('mint', mint)
      .eq('memo', memo)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (pendingErr || !pending) {
      return errorResponse('Pending record not found or expired', req, 404)
    }

    const expiresAt = new Date((pending as { expires_at: string }).expires_at)
    if (expiresAt < now) {
      return errorResponse('Pending record expired', req, 410)
    }

    const meta = (pending as { metadata_json: Record<string, unknown> }).metadata_json
    const amountUsdc = getCrafterAmountUsdc()
    const ver = await verifyBillingPayment({
      txSignature,
      expectedAmountUsdc: amountUsdc,
      expectedMemo: memo,
    })

    if (!ver.valid) return errorResponse(ver.error ?? 'Payment verification failed', req, 400)

    const periodStart = now
    const periodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)

    const { data: payment, error: payErr } = await db
      .from('billing_payments')
      .insert({
        tenant_id: tenantId,
        module_id: 'crafter',
        scope_key: '',
        payment_type: 'add_unit',
        amount_usdc: amountUsdc,
        billing_period: 'monthly',
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        tx_signature: txSignature,
        status: 'confirmed',
        memo,
        payer_wallet: adminWallet,
        conditions_snapshot: { tokensCount: 1 },
        price_snapshot: { oneTimeTotal: amountUsdc },
        created_at: nowIso,
        confirmed_at: nowIso,
        expires_at: expiresAt.toISOString(),
      })
      .select('id')
      .single()

    if (payErr || !payment) return errorResponse(payErr?.message ?? 'Failed to create payment record', req, 500)

    const paymentId = (payment as { id: string }).id
    const name = (meta.name as string) ?? ''
    const symbol = (meta.symbol as string) ?? ''
    const decimals = (meta.decimals as number) ?? 6

    const { error: tokenErr } = await db.from('crafter_tokens').insert({
      tenant_id: tenantId,
      mint,
      billing_payment_id: paymentId,
      name,
      symbol,
      decimals,
      description: null,
      image_url: null,
      metadata_uri: '',
      storage_backend: 'api',
      authority: adminWallet,
    })

    if (tokenErr) return errorResponse(tokenErr.message, req, 500)

    await db.from('mint_metadata').upsert(
      {
        mint,
        name,
        symbol,
        image: null,
        decimals,
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
          label: name || symbol,
          updated_at: nowIso,
        },
        { onConflict: 'tenant_id,mint' },
      )

    await db.from('crafter_pending').delete().eq('mint', mint).eq('memo', memo)

    return jsonResponse({ success: true, mint }, req)
  }

  // ---------------------------------------------------------------------------
  // list – tokens for tenant
  // ---------------------------------------------------------------------------
  if (action === 'list') {
    const { data: rows, error } = await db
      .from('crafter_tokens')
      .select('id, mint, name, symbol, decimals, description, image_url, metadata_uri, authority, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) return errorResponse(error.message, req, 500)
    return jsonResponse({ tokens: rows ?? [] }, req)
  }

  // ---------------------------------------------------------------------------
  // remove – delete token from crafter_tokens (call after user closed their ATA)
  // ---------------------------------------------------------------------------
  if (action === 'remove') {
    const mint = (body.mint as string)?.trim()
    if (!mint) return errorResponse('mint required', req)

    const { error: delErr } = await db
      .from('crafter_tokens')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('mint', mint)

    if (delErr) return errorResponse(delErr.message, req, 500)
    return jsonResponse({ success: true }, req)
  }

  // ---------------------------------------------------------------------------
  // publish-metadata – stage 2: record metadata URI after CreateMetadataAccountV3 tx
  // ---------------------------------------------------------------------------
  if (action === 'publish-metadata') {
    const mint = (body.mint as string)?.trim()
    const metadataUri = (body.metadataUri as string)?.trim()
    const nameOverride = (body.name as string)?.trim() || null
    const symbolOverride = (body.symbol as string)?.trim() || null
    const description = (body.description as string)?.trim() || null
    const imageUrl = (body.imageUrl as string)?.trim() || null
    const sellerFeeBasisPoints = Math.max(0, Math.min(10000, typeof body.sellerFeeBasisPoints === 'number' ? body.sellerFeeBasisPoints : 0))

    if (!mint) return errorResponse('mint required', req)
    if (!metadataUri) return errorResponse('metadataUri required', req)

    const { data: token, error: fetchErr } = await db
      .from('crafter_tokens')
      .select('name, symbol')
      .eq('tenant_id', tenantId)
      .eq('mint', mint)
      .maybeSingle()

    if (fetchErr || !token) return errorResponse('Token not found', req, 404)

    const name = nameOverride ?? (token as { name: string }).name ?? ''
    const symbol = symbolOverride ?? (token as { symbol: string }).symbol ?? ''

    const updatePayload: Record<string, unknown> = {
      metadata_uri: metadataUri,
      description,
      image_url: imageUrl,
      updated_at: nowIso,
    }
    if (nameOverride != null) updatePayload.name = nameOverride
    if (symbolOverride != null) updatePayload.symbol = symbolOverride

    const { error: updateErr } = await db
      .from('crafter_tokens')
      .update(updatePayload)
      .eq('tenant_id', tenantId)
      .eq('mint', mint)

    if (updateErr) return errorResponse(updateErr.message, req, 500)

    await db.from('mint_metadata').upsert(
      { mint, name, symbol, image: imageUrl, updated_at: nowIso },
      { onConflict: 'mint' },
    )

    await db
      .from('tenant_mint_catalog')
      .upsert(
        { tenant_id: tenantId, mint, kind: 'SPL', label: name || symbol, updated_at: nowIso },
        { onConflict: 'tenant_id,mint' },
      )

    return jsonResponse({ success: true }, req)
  }

  // ---------------------------------------------------------------------------
  // update-metadata – stage 3: update crafter_tokens and sync mint_metadata + tenant_mint_catalog
  // ---------------------------------------------------------------------------
  if (action === 'update-metadata') {
    const mint = (body.mint as string)?.trim()
    const name = (body.name as string)?.trim()
    const symbol = (body.symbol as string)?.trim()
    const imageUrl = (body.imageUrl as string)?.trim()
    const metadataUri = (body.metadataUri as string)?.trim()

    if (!mint) return errorResponse('mint required', req)

    const { data: token, error: fetchErr } = await db
      .from('crafter_tokens')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('mint', mint)
      .maybeSingle()

    if (fetchErr || !token) return errorResponse('Token not found', req, 404)

    const updates: Record<string, unknown> = { updated_at: nowIso }
    if (name !== undefined) updates.name = name || null
    if (symbol !== undefined) updates.symbol = symbol || null
    if (imageUrl !== undefined) updates.image_url = imageUrl || null
    if (metadataUri !== undefined) updates.metadata_uri = metadataUri || null

    const { error: updateErr } = await db
      .from('crafter_tokens')
      .update(updates)
      .eq('tenant_id', tenantId)
      .eq('mint', mint)

    if (updateErr) return errorResponse(updateErr.message, req, 500)

    const finalName = (updates.name as string) ?? (token as { name: string }).name
    const finalSymbol = (updates.symbol as string) ?? (token as { symbol: string }).symbol
    const finalImage = (updates.image_url as string) ?? (token as { image_url: string }).image_url

    await db.from('mint_metadata').upsert(
      {
        mint,
        name: finalName,
        symbol: finalSymbol,
        image: finalImage,
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
          label: finalName || finalSymbol,
          updated_at: nowIso,
        },
        { onConflict: 'tenant_id,mint' },
      )

    return jsonResponse({ success: true }, req)
  }

  return errorResponse(`Unknown action: ${action}`, req, 400)
})
