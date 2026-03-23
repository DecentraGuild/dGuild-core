import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import type { getAdminClient } from '../../_shared/supabase-admin.ts'

type Db = ReturnType<typeof getAdminClient>

export async function handleCollectionPreview(body: Record<string, unknown>, _db: Db, _authHeader: string | null, req: Request): Promise<Response> {
  const mint = body.mint as string
  if (!mint) return errorResponse('mint required', req)

  const rpcUrl = Deno.env.get('HELIUS_RPC_URL') ?? Deno.env.get('SOLANA_RPC_URL')
  if (!rpcUrl) return errorResponse('RPC not configured', req, 500)

  try {
    const assetRes = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }) })
    if (!assetRes.ok) return errorResponse('RPC request failed', req, 502)
    const assetData = await assetRes.json() as { result?: Record<string, unknown> }
    const asset = assetData.result

    let collectionSize = 0
    const traitTypesSet = new Set<string>()
    let page = 1; let hasMore = true

    while (hasMore) {
      const r = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAssetsByGroup', params: { groupKey: 'collection', groupValue: mint, limit: 1000, page } }) })
      if (!r.ok) break
      const d = await r.json() as { result?: { items?: Array<Record<string, unknown>>; total?: number } }
      const items = d.result?.items ?? []
      if (page === 1 && d.result?.total) collectionSize = d.result.total
      for (const item of items) {
        const attrs = ((item.content as Record<string, unknown>)?.metadata as Record<string, unknown>)?.attributes as Array<{ trait_type?: string }> | undefined
        if (attrs) for (const a of attrs) if (a.trait_type) traitTypesSet.add(a.trait_type)
      }
      hasMore = items.length >= 1000; page++
    }

    const meta = (asset?.content as Record<string, unknown>)?.metadata as Record<string, unknown> | undefined
    const { extractExtendedMetadata } = await import('../../_shared/mint-metadata.ts')
    const ext = extractExtendedMetadata(asset as Record<string, unknown>)
    return jsonResponse({ name: meta?.name ?? null, symbol: meta?.symbol ?? null, image: ((asset?.content as Record<string, unknown>)?.links as Record<string, unknown>)?.image ?? null, sellerFeeBasisPoints: typeof meta?.seller_fee_basis_points === 'number' ? meta.seller_fee_basis_points : null, collectionSize, uniqueTraitCount: traitTypesSet.size, traitTypes: [...traitTypesSet].sort(), ...ext }, req)
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Preview failed', req, 500)
  }
}

export async function handleSplPreview(body: Record<string, unknown>, _db: Db, _authHeader: string | null, req: Request): Promise<Response> {
  const mint = body.mint as string
  if (!mint) return errorResponse('mint required', req)

  const rpcUrl = Deno.env.get('HELIUS_RPC_URL') ?? Deno.env.get('SOLANA_RPC_URL')
  if (!rpcUrl) return errorResponse('RPC not configured', req, 500)

  try {
    const res = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }) })
    if (!res.ok) return errorResponse('RPC request failed', req, 502)
    const data = await res.json() as { result?: Record<string, unknown> }
    const asset = data.result
    if (!asset) return errorResponse('Asset not found', req, 404)

    const meta = (asset.content as Record<string, unknown>)?.metadata as Record<string, unknown> | undefined
    const tokenInfo = asset.token_info as Record<string, unknown> | undefined
    const { extractExtendedMetadata } = await import('../../_shared/mint-metadata.ts')
    const ext = extractExtendedMetadata(asset as Record<string, unknown>)
    return jsonResponse({ name: meta?.name ?? null, symbol: meta?.symbol ?? null, image: ((asset.content as Record<string, unknown>)?.links as Record<string, unknown>)?.image ?? null, decimals: tokenInfo?.decimals ?? null, sellerFeeBasisPoints: typeof meta?.seller_fee_basis_points === 'number' ? meta.seller_fee_basis_points : null, ...ext }, req)
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Preview failed', req, 500)
  }
}
