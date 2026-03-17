/**
 * Marketplace Edge Function.
 *
 * Actions:
 *   metadata                  – Fetch mint metadata (from cache or Solana RPC).
 *   metadata-refresh           – Batch refresh mint metadata (admin).
 *   metadata-seed-from-configs – Seed mint_metadata from tenant catalog/watchtower/scope (platform admin).
 *   metadata-refresh-all       – Refresh all mints in mint_metadata from chain (platform admin).
 *   resolve              – Resolve mint to asset type (SPL/NFT).
 *   escrows              – List on-chain escrows in scope for a tenant.
 *   scope-expand         – Expand collection mints into the marketplace scope (admin, dev only).
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, getUserClient } from '../_shared/supabase-admin.ts'
import { getWalletFromAuthHeader } from '../_shared/auth.ts'
import { getSolanaConnection, getRpcUrl } from '../_shared/solana-connection.ts'
import { Connection, PublicKey } from 'npm:@solana/web3.js@1'

// ---------------------------------------------------------------------------
// Mint metadata: fetch from Solana RPC (DAS)
// ---------------------------------------------------------------------------

async function fetchMintMetadataFromChain(
  connection: Connection,
  mint: string,
): Promise<{
  mint: string
  name: string | null
  symbol: string | null
  image: string | null
  decimals: number | null
  updateAuthority: string | null
  uri: string | null
  sellerFeeBasisPoints: number | null
  primarySaleHappened: boolean | null
  isMutable: boolean | null
  editionNonce: number | null
  tokenStandard: string | null
} | null> {
  try {
    const url = getRpcUrl()
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } })
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
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
        const { extractExtendedMetadata } = await import('../_shared/mint-metadata.ts')
        const ext = extractExtendedMetadata(asset)
        return { mint, name, symbol, image, decimals, ...ext }
      }
    }

    // Fallback: try Metaplex metadata program
    const mintPk = new PublicKey(mint)
    const accountInfo = await connection.getAccountInfo(mintPk)
    if (accountInfo?.data && accountInfo.data.length >= 82) {
      const decimals = accountInfo.data[44]
      return {
        mint,
        name: null,
        symbol: null,
        image: null,
        decimals,
        updateAuthority: null,
        uri: null,
        sellerFeeBasisPoints: null,
        primarySaleHappened: null,
        isMutable: null,
        editionNonce: null,
        tokenStandard: null,
      }
    }

    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Resolve asset kind (SPL vs NFT)
// ---------------------------------------------------------------------------

async function resolveAssetKind(
  connection: Connection,
  mint: string,
): Promise<'SPL' | 'NFT' | null> {
  try {
    const url = getRpcUrl()
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }),
    })
    if (res.ok) {
      const data = await res.json() as { result?: Record<string, unknown> }
      const asset = data.result
      if (asset) {
        const tokenStandard = ((asset.content as Record<string, unknown>)?.metadata as Record<string, unknown>)?.token_standard as string
        if (tokenStandard === 'Fungible' || tokenStandard === 'FungibleAsset') return 'SPL'
        return 'NFT'
      }
    }
    // Check if it's an SPL token by looking up token accounts
    const mintPk = new PublicKey(mint)
    const tokenAccounts = await connection.getTokenLargestAccounts(mintPk)
    if (tokenAccounts.value.length > 0) {
      const supply = tokenAccounts.value.reduce((sum, a) => sum + (a.uiAmount ?? 0), 0)
      return supply > 1 ? 'SPL' : 'NFT'
    }
    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Fetch all escrows in scope for a tenant (on-chain)
// ---------------------------------------------------------------------------

interface EscrowApiShape {
  publicKey: string
  account: Record<string, unknown>
}

function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (typeof data === 'object' && data !== null && 'buffer' in data) {
    const v = data as ArrayBufferView
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
  }
  return new Uint8Array(0)
}

function readPubkey(data: Uint8Array, offset: number): string {
  return new PublicKey(data.slice(offset, offset + 32)).toBase58()
}

function readU64LE(data: Uint8Array, offset: number): string {
  const view = new DataView(data.buffer, data.byteOffset + offset, 8)
  const lo = view.getUint32(0, true)
  const hi = view.getUint32(4, true)
  return String((BigInt(hi) << 32n) | BigInt(lo))
}

function readF64LE(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset + offset, 8).getFloat64(0, true)
}

function readI16LE(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset + offset, 2).getInt16(0, true)
}

function readF32LE(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset + offset, 4).getFloat32(0, true)
}

function readI64LE(data: Uint8Array, offset: number): string {
  const view = new DataView(data.buffer, data.byteOffset + offset, 8)
  const lo = view.getUint32(0, true)
  const hi = view.getUint32(4, true)
  return String(BigInt.asIntN(64, (BigInt(hi) << 32n) | BigInt(lo)))
}

/** Parse Anchor Escrow account. Layout: 8-byte discriminator + maker, depositToken, requestToken, tokensDepositInit, tokensDepositRemaining, price, decimals, slippage, seed, bumps, expireTimestamp, recipient, flags, whitelist. */
function parseEscrowAccount(data: Uint8Array, pubkey: string): EscrowApiShape | null {
  const DISCRIMINATOR = 8
  const MIN_SIZE = DISCRIMINATOR + 32 + 32 + 32 + 8 + 8 + 8 + 2 + 4 + 8 + 1 + 1 + 1 + 8 + 32 + 1 + 1 + 1 + 32
  if (data.length < MIN_SIZE) return null
  let o = DISCRIMINATOR
  const maker = readPubkey(data, o); o += 32
  const depositToken = readPubkey(data, o); o += 32
  const requestToken = readPubkey(data, o); o += 32
  const tokensDepositInit = readU64LE(data, o); o += 8
  const tokensDepositRemaining = readU64LE(data, o); o += 8
  const price = readF64LE(data, o); o += 8
  const decimals = readI16LE(data, o); o += 2
  const slippage = readF32LE(data, o); o += 4
  const seed = readU64LE(data, o); o += 8
  o += 3 // authBump, vaultBump, escrowBump
  const expireTimestamp = readI64LE(data, o); o += 8
  const recipient = readPubkey(data, o); o += 32
  const onlyRecipient = data[o++] !== 0
  const onlyWhitelist = data[o++] !== 0
  const allowPartialFill = data[o++] !== 0
  const whitelist = readPubkey(data, o)
  return {
    publicKey: pubkey,
    account: {
      maker,
      depositToken,
      requestToken,
      tokensDepositInit,
      tokensDepositRemaining,
      price,
      decimals,
      slippage,
      seed,
      expireTimestamp,
      recipient,
      onlyRecipient,
      onlyWhitelist,
      allowPartialFill,
      whitelist,
    },
  }
}

