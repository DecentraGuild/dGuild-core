import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requirePlatformAdmin } from '../../_shared/auth.ts'
import { getSolanaConnection, getRpcUrl } from '../../_shared/solana-connection.ts'
import { Connection, PublicKey } from 'npm:@solana/web3.js@1'
import type { getAdminClient } from '../../_shared/supabase-admin.ts'
import { loadPlatformMetadataScope } from '../../_shared/platform-metadata-mint-list.ts'
import { runOpsMetadataRefreshChunk, enqueueCollectionIndexing } from '../../_shared/mint-catalog-index-worker.ts'

type Db = ReturnType<typeof getAdminClient>

export async function fetchMintMetadataFromChain(connection: Connection, mint: string): Promise<{
  mint: string; name: string | null; symbol: string | null; image: string | null
  decimals: number | null; updateAuthority: string | null; uri: string | null
  sellerFeeBasisPoints: number | null; primarySaleHappened: boolean | null
  isMutable: boolean | null; editionNonce: number | null; tokenStandard: string | null
} | null> {
  try {
    const url = getRpcUrl()
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }) })
    if (res.ok) {
      const data = await res.json() as { result?: Record<string, unknown> }
      const asset = data.result as Record<string, unknown> | undefined
      if (asset) {
        const content = asset.content as Record<string, unknown> | undefined
        const metadata = (content?.metadata as Record<string, unknown>) ?? {}
        const links = (content?.links as Record<string, unknown>) ?? {}
        const name = (metadata.name as string) ?? (asset.name as string) ?? null
        const symbol = (metadata.symbol as string) ?? null
        const image = (links.image as string) ?? null
        const tokenInfo = asset.token_info as Record<string, unknown> | undefined
        const decimals = typeof tokenInfo?.decimals === 'number' ? tokenInfo.decimals : null
        const { extractExtendedMetadata } = await import('../../_shared/mint-metadata.ts')
        const ext = extractExtendedMetadata(asset)
        return { mint, name, symbol, image, decimals, ...ext }
      }
    }
    const mintPk = new PublicKey(mint)
    const accountInfo = await connection.getAccountInfo(mintPk)
    if (accountInfo?.data && accountInfo.data.length >= 82) {
      return { mint, name: null, symbol: null, image: null, decimals: accountInfo.data[44], updateAuthority: null, uri: null, sellerFeeBasisPoints: null, primarySaleHappened: null, isMutable: null, editionNonce: null, tokenStandard: null }
    }
    return null
  } catch { return null }
}

type ChainMintMeta = NonNullable<Awaited<ReturnType<typeof fetchMintMetadataFromChain>>>

function pickStr(next: string | null | undefined, prev: unknown): string | null {
  if (next != null && String(next).trim() !== '') return next
  const p = prev
  if (typeof p === 'string' && p.trim() !== '') return p
  return null
}

function pickBool(next: boolean | null | undefined, prev: unknown): boolean | null {
  if (typeof next === 'boolean') return next
  if (typeof prev === 'boolean') return prev
  return null
}

export function mergeMintMetadataUpsert(existing: Record<string, unknown> | null | undefined, chain: ChainMintMeta): Record<string, unknown> {
  const ex = existing ?? {}
  const now = new Date().toISOString()
  return {
    mint: chain.mint,
    name: pickStr(chain.name, ex.name),
    symbol: pickStr(chain.symbol, ex.symbol),
    image: pickStr(chain.image, ex.image),
    decimals: chain.decimals ?? ex.decimals ?? null,
    traits: ex.traits ?? null, trait_index: ex.trait_index ?? null,
    seller_fee_basis_points: chain.sellerFeeBasisPoints ?? ex.seller_fee_basis_points ?? null,
    update_authority: pickStr(chain.updateAuthority, ex.update_authority),
    uri: pickStr(chain.uri, ex.uri),
    primary_sale_happened: pickBool(chain.primarySaleHappened, ex.primary_sale_happened),
    is_mutable: pickBool(chain.isMutable, ex.is_mutable),
    edition_nonce: chain.editionNonce ?? ex.edition_nonce ?? null,
    token_standard: pickStr(chain.tokenStandard, ex.token_standard),
    updated_at: now,
  }
}

