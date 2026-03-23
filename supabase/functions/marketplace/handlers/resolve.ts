import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { getSolanaConnection, getRpcUrl } from '../../_shared/solana-connection.ts'
import { PublicKey } from 'npm:@solana/web3.js@1'
import type { getAdminClient } from '../../_shared/supabase-admin.ts'
import type { Connection } from 'npm:@solana/web3.js@1'

type Db = ReturnType<typeof getAdminClient>

async function resolveAssetKind(connection: Connection, mint: string): Promise<'SPL' | 'NFT' | null> {
  try {
    const url = getRpcUrl()
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }) })
    if (res.ok) {
      const data = await res.json() as { result?: Record<string, unknown> }
      const asset = data.result
      if (asset) {
        const tokenStandard = ((asset.content as Record<string, unknown>)?.metadata as Record<string, unknown>)?.token_standard as string
        if (tokenStandard === 'Fungible' || tokenStandard === 'FungibleAsset') return 'SPL'
        return 'NFT'
      }
    }
    const mintPk = new PublicKey(mint)
    const tokenAccounts = await connection.getTokenLargestAccounts(mintPk)
    if (tokenAccounts.value.length > 0) {
      const supply = tokenAccounts.value.reduce((sum, a) => sum + (a.uiAmount ?? 0), 0)
      return supply > 1 ? 'SPL' : 'NFT'
    }
    return null
  } catch { return null }
}

export async function handleResolve(body: Record<string, unknown>, db: Db, _authHeader: string | null, req: Request): Promise<Response> {
  const mint = body.mint as string
  if (!mint) return errorResponse('mint required', req)

  const { data: cached } = await db.from('mint_metadata').select('decimals').eq('mint', mint).maybeSingle()
  if (cached) return jsonResponse({ kind: (cached.decimals as number) === 0 ? 'NFT' : 'SPL' }, req)

  const connection = getSolanaConnection()
  const kind = await resolveAssetKind(connection, mint)
  return jsonResponse({ kind: kind ?? null }, req)
}

export async function handleResolveFull(body: Record<string, unknown>, _db: Db, _authHeader: string | null, req: Request): Promise<Response> {
  const mint = body.mint as string
  const kindHint = body.kind as 'SPL' | 'NFT' | 'auto' | undefined
  if (!mint) return errorResponse('mint required', req)

  const { fetchMintMetadata } = await import('../../_shared/mint-metadata.ts')
  const hint = kindHint === 'auto' || !kindHint ? undefined : kindHint
  const meta = await fetchMintMetadata(mint, hint)
  if (!meta) return errorResponse('Mint not found or invalid', req, 404)

  if (meta.kind === 'SPL') {
    return jsonResponse({ kind: 'SPL', spl: { mint, name: meta.name ?? undefined, symbol: meta.label ?? undefined, image: meta.image ?? undefined } }, req)
  }
  const traitKeys = meta.traitIndex && typeof meta.traitIndex === 'object' && 'trait_keys' in meta.traitIndex
    ? (meta.traitIndex.trait_keys as string[])
    : undefined
  return jsonResponse({ kind: 'NFT', collection: { mint, name: meta.name ?? undefined, image: meta.image ?? undefined, collectionSize: meta.collectionSize ?? undefined, uniqueTraitCount: traitKeys?.length ?? undefined, traitTypes: traitKeys } }, req)
}