async function fetchEscrowsInScope(
  connection: Connection,
  scopeMints: string[],
): Promise<EscrowApiShape[]> {
  const ESCROW_PROGRAM_ID = Deno.env.get('ESCROW_PROGRAM_ID') ?? 'esccxeEDYUXQaeMwq1ZwWAvJaHVYfsXNva13JYb2Chs'
  try {
    const programId = new PublicKey(ESCROW_PROGRAM_ID)
    const accounts = await connection.getProgramAccounts(programId)
    const scopeSet = new Set(scopeMints)
    const result: EscrowApiShape[] = []
    for (const { pubkey, account } of accounts) {
      const data = toUint8Array(account.data)
      const parsed = parseEscrowAccount(data, pubkey.toBase58())
      if (!parsed) continue
      const dep = parsed.account.depositToken as string
      const req = parsed.account.requestToken as string
      if (!scopeSet.has(dep) || !scopeSet.has(req)) continue
      result.push(parsed)
    }
    return result
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', req)
  }

  const action = body.action as string
  const db = getAdminClient()

  // ---------------------------------------------------------------------------
  // metadata – single mint metadata with DB cache
  // ---------------------------------------------------------------------------
  if (action === 'metadata') {
    const mint = body.mint as string
    if (!mint) return errorResponse('mint required', req)

    // Try cache first
    const { data: cached } = await db
      .from('mint_metadata')
      .select('mint, name, symbol, image, decimals, update_authority, uri, seller_fee_basis_points, primary_sale_happened, is_mutable, edition_nonce, token_standard')
      .eq('mint', mint)
      .maybeSingle()

    if (cached) {
      return jsonResponse({
        mint: cached.mint,
        name: cached.name,
        symbol: cached.symbol,
        image: cached.image,
        decimals: cached.decimals,
        updateAuthority: cached.update_authority,
        uri: cached.uri,
        sellerFeeBasisPoints: cached.seller_fee_basis_points,
        primarySaleHappened: cached.primary_sale_happened,
        isMutable: cached.is_mutable,
        editionNonce: cached.edition_nonce,
        tokenStandard: cached.token_standard,
      }, req)
    }

    // Fetch from chain and cache
    const connection = getSolanaConnection()
    const meta = await fetchMintMetadataFromChain(connection, mint)
    if (!meta) return errorResponse('Mint not found', req, 404)

    await db.from('mint_metadata').upsert({
      mint,
      name: meta.name,
      symbol: meta.symbol,
      image: meta.image,
      decimals: meta.decimals,
      update_authority: meta.updateAuthority ?? null,
      uri: meta.uri ?? null,
      seller_fee_basis_points: meta.sellerFeeBasisPoints ?? null,
      primary_sale_happened: meta.primarySaleHappened ?? null,
      is_mutable: meta.isMutable ?? null,
      edition_nonce: meta.editionNonce ?? null,
      token_standard: meta.tokenStandard ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'mint' })

    return jsonResponse(meta, req)
  }

  // ---------------------------------------------------------------------------
  // metadata-refresh – batch refresh (admin)
  // ---------------------------------------------------------------------------
  if (action === 'metadata-refresh') {
    const mints = body.mints as string[]
    if (!Array.isArray(mints)) return errorResponse('mints array required', req)

    const connection = getSolanaConnection()
    const results: Record<string, boolean> = {}
    for (const mint of mints.slice(0, 50)) { // cap at 50 per call
      const meta = await fetchMintMetadataFromChain(connection, mint)
      if (meta) {
        await db.from('mint_metadata').upsert({
          mint,
          name: meta.name,
          symbol: meta.symbol,
          image: meta.image,
          decimals: meta.decimals,
          update_authority: meta.updateAuthority ?? null,
          uri: meta.uri ?? null,
          seller_fee_basis_points: meta.sellerFeeBasisPoints ?? null,
          primary_sale_happened: meta.primarySaleHappened ?? null,
          is_mutable: meta.isMutable ?? null,
          edition_nonce: meta.editionNonce ?? null,
          token_standard: meta.tokenStandard ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'mint' })
        results[mint] = true
      } else {
        results[mint] = false
      }
    }
    return jsonResponse({ refreshed: results }, req)
  }

  // ---------------------------------------------------------------------------
  // metadata-seed-from-configs – seed mint_metadata from tenant configs (platform admin)
  // Uses tenant_mint_catalog.kind (SPL vs NFT), fetches collection members via getAssetsByGroup.
  // ---------------------------------------------------------------------------
  if (action === 'metadata-seed-from-configs') {
    const authHeader = req.headers.get('Authorization')
    const bearer = authHeader?.trim()
    if (!bearer || !bearer.toLowerCase().startsWith('bearer ')) {
      return errorResponse('Not signed in. Connect your wallet and sign in first.', req, 401)
    }
    const userClient = getUserClient(authHeader)
    const { data: wallet, error: rpcError } = await userClient.rpc('check_platform_admin')
    if (rpcError) return errorResponse(`Auth error: ${rpcError.message}`, req, 401)
    if (!wallet) return errorResponse('Platform admin only. Your wallet is not authorised.', req, 403)

    const limit = Math.min(Math.max(1, (body.limit as number) ?? 100), 200)
    const rpcUrl = Deno.env.get('HELIUS_RPC_URL') ?? Deno.env.get('SOLANA_RPC_URL')
    if (!rpcUrl) return errorResponse('RPC not configured', req, 500)

    const { fetchMintMetadata } = await import('../_shared/mint-metadata.ts')

    const [catalogRes, watchesRes, scopeRes] = await Promise.all([
      db.from('tenant_mint_catalog').select('mint, kind'),
      db.from('watchtower_watches').select('mint'),
      db.from('marketplace_mint_scope').select('mint, source, collection_mint'),
    ])

    const kindByMint = new Map<string, 'SPL' | 'NFT'>()
    for (const r of catalogRes.data ?? []) {
      kindByMint.set(r.mint as string, (r.kind as 'SPL' | 'NFT') ?? 'SPL')
    }

    const mintsToSeed = new Map<string, 'SPL' | 'NFT'>()
    const memberMetaByMint = new Map<string, { name: string | null; image: string | null; traits: unknown }>()
    for (const r of catalogRes.data ?? []) {
      mintsToSeed.set(r.mint as string, kindByMint.get(r.mint as string) ?? 'SPL')
    }
    for (const r of watchesRes.data ?? []) {
      const m = r.mint as string
      if (!mintsToSeed.has(m)) mintsToSeed.set(m, kindByMint.get(m) ?? 'SPL')
    }
    for (const r of scopeRes.data ?? []) {
      const m = r.mint as string
      const src = r.source as string
      const kind = src === 'collection' ? 'NFT' as const : 'SPL' as const
      if (!mintsToSeed.has(m)) mintsToSeed.set(m, kindByMint.get(m) ?? kind)
      if (r.collection_mint && !mintsToSeed.has(r.collection_mint as string)) {
        mintsToSeed.set(r.collection_mint as string, 'NFT')
      }
    }

    const collectionMintsInScope = new Set(
      (scopeRes.data ?? []).filter((r) => r.source === 'collection').map((r) => (r.collection_mint ?? r.mint) as string),
    )

    for (const collectionMint of collectionMintsInScope) {
      const { data: existing } = await db.from('collection_members').select('mint').eq('collection_mint', collectionMint).limit(1).maybeSingle()
      if (existing) continue

      let page = 1
      let hasMore = true
      const allMembers: Array<{ collection_mint: string; mint: string; name: string | null; image: string | null; traits: unknown; owner: string | null }> = []
      const now = new Date().toISOString()

      while (hasMore) {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAssetsByGroup',
            params: { groupKey: 'collection', groupValue: collectionMint, limit: 1000, page },
          }),
        })
        if (!res.ok) break
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
          const attrs = metadata?.attributes as Array<{ trait_type?: string; value?: string }> | undefined
          const traits = Array.isArray(attrs) ? attrs : []
          const owner = ownership?.owner ?? null
          allMembers.push({ collection_mint: collectionMint, mint: id, name: nftName, image: nftImage, traits, owner })
          mintsToSeed.set(id, 'NFT')
          memberMetaByMint.set(id, { name: nftName, image: nftImage, traits })
        }
        hasMore = items.length >= 1000
        page++
      }
      if (allMembers.length > 0) {
        await db.from('collection_members').upsert(
          allMembers.map((m) => ({ ...m, updated_at: now })),
          { onConflict: 'collection_mint,mint' },
        )
      }
    }

    const { data: existing } = await db.from('mint_metadata').select('mint').in('mint', [...mintsToSeed.keys()])
    const existingSet = new Set((existing ?? []).map((r) => r.mint as string))
    const toSeed = [...mintsToSeed.entries()].filter(([m]) => !existingSet.has(m)).slice(0, limit)

    if (toSeed.length === 0) {
      return jsonResponse({ seeded: 0, total: mintsToSeed.size, message: 'All mints already in mint_metadata or no mints found in configs.' }, req)
    }

    const now = new Date().toISOString()
    let seeded = 0
    for (const [mint, kind] of toSeed) {
      const memberMeta = memberMetaByMint.get(mint)
      if (memberMeta) {
        await db.from('mint_metadata').upsert({
          mint,
          name: memberMeta.name,
          symbol: null,
          image: memberMeta.image,
          decimals: 0,
          traits: memberMeta.traits ?? null,
          trait_index: null,
          update_authority: null,
          uri: null,
          seller_fee_basis_points: null,
          primary_sale_happened: null,
          is_mutable: null,
          edition_nonce: null,
          token_standard: 'NonFungible',
          updated_at: now,
        }, { onConflict: 'mint' })
        seeded++
      } else {
        const meta = await fetchMintMetadata(mint, kind)
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
        }
      }
    }
    return jsonResponse({
      seeded,
      total: toSeed.length,
      remaining: mintsToSeed.size - existingSet.size - seeded,
      message: `Seeded ${seeded} mints (SPL/NFT by catalog). ${toSeed.length - seeded} failed. Run again to continue.`,
    }, req)
  }

  // ---------------------------------------------------------------------------
  // metadata-refresh-all – refresh all mints in mint_metadata (platform admin)
  // ---------------------------------------------------------------------------
  if (action === 'metadata-refresh-all') {
    const authHeader = req.headers.get('Authorization')
    const bearer = authHeader?.trim()
    if (!bearer || !bearer.toLowerCase().startsWith('bearer ')) {
      return errorResponse('Not signed in. Connect your wallet and sign in first.', req, 401)
    }
    const userClient = getUserClient(authHeader)
    const { data: wallet, error: rpcError } = await userClient.rpc('check_platform_admin')
    if (rpcError) return errorResponse(`Auth error: ${rpcError.message}`, req, 401)
    if (!wallet) return errorResponse('Platform admin only. Your wallet is not authorised.', req, 403)

    const limit = Math.min(Math.max(1, (body.limit as number) ?? 200), 500)
    const offset = Math.max(0, (body.offset as number) ?? 0)
    const db = getAdminClient()
    const { data: rows } = await db
      .from('mint_metadata')
      .select('mint')
      .range(offset, offset + limit - 1)
    const mints = (rows ?? []).map((r) => r.mint as string)
    if (mints.length === 0) {
      return jsonResponse({ refreshed: 0, total: 0, message: 'No mints in mint_metadata' }, req)
    }

    const connection = getSolanaConnection()
    let refreshed = 0
    const results: Record<string, boolean> = {}
    for (const mint of mints) {
      const meta = await fetchMintMetadataFromChain(connection, mint)
      if (meta) {
        await db.from('mint_metadata').upsert({
          mint,
          name: meta.name,
          symbol: meta.symbol,
          image: meta.image,
          decimals: meta.decimals,
          update_authority: meta.updateAuthority ?? null,
          uri: meta.uri ?? null,
          seller_fee_basis_points: meta.sellerFeeBasisPoints ?? null,
          primary_sale_happened: meta.primarySaleHappened ?? null,
          is_mutable: meta.isMutable ?? null,
          edition_nonce: meta.editionNonce ?? null,
          token_standard: meta.tokenStandard ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'mint' })
        results[mint] = true
        refreshed++
      } else {
        results[mint] = false
      }
    }
    const nextOffset = offset + mints.length
    return jsonResponse({
      refreshed,
      total: mints.length,
      offset,
      nextOffset: mints.length === limit ? nextOffset : null,
      results,
      message: mints.length === limit
        ? `Refreshed ${refreshed} of ${mints.length} mints. Call with offset=${nextOffset} to continue.`
        : `Refreshed ${refreshed} of ${mints.length} mints.`,
    }, req)
  }

  // ---------------------------------------------------------------------------
  // resolve – resolve mint to asset kind
  // ---------------------------------------------------------------------------
  if (action === 'resolve') {
    const mint = body.mint as string
    if (!mint) return errorResponse('mint required', req)

    // Check DB cache first (mint_metadata.decimals == 0 and no SPL characteristics → NFT)
    const { data: cached } = await db
      .from('mint_metadata')
      .select('decimals')
      .eq('mint', mint)
      .maybeSingle()

    if (cached) {
      const kind = (cached.decimals as number) === 0 ? 'NFT' : 'SPL'
      return jsonResponse({ kind }, req)
    }

    const connection = getSolanaConnection()
    const kind = await resolveAssetKind(connection, mint)
    return jsonResponse({ kind: kind ?? null }, req)
  }

  // ---------------------------------------------------------------------------
  // resolve-full – resolve mint to kind + metadata for MintAssetPicker
  // ---------------------------------------------------------------------------
  if (action === 'resolve-full') {
    const mint = body.mint as string
    const kindHint = body.kind as 'SPL' | 'NFT' | 'auto' | undefined
    if (!mint) return errorResponse('mint required', req)

    const { fetchMintMetadata } = await import('../_shared/mint-metadata.ts')
    const hint = kindHint === 'auto' || !kindHint ? undefined : kindHint
    const meta = await fetchMintMetadata(mint, hint)
    if (!meta) return errorResponse('Mint not found or invalid', req, 404)

    if (meta.kind === 'SPL') {
      return jsonResponse({
        kind: 'SPL',
        spl: { mint, name: meta.name ?? undefined, symbol: meta.label ?? undefined, image: meta.image ?? undefined },
      }, req)
    }
    const traitKeys = meta.traitIndex && typeof meta.traitIndex === 'object' && 'trait_keys' in meta.traitIndex
      ? (meta.traitIndex.trait_keys as string[])
      : undefined
    return jsonResponse({
      kind: 'NFT',
      collection: {
        mint,
        name: meta.name ?? undefined,
        image: meta.image ?? undefined,
        collectionSize: meta.collectionSize ?? undefined,
        uniqueTraitCount: traitKeys?.length ?? undefined,
        traitTypes: traitKeys,
      },
    }, req)
  }

  // ---------------------------------------------------------------------------
  // escrows – list on-chain escrows for a tenant's scope
  // ---------------------------------------------------------------------------
  if (action === 'escrows') {
    const tenantId = body.tenantId as string
    const wallet = (body.wallet as string)?.trim() || null
    if (!tenantId) return errorResponse('tenantId required', req)

    const { data: scope } = await db
      .from('marketplace_mint_scope')
      .select('mint, source, collection_mint')
      .eq('tenant_id', tenantId)

    const scopeRows = scope ?? []
    const singleMints = scopeRows
      .filter((r) => r.source !== 'collection')
      .map((r) => r.mint as string)
    const collectionMints = [...new Set(
      scopeRows
        .filter((r) => r.source === 'collection')
        .map((r) => (r.collection_mint ?? r.mint) as string),
    )]
    let scopeMints = [...singleMints]
    if (collectionMints.length > 0) {
      const { data: members } = await db
        .from('collection_members')
        .select('mint')
        .in('collection_mint', collectionMints)
      scopeMints = [...scopeMints, ...(members ?? []).map((r) => r.mint as string)]
    }
    if (scopeMints.length === 0) return jsonResponse({ escrows: [] }, req)

    const connection = getSolanaConnection()
    let escrows = await fetchEscrowsInScope(connection, scopeMints)
    if (wallet) {
      escrows = escrows.filter((e) => (e.account.maker as string) === wallet)
    }
    return jsonResponse({ escrows }, req)
  }

  // ---------------------------------------------------------------------------
  // scope-sync – sync marketplace_mint_scope and tenant_mint_catalog from settings (admin)
  // ---------------------------------------------------------------------------
  if (action === 'scope-sync') {
    const tenantId = body.tenantId as string
    const collectionMints = (body.collectionMints as Array<{ mint: string; name?: string; image?: string }>) ?? []
    const splAssetMints = (body.splAssetMints as Array<{ mint: string; name?: string; symbol?: string; image?: string }>) ?? []
    const currencyMints = (body.currencyMints as Array<{ mint: string; name?: string; symbol?: string; image?: string }>) ?? []
    if (!tenantId) return errorResponse('tenantId required', req)

    const authHeader = req.headers.get('Authorization')
    const wallet = await getWalletFromAuthHeader(authHeader)
    if (!wallet) return errorResponse('Not signed in', req, 401)

    const { data: tenant } = await db.from('tenant_config').select('admins').eq('id', tenantId).maybeSingle()
    const admins = (tenant?.admins as string[]) ?? []
    const isAdmin = admins.some((a) => String(a).toLowerCase() === wallet.toLowerCase())
    if (!isAdmin) return errorResponse('Tenant admin only', req, 403)

    const now = new Date().toISOString()

    const { fetchMintMetadata } = await import('../_shared/mint-metadata.ts')

    const catalogRows: Array<{ tenant_id: string; mint: string; kind: 'SPL' | 'NFT'; label: string | null }> = []
    for (const m of collectionMints) {
      let label = m.name ?? null
      if (!label) {
        const meta = await fetchMintMetadata(m.mint, undefined)
        if (meta) { label = meta.label ?? meta.name ?? null }
      }
      catalogRows.push({ tenant_id: tenantId, mint: m.mint, kind: 'NFT', label })
    }
    for (const m of splAssetMints) {
      let label = m.name ?? m.symbol ?? null
      if (!label) {
        const meta = await fetchMintMetadata(m.mint, 'SPL')
        if (meta) { label = meta.label ?? meta.name ?? null }
      }
      catalogRows.push({ tenant_id: tenantId, mint: m.mint, kind: 'SPL', label })
    }
    for (const m of currencyMints) {
      let label = m.name ?? m.symbol ?? null
      if (!label) {
        const meta = await fetchMintMetadata(m.mint, 'SPL')
        if (meta) { label = meta.label ?? meta.name ?? null }
      }
      catalogRows.push({ tenant_id: tenantId, mint: m.mint, kind: 'SPL', label })
    }
    const catalogUnique = [...new Map(catalogRows.map((r) => [r.mint, r])).values()]
    if (catalogUnique.length > 0) {
      await db.from('tenant_mint_catalog').upsert(
        catalogUnique.map((r) => ({ ...r, updated_at: now })),
        { onConflict: 'tenant_id,mint' },
      )
      // Ensure mint_metadata has name/image for display (resolve from chain if missing)
      const collectionMintSet = new Set(collectionMints.map((c) => c.mint))
      const allMints = [...collectionMints, ...splAssetMints, ...currencyMints]
      for (const m of allMints) {
        const kindHint = collectionMintSet.has(m.mint) ? 'NFT' as const : 'SPL' as const
        const meta = await fetchMintMetadata(m.mint, kindHint)
        if (meta) {
          await db.from('mint_metadata').upsert({
            mint: m.mint,
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
        }
      }
    }

    const scopeRows: Array<{ tenant_id: string; mint: string; source: string; collection_mint: string | null }> = []
    for (const m of collectionMints) {
      scopeRows.push({ tenant_id: tenantId, mint: m.mint, source: 'collection', collection_mint: m.mint })
    }
    for (const m of splAssetMints) {
      scopeRows.push({ tenant_id: tenantId, mint: m.mint, source: 'spl_asset', collection_mint: null })
    }
    for (const m of currencyMints) {
      scopeRows.push({ tenant_id: tenantId, mint: m.mint, source: 'currency', collection_mint: null })
    }
    await db.from('marketplace_mint_scope').delete().eq('tenant_id', tenantId)
    if (scopeRows.length > 0) {
      await db.from('marketplace_mint_scope').insert(scopeRows)
    }

    return jsonResponse({ catalogSynced: catalogUnique.length, scopeSynced: scopeRows.length }, req)
  }

  // ---------------------------------------------------------------------------
  // scope-expand – ensure collection_members populated, add one scope row per collection (Option A)
  // ---------------------------------------------------------------------------
  if (action === 'scope-expand') {
    const tenantId = body.tenantId as string
    const collectionMint = body.collectionMint as string
    if (!tenantId || !collectionMint) return errorResponse('tenantId and collectionMint required', req)

    const rpcUrl = Deno.env.get('HELIUS_RPC_URL') ?? Deno.env.get('SOLANA_RPC_URL')
    if (!rpcUrl) return errorResponse('RPC not configured', req, 500)

    try {
      const { data: existing } = await db
        .from('collection_members')
        .select('mint')
        .eq('collection_mint', collectionMint)
        .limit(1)
        .maybeSingle()

      if (!existing) {
        let page = 1
        let hasMore = true
        const allMembers: Array<{ collection_mint: string; mint: string; name: string | null; image: string | null; traits: unknown; owner: string | null }> = []
        const now = new Date().toISOString()

        while (hasMore) {
          const res = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getAssetsByGroup',
              params: { groupKey: 'collection', groupValue: collectionMint, limit: 1000, page },
            }),
          })
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
            const attrs = metadata?.attributes as Array<{ trait_type?: string; value?: string }> | undefined
            const traits = Array.isArray(attrs) ? attrs : []
            const owner = ownership?.owner ?? null
            allMembers.push({
              collection_mint: collectionMint,
              mint: id,
              name: nftName,
              image: nftImage,
              traits,
              owner,
            })
          }
          hasMore = items.length >= 1000
          page++
        }

        if (allMembers.length > 0) {
          await db.from('collection_members').upsert(
            allMembers.map((m) => ({ ...m, updated_at: now })),
            { onConflict: 'collection_mint,mint' },
          )
        }
      }

      await db.from('tenant_collection_scope').upsert(
        { tenant_id: tenantId, collection_mint: collectionMint },
        { onConflict: 'tenant_id,collection_mint' },
      )
      await db.from('marketplace_mint_scope').upsert(
        { tenant_id: tenantId, mint: collectionMint, source: 'collection', collection_mint: collectionMint },
        { onConflict: 'tenant_id,mint' },
      )

      const { count } = await db
        .from('collection_members')
        .select('*', { count: 'exact', head: true })
        .eq('collection_mint', collectionMint)
      return jsonResponse({ expanded: count ?? 0, collectionMint }, req)
    } catch (e) {
      return errorResponse(e instanceof Error ? e.message : 'Expand failed', req, 500)
    }
  }

  // ---------------------------------------------------------------------------
  // collection-preview – admin: fetch collection metadata + traits for display
  // ---------------------------------------------------------------------------
  if (action === 'collection-preview') {
    const mint = body.mint as string
    if (!mint) return errorResponse('mint required', req)

    const rpcUrl = Deno.env.get('HELIUS_RPC_URL') ?? Deno.env.get('SOLANA_RPC_URL')
    if (!rpcUrl) return errorResponse('RPC not configured', req, 500)

    try {
      const assetRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }),
      })
      if (!assetRes.ok) return errorResponse('RPC request failed', req, 502)
      const assetData = await assetRes.json() as { result?: Record<string, unknown> }
      const asset = assetData.result

      let collectionSize = 0
      const traitTypesSet = new Set<string>()
      let page = 1
      let hasMore = true

      while (hasMore) {
        const r = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'getAssetsByGroup',
            params: { groupKey: 'collection', groupValue: mint, limit: 1000, page },
          }),
        })
        if (!r.ok) break
        const d = await r.json() as { result?: { items?: Array<Record<string, unknown>>; total?: number } }
        const items = d.result?.items ?? []
        if (page === 1 && d.result?.total) collectionSize = d.result.total
        for (const item of items) {
          const attrs = ((item.content as Record<string, unknown>)?.metadata as Record<string, unknown>)?.attributes as Array<{ trait_type?: string }> | undefined
          if (attrs) for (const a of attrs) if (a.trait_type) traitTypesSet.add(a.trait_type)
        }
        hasMore = items.length >= 1000
        page++
      }

      const meta = (asset?.content as Record<string, unknown>)?.metadata as Record<string, unknown> | undefined
      const { extractExtendedMetadata } = await import('../_shared/mint-metadata.ts')
      const ext = extractExtendedMetadata(asset as Record<string, unknown>)
      return jsonResponse({
        name: meta?.name ?? null,
        symbol: meta?.symbol ?? null,
        image: ((asset?.content as Record<string, unknown>)?.links as Record<string, unknown>)?.image ?? null,
        sellerFeeBasisPoints: typeof meta?.seller_fee_basis_points === 'number' ? meta.seller_fee_basis_points : null,
        collectionSize,
        uniqueTraitCount: traitTypesSet.size,
        traitTypes: [...traitTypesSet].sort(),
        ...ext,
      }, req)
    } catch (e) {
      return errorResponse(e instanceof Error ? e.message : 'Preview failed', req, 500)
    }
  }

  // ---------------------------------------------------------------------------
  // spl-preview – admin: fetch SPL token metadata for display
  // ---------------------------------------------------------------------------
  if (action === 'spl-preview') {
    const mint = body.mint as string
    if (!mint) return errorResponse('mint required', req)

    const rpcUrl = Deno.env.get('HELIUS_RPC_URL') ?? Deno.env.get('SOLANA_RPC_URL')
    if (!rpcUrl) return errorResponse('RPC not configured', req, 500)

    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }),
      })
      if (!res.ok) return errorResponse('RPC request failed', req, 502)
      const data = await res.json() as { result?: Record<string, unknown> }
      const asset = data.result
      if (asset) {
        const meta = (asset.content as Record<string, unknown>)?.metadata as Record<string, unknown> | undefined
        const tokenInfo = asset.token_info as Record<string, unknown> | undefined
        const { extractExtendedMetadata } = await import('../_shared/mint-metadata.ts')
        const ext = extractExtendedMetadata(asset as Record<string, unknown>)
        return jsonResponse({
          name: meta?.name ?? null,
          symbol: meta?.symbol ?? null,
          image: ((asset.content as Record<string, unknown>)?.links as Record<string, unknown>)?.image ?? null,
          decimals: tokenInfo?.decimals ?? null,
          sellerFeeBasisPoints: typeof meta?.seller_fee_basis_points === 'number' ? meta.seller_fee_basis_points : null,
          ...ext,
        }, req)
      }
      return errorResponse('Asset not found', req, 404)
    } catch (e) {
      return errorResponse(e instanceof Error ? e.message : 'Preview failed', req, 500)
    }
  }

  // ---------------------------------------------------------------------------
  // escrow – single escrow by address (API fallback when client has no RPC)
  // ---------------------------------------------------------------------------
  if (action === 'escrow') {
    const escrowId = (body.escrowId as string)?.trim()
    if (!escrowId) return errorResponse('escrowId required', req)
    try {
      const connection = getSolanaConnection()
      const pubkey = new PublicKey(escrowId)
      const account = await connection.getAccountInfo(pubkey)
      if (!account?.data) return jsonResponse({ escrow: null }, req)
      const data = toUint8Array(account.data)
      const parsed = parseEscrowAccount(data, escrowId)
      return jsonResponse({ escrow: parsed }, req)
    } catch {
      return jsonResponse({ escrow: null }, req)
    }
  }

  // ---------------------------------------------------------------------------
  // catalog-add – add a mint to tenant_mint_catalog with auto-detected kind
  // ---------------------------------------------------------------------------
  if (action === 'catalog-add') {
    const tenantId = body.tenantId as string
    const mint = body.mint as string
    const kindHint = body.kind as 'SPL' | 'NFT' | 'auto' | undefined
    if (!tenantId || !mint) return errorResponse('tenantId and mint required', req)

    const rpcUrl = Deno.env.get('HELIUS_RPC_URL') ?? Deno.env.get('SOLANA_RPC_URL')
    if (!rpcUrl) return errorResponse('RPC not configured', req, 500)

    // Try collection (NFT) first unless hint says SPL
    if (kindHint !== 'SPL') {
      try {
        const colRes = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'getAssetsByGroup',
            params: { groupKey: 'collection', groupValue: mint, limit: 1, page: 1 },
          }),
        })
        const colData = await colRes.json() as { result?: { total?: number } }
        if ((colData.result?.total ?? 0) > 0) {
          // Build trait_index from first page
          const traitKeys = new Set<string>()
          const traitOptions: Record<string, Set<string>> = {}
          let pgN = 1
          let more = true
          while (more) {
            const r2 = await fetch(rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAssetsByGroup', params: { groupKey: 'collection', groupValue: mint, limit: 1000, page: pgN } }),
            })
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
            more = items.length >= 1000
            pgN++
          }

          // Get collection metadata
          const metaRes = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }) })
          const metaData = await metaRes.json() as { result?: Record<string, unknown> }
          const assetMeta = (metaData.result?.content as Record<string, unknown>)?.metadata as Record<string, unknown> | undefined

          const traitIndex = {
            trait_keys: [...traitKeys],
            trait_options: Object.fromEntries([...Object.entries(traitOptions)].map(([k, v]) => [k, [...v]])),
          }

          await db.from('mint_metadata').upsert({
            mint,
            name: assetMeta?.name as string ?? null,
            image: ((metaData.result?.content as Record<string, unknown>)?.links as Record<string, unknown>)?.image as string ?? null,
            trait_index: traitIndex,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'mint' })
          const { data: entry, error } = await db.from('tenant_mint_catalog').upsert({
            tenant_id: tenantId,
            mint,
            kind: 'NFT',
            label: assetMeta?.name as string ?? null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tenant_id,mint' }).select().single()
          if (error) return errorResponse(error.message, req, 500)
          return jsonResponse({ entry }, req)
        }
      } catch { /* fall through to SPL */ }
    }

    // SPL token
    try {
      const res = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }) })
      const data = await res.json() as { result?: Record<string, unknown> }
      const asset = data.result
      const meta = (asset?.content as Record<string, unknown>)?.metadata as Record<string, unknown> | undefined
      const tokenInfo = asset?.token_info as Record<string, unknown> | undefined

      await db.from('mint_metadata').upsert({
        mint,
        name: meta?.name as string ?? null,
        symbol: meta?.symbol as string ?? null,
        image: ((asset?.content as Record<string, unknown>)?.links as Record<string, unknown>)?.image as string ?? null,
        decimals: tokenInfo?.decimals as number ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'mint' })

      const { data: entry, error } = await db.from('tenant_mint_catalog').upsert({
        tenant_id: tenantId,
        mint,
        kind: 'SPL',
        label: meta?.name as string ?? meta?.symbol as string ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,mint' }).select().single()

      if (error) return errorResponse(error.message, req, 500)
      return jsonResponse({ entry }, req)
    } catch (e) {
      return errorResponse(e instanceof Error ? e.message : 'Failed to add mint', req, 500)
    }
  }

  // ---------------------------------------------------------------------------
  // catalog-refresh-traits – refresh trait_index for an NFT collection in catalog
  // ---------------------------------------------------------------------------
  if (action === 'catalog-refresh-traits') {
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
      let pgN = 1
      let more = true
      while (more) {
        const r = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAssetsByGroup', params: { groupKey: 'collection', groupValue: mint, limit: 1000, page: pgN } }),
        })
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
        more = items.length >= 1000
        pgN++
      }

      const traitIndex = {
        trait_keys: [...traitKeys],
        trait_options: Object.fromEntries([...Object.entries(traitOptions)].map(([k, v]) => [k, [...v]])),
      }

      await db.from('mint_metadata').update({
        trait_index: traitIndex,
        updated_at: new Date().toISOString(),
      }).eq('mint', mint)

      const { data: entry } = await db
        .from('tenant_mint_catalog')
        .select('id, mint, kind, label')
        .eq('id', catalogId)
        .eq('tenant_id', tenantId)
        .single()
      return jsonResponse({ entry: entry ?? { id: catalogId, mint, kind: 'NFT', label: null } }, req)
    } catch (e) {
      return errorResponse(e instanceof Error ? e.message : 'Failed to refresh traits', req, 500)
    }
  }

  return errorResponse(`Unknown action: ${action}`, req, 400)
})
