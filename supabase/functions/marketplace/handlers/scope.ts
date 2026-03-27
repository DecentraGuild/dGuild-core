import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { getWalletFromAuthHeader } from '../../_shared/auth.ts'
import type { getAdminClient } from '../../_shared/supabase-admin.ts'

type Db = ReturnType<typeof getAdminClient>

function pickStoreBps(m: { store_bps?: number | null; storeBps?: number | null }): number | null {
  const v = m.store_bps ?? m.storeBps
  if (typeof v === 'number' && v >= 0 && v <= 10000) return v
  return null
}

export async function handleScopeSync(body: Record<string, unknown>, db: Db, authHeader: string | null, req: Request): Promise<Response> {
  const tenantId = body.tenantId as string
  const collectionMints = (body.collectionMints as Array<{ mint: string; name?: string; image?: string }>) ?? []
  const splAssetMints = (body.splAssetMints as Array<{ mint: string; name?: string; symbol?: string; image?: string }>) ?? []
  const currencyMints = (body.currencyMints as Array<{ mint: string; name?: string; symbol?: string; image?: string }>) ?? []
  if (!tenantId) return errorResponse('tenantId required', req)

  const wallet = await getWalletFromAuthHeader(authHeader)
  if (!wallet) return errorResponse('Not signed in', req, 401)

  const { data: tenant } = await db.from('tenant_config').select('admins').eq('id', tenantId).maybeSingle()
  const admins = (tenant?.admins as string[]) ?? []
  if (!admins.some((a) => String(a).toLowerCase() === wallet.toLowerCase())) return errorResponse('Tenant admin only', req, 403)

  const now = new Date().toISOString()
  const { fetchMintMetadata } = await import('../../_shared/mint-metadata.ts')

  const catalogRows: Array<{ tenant_id: string; mint: string; kind: 'SPL' | 'NFT'; label: string | null; store_bps: number | null }> = []
  for (const m of collectionMints) {
    let label = m.name ?? null
    if (!label) { const meta = await fetchMintMetadata(m.mint, undefined); if (meta) label = meta.label ?? meta.name ?? null }
    catalogRows.push({ tenant_id: tenantId, mint: m.mint, kind: 'NFT', label, store_bps: pickStoreBps(m as { store_bps?: number | null; storeBps?: number | null }) })
  }
  for (const m of [...splAssetMints, ...currencyMints]) {
    let label = m.name ?? (m as { symbol?: string }).symbol ?? null
    if (!label) { const meta = await fetchMintMetadata(m.mint, 'SPL'); if (meta) label = meta.label ?? meta.name ?? null }
    catalogRows.push({ tenant_id: tenantId, mint: m.mint, kind: 'SPL', label, store_bps: pickStoreBps(m as { store_bps?: number | null; storeBps?: number | null }) })
  }
  const catalogUnique = [...new Map(catalogRows.map((r) => [r.mint, r])).values()]
  if (catalogUnique.length > 0) {
    await db.from('tenant_mint_catalog').upsert(catalogUnique.map((r) => ({ ...r, updated_at: now })), { onConflict: 'tenant_id,mint' })
    const collectionMintSet = new Set(collectionMints.map((c) => c.mint))
    const allMints = [...collectionMints, ...splAssetMints, ...currencyMints]
    for (const m of allMints) {
      const kindHint = collectionMintSet.has(m.mint) ? 'NFT' as const : 'SPL' as const
      const meta = await fetchMintMetadata(m.mint, kindHint)
      if (meta) {
        await db.from('mint_metadata').upsert({ mint: m.mint, name: meta.name ?? null, symbol: (meta as { symbol?: string }).symbol ?? null, image: meta.image ?? null, trait_index: meta.traitIndex ?? null, decimals: meta.decimals ?? null, update_authority: meta.updateAuthority ?? null, uri: meta.uri ?? null, seller_fee_basis_points: meta.sellerFeeBasisPoints ?? null, primary_sale_happened: meta.primarySaleHappened ?? null, is_mutable: meta.isMutable ?? null, edition_nonce: meta.editionNonce ?? null, token_standard: meta.tokenStandard ?? null, updated_at: now }, { onConflict: 'mint' })
      }
    }
  }

  const scopeRows: Array<{ tenant_id: string; mint: string; source: string; collection_mint: string | null }> = [
    ...collectionMints.map((m) => ({ tenant_id: tenantId, mint: m.mint, source: 'collection', collection_mint: m.mint })),
    ...splAssetMints.map((m) => ({ tenant_id: tenantId, mint: m.mint, source: 'spl_asset', collection_mint: null })),
    ...currencyMints.map((m) => ({ tenant_id: tenantId, mint: m.mint, source: 'currency', collection_mint: null })),
  ]
  await db.from('marketplace_mint_scope').delete().eq('tenant_id', tenantId)
  if (scopeRows.length > 0) await db.from('marketplace_mint_scope').insert(scopeRows)

  return jsonResponse({ catalogSynced: catalogUnique.length, scopeSynced: scopeRows.length }, req)
}

