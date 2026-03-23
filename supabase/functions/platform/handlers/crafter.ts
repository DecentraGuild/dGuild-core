import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requirePlatformAdmin } from '../../_shared/auth.ts'
import { getSolanaConnection } from '../../_shared/solana-connection.ts'
import { PublicKey } from 'npm:@solana/web3.js@1'
import type { getAdminClient } from '../../_shared/supabase-admin.ts'

type Db = ReturnType<typeof getAdminClient>

export async function handleCrafterImportToken(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const tenantId = body.tenantId as string
  const mint = (body.mint as string)?.trim()
  const name = (body.name as string)?.trim() || null
  const symbol = (body.symbol as string)?.trim() || null
  const decimals = typeof body.decimals === 'number' ? body.decimals : 6
  const authority = (body.authority as string)?.trim()

  if (!tenantId || !mint) return errorResponse('tenantId and mint required', req)

  const { data: tenant } = await db.from('tenant_config').select('id, admins').eq('id', tenantId).maybeSingle()
  if (!tenant) return errorResponse('Tenant not found', req, 404)

  const authorityWallet = authority || ((tenant as { admins?: string[] }).admins)?.[0]
  if (!authorityWallet) return errorResponse('authority required (or tenant must have admins)', req)

  let resolvedDecimals = decimals
  try {
    const connection = getSolanaConnection()
    const accountInfo = await connection.getAccountInfo(new PublicKey(mint))
    if (accountInfo?.data && accountInfo.data.length >= 46) {
      resolvedDecimals = (accountInfo.data as Uint8Array)[44]
    }
  } catch { /* use provided */ }

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
    { mint, name: resolvedName, symbol: resolvedSymbol, image: null, decimals: resolvedDecimals, updated_at: nowIso },
    { onConflict: 'mint' },
  )

  await db.from('tenant_mint_catalog').upsert(
    { tenant_id: tenantId, mint, kind: 'SPL', label: resolvedName || resolvedSymbol, updated_at: nowIso },
    { onConflict: 'tenant_id,mint' },
  )

  await db.from('platform_audit_log').insert({
    actor_wallet: check.wallet,
    action: 'crafter_token_imported',
    target_type: 'crafter_token',
    target_id: mint,
    details: { tenant_id: tenantId },
  })

  const { fetchMintMetadata } = await import('../../_shared/mint-metadata.ts')
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

export async function handleCrafterRemoveToken(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const tenantId = body.tenantId as string
  const mint = (body.mint as string)?.trim()
  if (!tenantId || !mint) return errorResponse('tenantId and mint required', req)

  const { error } = await db.from('crafter_tokens').delete().eq('tenant_id', tenantId).eq('mint', mint)
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
