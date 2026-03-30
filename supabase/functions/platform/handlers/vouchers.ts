import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requirePlatformAdmin } from '../../_shared/auth.ts'
import { getSolanaConnection } from '../../_shared/solana-connection.ts'
import { PublicKey } from 'npm:@solana/web3.js@1'
import { TOKEN_PROGRAM_ID } from 'npm:@solana/spl-token@0.4'
import type { getAdminClient } from '../../_shared/supabase-admin.ts'

type Db = ReturnType<typeof getAdminClient>

const SPL_TOKEN_ACCOUNT_DATA_SIZE = 165

export async function handleVoucherPrepareMetadata(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
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

  const decentraguild: Record<string, unknown> = { createdVia: 'voucher', type: voucherType, version: 1 }
  if (voucherType === 'bundle' && bundleId) decentraguild.bundleId = bundleId

  const metadataJson = {
    name, symbol, description: '', image: imageUrl ?? undefined,
    seller_fee_basis_points: sellerFeeBasisPoints,
    external_url: '', attributes: [], properties: { files: [], category: 'token' }, decentraguild,
  }

  const uuid = crypto.randomUUID()
  const path = `${uuid}.json`
  const { error: uploadErr } = await db.storage.from('voucher-metadata').upload(path, JSON.stringify(metadataJson), {
    contentType: 'application/json', upsert: false,
  })
  if (uploadErr) return errorResponse(uploadErr.message, req, 500)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '') ?? ''
  return jsonResponse({ metadataUri: `${supabaseUrl}/storage/v1/object/public/voucher-metadata/${path}` }, req)
}

export async function handleVoucherRegisterDraft(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const mint = (body.mint as string)?.trim()
  if (!mint) return errorResponse('mint required', req)

  const { error } = await db.from('voucher_drafts').insert({ mint, actor_wallet: check.wallet })
  if (error) {
    if (error.code === '23505') return errorResponse('Mint already registered', req, 409)
    return errorResponse(error.message, req, 500)
  }
  return jsonResponse({ ok: true, mint }, req)
}

export async function handleVoucherList(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const { data: drafts } = await db.from('voucher_drafts').select('mint, created_at').order('created_at', { ascending: false })
  const { data: bundleRows } = await db.from('bundle_vouchers').select('token_mint, bundle_id')
  const { data: indRows } = await db.from('individual_vouchers').select('mint, label')

  const linked = [
    ...(bundleRows ?? []).map((r) => ({ mint: (r as { token_mint: string }).token_mint, type: 'bundle' as const, bundleId: (r as { bundle_id: string }).bundle_id })),
    ...(indRows ?? []).map((r) => ({ mint: (r as { mint: string }).mint, type: 'individual' as const, label: (r as { label: string | null }).label })),
  ]

  return jsonResponse({ drafts: drafts ?? [], linked }, req)
}

export async function handleVoucherRemoveDraft(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const mint = (body.mint as string)?.trim()
  if (!mint) return errorResponse('mint required', req)

  await db.from('voucher_drafts').delete().eq('mint', mint)
  return jsonResponse({ ok: true }, req)
}

export async function handleVoucherCreateBundle(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const mint = (body.mint as string)?.trim()
  const bundleId = (body.bundleId as string)?.trim()
  const tokensRequired = typeof body.tokensRequired === 'number' ? body.tokensRequired : Number(body.tokensRequired) || 1
  const maxRedemptionsPerTenant = body.maxRedemptionsPerTenant != null
    ? (typeof body.maxRedemptionsPerTenant === 'number' ? body.maxRedemptionsPerTenant : Number(body.maxRedemptionsPerTenant))
    : null

  if (!mint || !bundleId) return errorResponse('mint and bundleId required', req)

  const { data: bundle } = await db.from('bundles').select('id').eq('id', bundleId).maybeSingle()
  if (!bundle) return errorResponse('Bundle not found', req, 404)

  const { error } = await db.from('bundle_vouchers').insert({
    bundle_id: bundleId, token_mint: mint, decimals: 0,
    tokens_required: tokensRequired, max_redemptions_per_tenant: maxRedemptionsPerTenant,
  })
  if (error) {
    if (error.code === '23505') return errorResponse('Voucher already linked to this bundle', req, 409)
    return errorResponse(error.message, req, 500)
  }

  await db.from('platform_audit_log').insert({
    actor_wallet: check.wallet, action: 'voucher_bundle_created',
    target_type: 'bundle_voucher', target_id: mint, details: { bundleId, tokensRequired },
  })
  await db.from('voucher_drafts').delete().eq('mint', mint)

  return jsonResponse({ ok: true, mint }, req)
}