export async function loadPlatformMetadataMintList(db: Db): Promise<string[]> {
  const { mints } = await loadPlatformMetadataScope(db)
  return mints
}

export async function handleMetadata(body: Record<string, unknown>, db: Db, _authHeader: string | null, req: Request): Promise<Response> {
  const mint = body.mint as string
  if (!mint) return errorResponse('mint required', req)

  const { data: cached } = await db.from('mint_metadata').select('mint, name, symbol, image, decimals, update_authority, uri, seller_fee_basis_points, primary_sale_happened, is_mutable, edition_nonce, token_standard').eq('mint', mint).maybeSingle()
  if (cached) {
    return jsonResponse({ mint: cached.mint, name: cached.name, symbol: cached.symbol, image: cached.image, decimals: cached.decimals, updateAuthority: cached.update_authority, uri: cached.uri, sellerFeeBasisPoints: cached.seller_fee_basis_points, primarySaleHappened: cached.primary_sale_happened, isMutable: cached.is_mutable, editionNonce: cached.edition_nonce, tokenStandard: cached.token_standard }, req)
  }

  const connection = getSolanaConnection()
  const meta = await fetchMintMetadataFromChain(connection, mint)
  if (!meta) return errorResponse('Mint not found', req, 404)

  await db.from('mint_metadata').upsert(mergeMintMetadataUpsert(undefined, meta), { onConflict: 'mint' })
  return jsonResponse(meta, req)
}

export async function handleMetadataRefresh(body: Record<string, unknown>, db: Db, _authHeader: string | null, req: Request): Promise<Response> {
  const mints = body.mints as string[]
  if (!Array.isArray(mints)) return errorResponse('mints array required', req)

  const slice = mints.slice(0, 50)
  const { data: existingRows } = await db.from('mint_metadata').select('*').in('mint', slice)
  const existingByMint = new Map((existingRows ?? []).map((r) => [r.mint as string, r as Record<string, unknown>]))

  const connection = getSolanaConnection()
  const results: Record<string, boolean> = {}
  for (const mint of slice) {
    const meta = await fetchMintMetadataFromChain(connection, mint)
    if (meta) {
      await db.from('mint_metadata').upsert(mergeMintMetadataUpsert(existingByMint.get(mint), meta), { onConflict: 'mint' })
      results[mint] = true
    } else {
      results[mint] = false
    }
  }
  return jsonResponse({ refreshed: results }, req)
}

