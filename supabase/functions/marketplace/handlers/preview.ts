import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import type { getAdminClient } from '../../_shared/supabase-admin.ts'
import { solanaJsonRpc } from '../../_shared/solana-json-rpc.ts'

type Db = ReturnType<typeof getAdminClient>

export async function handleCollectionPreview(body: Record<string, unknown>, _db: Db, _authHeader: string | null, req: Request): Promise<Response> {
  const mint = body.mint as string
  if (!mint) return errorResponse('mint required', req)

  const rpcUrl = Deno.env.get('HELIUS_RPC_URL') ?? Deno.env.get('SOLANA_RPC_URL')
  if (!rpcUrl) return errorResponse('RPC not configured', req, 500)

  try {
    const asset = await solanaJsonRpc<Record<string, unknown> | null>(rpcUrl, 'getAsset', { id: mint })

    let collectionSize = 0
    const traitTypesSet = new Set<string>()
    let page = 1; let hasMore = true

    while (hasMore) {
      let d: { items?: Array<Record<string, unknown>>; total?: number }
      try {
        d = await solanaJsonRpc<{ items?: Array<Record<string, unknown>>; total?: number }>(
          rpcUrl,
          'getAssetsByGroup',
          { groupKey: 'collection', groupValue: mint, limit: 1000, page },
        )
      } catch {
        break
      }
      const items = d.items ?? []
      if (page === 1 && d.total) collectionSize = d.total
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
    const asset = await solanaJsonRpc<Record<string, unknown> | null>(rpcUrl, 'getAsset', { id: mint })
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