export async function handleVoucherCreateIndividual(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const mint = (body.mint as string)?.trim()
  const label = (body.label as string)?.trim() || null
  const maxRedemptionsPerTenant = body.maxRedemptionsPerTenant != null
    ? (typeof body.maxRedemptionsPerTenant === 'number' ? body.maxRedemptionsPerTenant : Number(body.maxRedemptionsPerTenant))
    : null
  const entitlements = body.entitlements as Array<{ meter_key: string; quantity: number; duration_days: number }>

  if (!mint) return errorResponse('mint required', req)
  if (!Array.isArray(entitlements) || entitlements.length === 0) return errorResponse('entitlements array with at least one item required', req)

  const { error: voucherErr } = await db.from('individual_vouchers').insert({ mint, max_redemptions_per_tenant: maxRedemptionsPerTenant, label })
  if (voucherErr) {
    if (voucherErr.code === '23505') return errorResponse('Voucher mint already exists', req, 409)
    return errorResponse(voucherErr.message, req, 500)
  }

  const rows = entitlements.filter((e) => e.meter_key?.trim()).map((e) => ({
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
    actor_wallet: check.wallet, action: 'voucher_individual_created',
    target_type: 'individual_voucher', target_id: mint, details: { label, entitlementsCount: rows.length },
  })
  await db.from('voucher_drafts').delete().eq('mint', mint)

  return jsonResponse({ ok: true, mint }, req)
}

export async function handleIndividualVoucherGet(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const mint = (body.mint as string)?.trim()
  if (!mint) return errorResponse('mint required', req)

  const { data: voucher, error: vErr } = await db.from('individual_vouchers').select('mint, label, max_redemptions_per_tenant').eq('mint', mint).single()
  if (vErr || !voucher) return errorResponse('Individual voucher not found', req, 404)

  const { data: entitlements, error: eErr } = await db.from('individual_voucher_entitlements').select('meter_key, quantity, duration_days').eq('mint', mint)
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

export async function handleBundleVoucherGet(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const mint = (body.mint as string)?.trim()
  if (!mint) return errorResponse('mint required', req)

  const { data: bv, error: bvErr } = await db.from('bundle_vouchers').select('bundle_id, token_mint, tokens_required, max_redemptions_per_tenant').eq('token_mint', mint).single()
  if (bvErr || !bv) return errorResponse('Bundle voucher not found', req, 404)

  const { data: bundle } = await db.from('bundles').select('id, label, product_key').eq('id', (bv as { bundle_id: string }).bundle_id).single()

  return jsonResponse({
    voucher: {
      mint: (bv as { token_mint: string }).token_mint,
      bundle_id: (bv as { bundle_id: string }).bundle_id,
      tokens_required: Number((bv as { tokens_required: number }).tokens_required),
      max_redemptions_per_tenant: (bv as { max_redemptions_per_tenant: number | null }).max_redemptions_per_tenant,
    },
    bundle: bundle ? {
      id: (bundle as { id: string }).id,
      label: (bundle as { label: string }).label,
      product_key: (bundle as { product_key: string }).product_key,
    } : null,
  }, req)
}

export async function handleIndividualVoucherUpdate(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
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
      const rows = entitlements.filter((e) => e.meter_key?.trim()).map((e) => ({
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

export async function handleBundleVoucherUpdate(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
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

export async function handleVoucherDetail(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const mint = (body.mint as string)?.trim()
  if (!mint) return errorResponse('mint required', req)

  const { data: bv } = await db.from('bundle_vouchers').select('bundle_id, token_mint, tokens_required, max_redemptions_per_tenant').eq('token_mint', mint).maybeSingle()

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
      const { data: payments } = await db.from('billing_payments').select('id, payer_wallet, status').in('id', paymentIds)
      for (const p of payments ?? []) {
        const row = p as { id: string; payer_wallet: string; status: string }
        paymentsMap.set(row.id, { payer_wallet: row.payer_wallet, status: row.status })
      }
    }

    const redemptionsList = (redemptions ?? []).map((r) => {
      const row = r as { tenant_id: string; voucher_mint: string; bundle_id: string; quantity: number; redeemed_at: string; payment_id: string }
      const pay = paymentsMap.get(row.payment_id)
      return { tenant_id: row.tenant_id, voucher_mint: row.voucher_mint, bundle_id: row.bundle_id, quantity: Number(row.quantity), redeemed_at: row.redeemed_at, payer_wallet: pay?.payer_wallet ?? null, status: pay?.status ?? null }
    })

    return jsonResponse({
      type: 'bundle',
      voucher: { mint: bvRow.token_mint, bundle_id: bvRow.bundle_id, tokens_required: Number(bvRow.tokens_required), max_redemptions_per_tenant: bvRow.max_redemptions_per_tenant },
      bundle: bundle ? { id: (bundle as { id: string }).id, label: (bundle as { label: string }).label, product_key: (bundle as { product_key: string }).product_key } : null,
      redemptions: redemptionsList,
    }, req)
  }

  const { data: iv } = await db.from('individual_vouchers').select('mint, label, max_redemptions_per_tenant').eq('mint', mint).maybeSingle()

  if (iv) {
    const ivRow = iv as { mint: string; label: string | null; max_redemptions_per_tenant: number | null }
    const { data: entitlements } = await db.from('individual_voucher_entitlements').select('meter_key, quantity, duration_days').eq('mint', mint)

    const { data: redemptions } = await db
      .from('individual_voucher_redemptions')
      .select('tenant_id, voucher_mint, quantity, redeemed_at, payment_id')
      .eq('voucher_mint', mint)
      .order('redeemed_at', { ascending: false })
      .limit(200)

    const paymentIds = [...new Set((redemptions ?? []).map((r) => (r as { payment_id: string }).payment_id))]
    const paymentsMap = new Map<string, { payer_wallet: string; status: string }>()
    if (paymentIds.length > 0) {
      const { data: payments } = await db.from('billing_payments').select('id, payer_wallet, status').in('id', paymentIds)
      for (const p of payments ?? []) {
        const row = p as { id: string; payer_wallet: string; status: string }
        paymentsMap.set(row.id, { payer_wallet: row.payer_wallet, status: row.status })
      }
    }

    const redemptionsList = (redemptions ?? []).map((r) => {
      const row = r as { tenant_id: string; voucher_mint: string; quantity: number; redeemed_at: string; payment_id: string }
      const pay = paymentsMap.get(row.payment_id)
      return { tenant_id: row.tenant_id, voucher_mint: row.voucher_mint, quantity: Number(row.quantity), redeemed_at: row.redeemed_at, payer_wallet: pay?.payer_wallet ?? null, status: pay?.status ?? null }
    })

    return jsonResponse({
      type: 'individual',
      voucher: { mint: ivRow.mint, label: ivRow.label, max_redemptions_per_tenant: ivRow.max_redemptions_per_tenant },
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

/** After on-chain Metaplex metadata update, persist name/symbol/image so tenant admin voucher UI resolves labels without address book. */
export async function handleVoucherSyncMintMetadata(
  body: Record<string, unknown>,
  db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const mint = (body.mint as string)?.trim()
  if (!mint) return errorResponse('mint required', req)

  const [{ data: bv }, { data: iv }] = await Promise.all([
    db.from('bundle_vouchers').select('token_mint').eq('token_mint', mint).maybeSingle(),
    db.from('individual_vouchers').select('mint').eq('mint', mint).maybeSingle(),
  ])
  if (!bv && !iv) return errorResponse('Mint is not a registered voucher', req, 404)

  const nameIn = (body.name as string)?.trim()
  const symbolIn = (body.symbol as string)?.trim()
  const imageIn = typeof body.image === 'string' ? body.image.trim() : ''
  const image = imageIn.length > 0 ? imageIn : null

  const { data: existing } = await db.from('mint_metadata').select('*').eq('mint', mint).maybeSingle()
  const ex = (existing ?? {}) as Record<string, unknown>
  const now = new Date().toISOString()

  const name = nameIn && nameIn.length > 0 ? nameIn : ((ex.name as string | null | undefined) ?? null)
  const symbol = symbolIn && symbolIn.length > 0 ? symbolIn : ((ex.symbol as string | null | undefined) ?? null)
  const imageMerged = image ?? ((ex.image as string | null | undefined) ?? null)

  await db.from('mint_metadata').upsert(
    {
      mint,
      name,
      symbol,
      image: imageMerged,
      decimals: typeof ex.decimals === 'number' ? ex.decimals : 0,
      traits: ex.traits ?? null,
      trait_index: ex.trait_index ?? null,
      seller_fee_basis_points: ex.seller_fee_basis_points ?? null,
      update_authority: ex.update_authority ?? null,
      uri: ex.uri ?? null,
      primary_sale_happened: ex.primary_sale_happened ?? null,
      is_mutable: ex.is_mutable ?? null,
      edition_nonce: ex.edition_nonce ?? null,
      token_standard: (ex.token_standard as string | null | undefined) ?? null,
      updated_at: now,
    },
    { onConflict: 'mint' },
  )

  return jsonResponse({ ok: true }, req)
}

export async function handleVoucherHolders(
  body: Record<string, unknown>,
  _db: Db,
  authHeader: string | null,
  req: Request,
): Promise<Response> {
  const { requirePlatformAdmin: reqAdmin } = await import('../../_shared/auth.ts')
  const check = await reqAdmin(authHeader, req)
  if (!check.ok) return check.response

  const mint = (body.mint as string)?.trim()
  if (!mint) return errorResponse('mint required', req)

  const mintPk = new PublicKey(mint)
  const connection = getSolanaConnection()
  const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    commitment: 'confirmed',
    filters: [{ dataSize: SPL_TOKEN_ACCOUNT_DATA_SIZE }, { memcmp: { offset: 0, bytes: mintPk.toBase58() } }],
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

  const holders = [...byWallet.entries()].map(([owner, amount]) => ({ owner, amount: String(amount) }))
  return jsonResponse({ holders }, req)
}