export async function handleMetadataSeedFromConfigs(body: Record<string, unknown>, db: Db, authHeader: string | null, req: Request): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const limit = Math.min(Math.max(1, (body.limit as number) ?? 100), 200)
  const rpcUrl = Deno.env.get('HELIUS_RPC_URL') ?? Deno.env.get('SOLANA_RPC_URL')
  if (!rpcUrl) return errorResponse('RPC not configured', req, 500)

  const { fetchMintMetadata } = await import('../../_shared/mint-metadata.ts')
  const now = new Date().toISOString()

  const { data: scopeRes } = await db.from('marketplace_mint_scope').select('mint, source, collection_mint')
  const collectionMintsInScope = new Set(
    (scopeRes ?? []).filter((r) => r.source === 'collection').map((r) => (r.collection_mint ?? r.mint) as string),
  )

  for (const collectionMint of collectionMintsInScope) {
    const { data: existing } = await db
      .from('collection_members')
      .select('mint')
      .eq('collection_mint', collectionMint)
      .limit(1)
      .maybeSingle()
    if (existing) continue
    await enqueueCollectionIndexing(db, collectionMint, now)
  }

  const { mints: scopeMints, kindByMint } = await loadPlatformMetadataScope(db)
  const mintsToSeed = new Map<string, 'SPL' | 'NFT'>()
  for (const m of scopeMints) mintsToSeed.set(m, kindByMint.get(m) ?? 'SPL')

  const { data: existing } = await db.from('mint_metadata').select('mint').in('mint', [...mintsToSeed.keys()])
  const existingSet = new Set((existing ?? []).map((r) => r.mint as string))
  const toSeed = [...mintsToSeed.entries()].filter(([m]) => !existingSet.has(m)).slice(0, limit)

  if (toSeed.length === 0) {
    return jsonResponse({
      seeded: 0,
      total: mintsToSeed.size,
      message: 'All mints already in mint_metadata or no mints found in configs. Empty marketplace collections were enqueued for the mint-catalog-index worker.',
    }, req)
  }

  let seeded = 0
  for (const [mint, kind] of toSeed) {
    const hint = kind === 'NFT' ? 'NFT' : 'SPL'
    const meta = await fetchMintMetadata(mint, hint)
    if (meta) {
      await db.from('mint_metadata').upsert({
        mint,
        name: meta.name ?? null,
        symbol: (meta as { symbol?: string }).symbol ?? null,
        image: meta.image ?? null,
        trait_index: meta.traitIndex ?? null,
        decimals: meta.decimals ?? null,
        update_authority: meta.updateAuthority ?? null,
        uri: meta.uri ?? null,
        seller_fee_basis_points: meta.sellerFeeBasisPoints ?? null,
        primary_sale_happened: meta.primarySaleHappened ?? null,
        is_mutable: meta.isMutable ?? null,
        edition_nonce: meta.editionNonce ?? null,
        token_standard: meta.tokenStandard ?? null,
        updated_at: now,
      }, { onConflict: 'mint' })
      seeded++
      if (meta.kind === 'NFT' && (meta.collectionSize ?? 0) > 0) {
        await enqueueCollectionIndexing(db, mint, now)
      }
    }
  }
  return jsonResponse({
    seeded,
    total: toSeed.length,
    remaining: mintsToSeed.size - existingSet.size - seeded,
    message: `Seeded ${seeded} mints (SPL/NFT by catalog). ${toSeed.length - seeded} failed. Run again to continue. Collection indexing runs in the background.`,
  }, req)
}

export async function handleMetadataRefreshAll(body: Record<string, unknown>, db: Db, authHeader: string | null, req: Request): Promise<Response> {
  const check = await requirePlatformAdmin(authHeader, req)
  if (!check.ok) return check.response

  const limit = Math.min(Math.max(1, (body.limit as number) ?? 200), 500)
  const offset = Math.max(0, (body.offset as number) ?? 0)
  const rpcUrl = getRpcUrl()
  const chunk = await runOpsMetadataRefreshChunk(db, rpcUrl, offset, limit, new Date().toISOString())

  if (chunk.trackedTotal === 0) {
    return jsonResponse({ refreshed: 0, total: 0, trackedTotal: 0, message: 'No mints in platform catalog scope' }, req)
  }
  if (offset >= chunk.trackedTotal && chunk.total === 0) {
    return jsonResponse({
      refreshed: 0,
      total: 0,
      trackedTotal: chunk.trackedTotal,
      offset,
      nextOffset: null,
      message: 'Offset past end of catalog mint list. Reset offset to 0.',
    }, req)
  }

  const hasMore = chunk.nextOffset != null
  return jsonResponse({
    refreshed: chunk.refreshed,
    total: chunk.total,
    trackedTotal: chunk.trackedTotal,
    offset: chunk.offset,
    nextOffset: chunk.nextOffset,
    enqueuedCollections: chunk.enqueuedCollections,
    message: hasMore
      ? `Refreshed ${chunk.refreshed} of ${chunk.total} mints (catalog scope ${chunk.trackedTotal} total). Enqueued ${chunk.enqueuedCollections} collection index runs. Call with offset=${chunk.nextOffset} to continue.`
      : `Refreshed ${chunk.refreshed} of ${chunk.total} mints (catalog scope ${chunk.trackedTotal} total). Enqueued ${chunk.enqueuedCollections} collection index runs. Done.`,
  }, req)
}