export async function handleScopeExpand(body: Record<string, unknown>, db: Db, _authHeader: string | null, req: Request): Promise<Response> {
  const tenantId = body.tenantId as string
  const collectionMint = body.collectionMint as string
  if (!tenantId || !collectionMint) return errorResponse('tenantId and collectionMint required', req)

  const rpcUrl = Deno.env.get('HELIUS_RPC_URL') ?? Deno.env.get('SOLANA_RPC_URL')
  if (!rpcUrl) return errorResponse('RPC not configured', req, 500)

  try {
    const { data: existing } = await db.from('collection_members').select('mint').eq('collection_mint', collectionMint).limit(1).maybeSingle()
    if (!existing) {
      let page = 1; let hasMore = true
      const allMembers: Array<{ collection_mint: string; mint: string; name: string | null; image: string | null; traits: unknown; owner: string | null }> = []
      const now = new Date().toISOString()
      while (hasMore) {
        const res = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAssetsByGroup', params: { groupKey: 'collection', groupValue: collectionMint, limit: 1000, page } }) })
        if (!res.ok) return errorResponse('RPC request failed', req, 502)
        const data = await res.json() as { result?: { items?: Array<Record<string, unknown>> } }
        const items = data.result?.items ?? []
        for (const item of items) {
          const id = item.id as string
          const content = item.content as Record<string, unknown> | undefined
          const metadata = content?.metadata as Record<string, unknown> | undefined
          const links = content?.links as Record<string, unknown> | undefined
          const ownership = item.ownership as { owner?: string } | undefined
          const nftName = metadata?.name as string ?? null
          const nftImage = links?.image as string ?? null
          const traits = Array.isArray(metadata?.attributes) ? metadata.attributes : []
          allMembers.push({ collection_mint: collectionMint, mint: id, name: nftName, image: nftImage, traits, owner: ownership?.owner ?? null })
        }
        hasMore = items.length >= 1000; page++
      }
      if (allMembers.length > 0) await db.from('collection_members').upsert(allMembers.map((m) => ({ ...m, updated_at: now })), { onConflict: 'collection_mint,mint' })
    }
    await db.from('tenant_collection_scope').upsert({ tenant_id: tenantId, collection_mint: collectionMint }, { onConflict: 'tenant_id,collection_mint' })
    await db.from('marketplace_mint_scope').upsert({ tenant_id: tenantId, mint: collectionMint, source: 'collection', collection_mint: collectionMint }, { onConflict: 'tenant_id,mint' })

    const { count } = await db.from('collection_members').select('*', { count: 'exact', head: true }).eq('collection_mint', collectionMint)
    return jsonResponse({ expanded: count ?? 0, collectionMint }, req)
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Expand failed', req, 500)
  }
}
