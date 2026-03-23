import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import type { getAdminClient } from '../../_shared/supabase-admin.ts'

type Db = ReturnType<typeof getAdminClient>

export async function handleCatalogAdd(body: Record<string, unknown>, db: Db, _authHeader: string | null, req: Request): Promise<Response> {
  const tenantId = body.tenantId as string
  const mint = body.mint as string
  const kindHint = body.kind as 'SPL' | 'NFT' | 'auto' | undefined
  if (!tenantId || !mint) return errorResponse('tenantId and mint required', req)

  const rpcUrl = Deno.env.get('HELIUS_RPC_URL') ?? Deno.env.get('SOLANA_RPC_URL')
  if (!rpcUrl) return errorResponse('RPC not configured', req, 500)

  if (kindHint !== 'SPL') {
    try {
      const colRes = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAssetsByGroup', params: { groupKey: 'collection', groupValue: mint, limit: 1, page: 1 } }) })
      const colData = await colRes.json() as { result?: { total?: number } }
      if ((colData.result?.total ?? 0) > 0) {
        const traitKeys = new Set<string>()
        const traitOptions: Record<string, Set<string>> = {}
        let pgN = 1; let more = true
        while (more) {
          const r2 = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAssetsByGroup', params: { groupKey: 'collection', groupValue: mint, limit: 1000, page: pgN } }) })
          const d2 = await r2.json() as { result?: { items?: Array<Record<string, unknown>> } }
          const items = d2.result?.items ?? []
          for (const item of items) {
            const attrs = ((item.content as Record<string, unknown>)?.metadata as Record<string, unknown>)?.attributes as Array<{ trait_type?: string; value?: string }> | undefined
            if (attrs) for (const a of attrs) {
              if (!a.trait_type) continue
              traitKeys.add(a.trait_type)
              if (!traitOptions[a.trait_type]) traitOptions[a.trait_type] = new Set()
              if (a.value) traitOptions[a.trait_type].add(String(a.value))
            }
          }
          more = items.length >= 1000; pgN++
        }
        const metaRes = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }) })
        const metaData = await metaRes.json() as { result?: Record<string, unknown> }
        const assetMeta = (metaData.result?.content as Record<string, unknown>)?.metadata as Record<string, unknown> | undefined
        const traitIndex = { trait_keys: [...traitKeys], trait_options: Object.fromEntries([...Object.entries(traitOptions)].map(([k, v]) => [k, [...v]])) }
        await db.from('mint_metadata').upsert({ mint, name: assetMeta?.name as string ?? null, image: ((metaData.result?.content as Record<string, unknown>)?.links as Record<string, unknown>)?.image as string ?? null, trait_index: traitIndex, updated_at: new Date().toISOString() }, { onConflict: 'mint' })
        const { data: entry, error } = await db.from('tenant_mint_catalog').upsert({ tenant_id: tenantId, mint, kind: 'NFT', label: assetMeta?.name as string ?? null, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id,mint' }).select().single()
        if (error) return errorResponse(error.message, req, 500)
        return jsonResponse({ entry }, req)
      }
    } catch { /* fall through to SPL */ }
  }

  try {
    const res = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }) })
    const data = await res.json() as { result?: Record<string, unknown> }
    const asset = data.result
    const meta = (asset?.content as Record<string, unknown>)?.metadata as Record<string, unknown> | undefined
    const tokenInfo = asset?.token_info as Record<string, unknown> | undefined
    await db.from('mint_metadata').upsert({ mint, name: meta?.name as string ?? null, symbol: meta?.symbol as string ?? null, image: ((asset?.content as Record<string, unknown>)?.links as Record<string, unknown>)?.image as string ?? null, decimals: tokenInfo?.decimals as number ?? null, updated_at: new Date().toISOString() }, { onConflict: 'mint' })
    const { data: entry, error } = await db.from('tenant_mint_catalog').upsert({ tenant_id: tenantId, mint, kind: 'SPL', label: meta?.name as string ?? meta?.symbol as string ?? null, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id,mint' }).select().single()
    if (error) return errorResponse(error.message, req, 500)
    return jsonResponse({ entry }, req)
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Failed to add mint', req, 500)
  }
}

export async function handleCatalogRefreshTraits(body: Record<string, unknown>, db: Db, _authHeader: string | null, req: Request): Promise<Response> {
  const tenantId = body.tenantId as string
  const catalogId = body.id as number
  if (!tenantId || !catalogId) return errorResponse('tenantId and id required', req)

  const { data: existing } = await db.from('tenant_mint_catalog').select('mint').eq('id', catalogId).eq('tenant_id', tenantId).maybeSingle()
  if (!existing) return errorResponse('Catalog entry not found', req, 404)
  const mint = existing.mint as string

  const rpcUrl = Deno.env.get('HELIUS_RPC_URL') ?? Deno.env.get('SOLANA_RPC_URL')
  if (!rpcUrl) return errorResponse('RPC not configured', req, 500)

  try {
    const traitKeys = new Set<string>()
    const traitOptions: Record<string, Set<string>> = {}
    let pgN = 1; let more = true
    while (more) {
      const r = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAssetsByGroup', params: { groupKey: 'collection', groupValue: mint, limit: 1000, page: pgN } }) })
      const d = await r.json() as { result?: { items?: Array<Record<string, unknown>> } }
      const items = d.result?.items ?? []
      for (const item of items) {
        const attrs = ((item.content as Record<string, unknown>)?.metadata as Record<string, unknown>)?.attributes as Array<{ trait_type?: string; value?: string }> | undefined
        if (attrs) for (const a of attrs) {
          if (!a.trait_type) continue
          traitKeys.add(a.trait_type)
          if (!traitOptions[a.trait_type]) traitOptions[a.trait_type] = new Set()
          if (a.value) traitOptions[a.trait_type].add(String(a.value))
        }
      }
      more = items.length >= 1000; pgN++
    }
    const traitIndex = { trait_keys: [...traitKeys], trait_options: Object.fromEntries([...Object.entries(traitOptions)].map(([k, v]) => [k, [...v]])) }
    await db.from('mint_metadata').update({ trait_index: traitIndex, updated_at: new Date().toISOString() }).eq('mint', mint)
    const { data: entry } = await db.from('tenant_mint_catalog').select('id, mint, kind, label').eq('id', catalogId).eq('tenant_id', tenantId).single()
    return jsonResponse({ entry: entry ?? { id: catalogId, mint, kind: 'NFT', label: null } }, req)
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Failed to refresh traits', req, 500)
  }
}
