/**
 * Tracker sync cron Edge Function.
 * Called by pg_cron every 5 minutes (testing) or 30 for production.
 *
 * For each mint in watchtower_watches with track_snapshot OR track_holders:
 *   - track_snapshot: holder snapshot in holder_snapshots (time-bucketed).
 *   - track_holders: current holders in holder_current (conditions, shipment, Discord).
 *
 * Holders are controlled by Watchtower module payment, not Discord deployment.
 * Processes mints in chunks of 20 per invocation to stay within CPU limits.
 *
 * Body: { syncMint?, tenantId? } – when present, sync only that mint (for immediate fetch on track activation).
 */

import { jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getWithinLimitMints } from '../_shared/watchtower-billing.ts'
import { getSolanaConnection, getRpcUrl } from '../_shared/solana-connection.ts'
import { Connection, PublicKey } from 'npm:@solana/web3.js@1'
import { TOKEN_PROGRAM_ID } from 'npm:@solana/spl-token@0.4'

const METADATA_REFRESH_AGE_DAYS = 7
const CHUNK_SIZE = 20

/** Snapshot interval in minutes. TEMP: 5 for testing multiple snapshots; use 1440 (24h) for daily. */
const SNAPSHOT_INTERVAL_MINUTES = 5
const SPL_DATA_SIZE = 165

// ---------------------------------------------------------------------------
// Mint metadata
// ---------------------------------------------------------------------------

async function fetchMintMetadata(
  rpcEndpoint: string,
  mint: string,
): Promise<{
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
    const res = await fetch(rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }),
    })
    if (!res.ok) return null
    const data = await res.json() as { result?: Record<string, unknown> }
    const asset = data.result as Record<string, unknown> | undefined
    if (!asset) return null
    const content = asset.content as Record<string, unknown> | undefined
    const metadata = (content?.metadata as Record<string, unknown>) ?? {}
    const links = (content?.links as Record<string, unknown>) ?? {}
    const tokenInfo = asset.token_info as Record<string, unknown> | undefined
    const decimals = typeof tokenInfo?.decimals === 'number' ? tokenInfo.decimals : null
    const { extractExtendedMetadata } = await import('../_shared/mint-metadata.ts')
    const ext = extractExtendedMetadata(asset)
    return {
      name: (metadata.name as string) ?? null,
      symbol: (metadata.symbol as string) ?? null,
      image: (links.image as string) ?? null,
      decimals,
      ...ext,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Holder fetching
// ---------------------------------------------------------------------------

async function fetchSplHolders(
  connection: Connection,
  mint: string,
): Promise<Array<{ wallet: string; amount: string }>> {
  const mintPk = new PublicKey(mint)
  const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    commitment: 'confirmed',
    filters: [
      { dataSize: SPL_DATA_SIZE },
      { memcmp: { offset: 0, bytes: mintPk.toBase58() } },
    ],
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
  return [...byWallet.entries()].map(([wallet, amount]) => ({ wallet, amount: String(amount) }))
}

async function fetchNftHolders(
  rpcEndpoint: string,
  mint: string,
): Promise<Array<{ wallet: string; amount: string }>> {
  const countByWallet = new Map<string, number>()
  let page = 1
  let hasMore = true
  while (hasMore) {
    const res = await fetch(rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getAssetsByGroup',
        params: { groupKey: 'collection', groupValue: mint, limit: 1000, page },
      }),
    })
    const data = await res.json() as { result?: { items?: Array<{ ownership?: { owner?: string } }> } }
    const items = data.result?.items ?? []
    for (const item of items) {
      const owner = item.ownership?.owner
      if (owner) countByWallet.set(owner, (countByWallet.get(owner) ?? 0) + 1)
    }
    hasMore = items.length === 1000
    page++
  }
  return [...countByWallet.entries()].map(([wallet, amount]) => ({ wallet, amount: String(amount) }))
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  const db = getAdminClient()
  const connection = getSolanaConnection()
  const rpcEndpoint = getRpcUrl()
  const now = new Date()
  // Round down to SNAPSHOT_INTERVAL_MINUTES for snapshot bucket (e.g. 5 min for testing)
  const bucket = new Date(now)
  bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / SNAPSHOT_INTERVAL_MINUTES) * SNAPSHOT_INTERVAL_MINUTES, 0, 0)
  const snapshotAt = bucket.toISOString()
  const snapshotDate = bucket.toISOString().slice(0, 10)

  let offset = 0
  let syncMint: string | null = null
  let syncTenantId: string | null = null
  try {
    const body = await req.json() as Record<string, unknown>
    offset = (body.offset as number) ?? 0
    syncMint = (body.syncMint as string)?.trim() || null
    syncTenantId = (body.tenantId as string)?.trim() || null
  } catch { /* no body */ }

  // Single-mint sync (immediate fetch on track activation)
  if (syncMint && syncTenantId) {
    const { data: watch } = await db
      .from('watchtower_watches')
      .select('track_holders, track_snapshot')
      .eq('tenant_id', syncTenantId)
      .eq('mint', syncMint)
      .maybeSingle()
    if (!watch || (!watch.track_holders && !watch.track_snapshot)) {
      return jsonResponse({ processed: 0, synced: 0, message: 'Mint not watched' }, req)
    }
    const [discordWithin, snapshotWithin] = await Promise.all([
      watch.track_holders ? getWithinLimitMints(db, syncTenantId, 'mints_current') : Promise.resolve(new Set<string>()),
      watch.track_snapshot ? getWithinLimitMints(db, syncTenantId, 'mintsSnapshot') : Promise.resolve(new Set<string>()),
    ])
    const syncDiscord = watch.track_holders && discordWithin.has(syncMint)
    const syncSnapshot = watch.track_snapshot && snapshotWithin.has(syncMint)
    if (!syncDiscord && !syncSnapshot) {
      return jsonResponse({ processed: 0, synced: 0, message: 'Mint over paid limit' }, req)
    }
    const { data: catalog } = await db
      .from('tenant_mint_catalog')
      .select('kind')
      .eq('tenant_id', syncTenantId)
      .eq('mint', syncMint)
      .maybeSingle()
    const kind = (catalog?.kind as 'SPL' | 'NFT') ?? 'NFT'
    let holders: Array<{ wallet: string; amount: string }>
    if (kind === 'SPL') {
      holders = await fetchSplHolders(connection, syncMint)
    } else {
      holders = await fetchNftHolders(rpcEndpoint, syncMint)
    }
    if (syncDiscord) {
      await db.from('holder_current').upsert({
        mint: syncMint,
        holder_wallets: holders,
        last_updated: now.toISOString(),
      }, { onConflict: 'mint' })
    }
    if (syncSnapshot) {
      const { data: existing } = await db
        .from('holder_snapshots')
        .select('mint')
        .eq('mint', syncMint)
        .eq('snapshot_at', snapshotAt)
        .maybeSingle()
      if (!existing) {
        await db.from('holder_snapshots').upsert({
          mint: syncMint,
          snapshot_at: snapshotAt,
          holder_wallets: holders,
          snapshot_date: snapshotDate,
          created_at: now.toISOString(),
        }, { onConflict: 'mint,snapshot_at' })
        await db.from('tracker_holder_snapshots').upsert({
          tenant_id: syncTenantId,
          mint: syncMint,
          holder_wallets: holders,
          snapshot_date: snapshotDate,
          snapshot_at: snapshotAt,
          created_at: now.toISOString(),
        }, { onConflict: 'tenant_id,mint,snapshot_at' })
      }
    }
    return jsonResponse({ processed: 1, synced: 1 }, req)
  }

  // Load mints with track_snapshot OR track_holders (with track flags)
  const { data: allWatches, error: watchErr } = await db
    .from('watchtower_watches')
    .select('tenant_id, mint, track_holders, track_snapshot')
    .or('track_snapshot.eq.true,track_holders.eq.true')
    .range(offset, offset + CHUNK_SIZE - 1)

  if (watchErr) return errorResponse(watchErr.message, req, 500)
  const mints = allWatches ?? []
  if (!mints.length) return jsonResponse({ processed: 0, synced: 0 }, req)

  console.log('[cron-tracker] batch run', { snapshotAt, offset, mintCount: mints.length })

  const tenantIds = [...new Set(mints.map((m) => String(m.tenant_id ?? '')))].filter(Boolean) as string[]
  const withinByTenant = new Map<string, { mints_current: Set<string>; mintsSnapshot: Set<string> }>()
  for (const tid of tenantIds) {
    const [mints_current, mintsSnapshot] = await Promise.all([
      getWithinLimitMints(db, tid, 'mints_current'),
      getWithinLimitMints(db, tid, 'mintsSnapshot'),
    ])
    withinByTenant.set(tid, { mints_current, mintsSnapshot })
  }

  const mintKeys = mints.map((m) => String(m.mint ?? ''))
  const { data: catalogRows } = await db
    .from('tenant_mint_catalog')
    .select('mint, kind')
    .in('mint', mintKeys)
  const catalog = (catalogRows ?? []) as Array<{ mint: string; kind: string }>
  const kindByMint = new Map<string, 'SPL' | 'NFT'>(catalog.map((r) => [r.mint, r.kind as 'SPL' | 'NFT']))

  let processed = 0
  let synced = 0

  for (const row of mints) {
    const mint = row.mint as string
    const tenantId = row.tenant_id as string
    const kind = kindByMint.get(mint) ?? 'NFT'
    const trackHolders = Boolean(row.track_holders)
    const trackSnapshot = Boolean(row.track_snapshot)
    const within = withinByTenant.get(tenantId)
    const syncDiscord = trackHolders && within?.mints_current.has(mint)
    const syncSnapshot = trackSnapshot && within?.mintsSnapshot.has(mint)
    if (!syncDiscord && !syncSnapshot) continue

    try {
      // 1. Refresh metadata if stale (for snapshot mints)
      if (trackSnapshot) {
        const { data: meta } = await db
          .from('mint_metadata')
          .select('updated_at')
          .eq('mint', mint)
          .maybeSingle()

        const metaAge = meta
          ? (now.getTime() - new Date(meta.updated_at as string).getTime()) / (1000 * 60 * 60 * 24)
          : Infinity

        if (metaAge > METADATA_REFRESH_AGE_DAYS) {
          const fetched = await fetchMintMetadata(rpcEndpoint, mint)
          if (fetched) {
            await db.from('mint_metadata').upsert({
              mint,
              name: fetched.name,
              symbol: fetched.symbol,
              image: fetched.image,
              decimals: fetched.decimals,
              update_authority: fetched.updateAuthority ?? null,
              uri: fetched.uri ?? null,
              seller_fee_basis_points: fetched.sellerFeeBasisPoints ?? null,
              primary_sale_happened: fetched.primarySaleHappened ?? null,
              is_mutable: fetched.isMutable ?? null,
              edition_nonce: fetched.editionNonce ?? null,
              token_standard: fetched.tokenStandard ?? null,
              updated_at: now.toISOString(),
            }, { onConflict: 'mint' })
          }
        }
      }

      // 2. Fetch holders (for track_holders and/or track_snapshot)
      let holders: Array<{ wallet: string; amount: string }>
      if (kind === 'SPL') {
        holders = await fetchSplHolders(connection, mint)
      } else {
        holders = await fetchNftHolders(rpcEndpoint, mint)
      }
      if (holders.length === 0) {
        console.warn('[cron-tracker] empty holders', { mint, kind })
      }

      // 3a. Holders: holder_current (conditions, shipment, Discord)
      if (syncDiscord) {
        await db.from('holder_current').upsert({
          mint,
          holder_wallets: holders,
          last_updated: now.toISOString(),
        }, { onConflict: 'mint' })
        synced++
      }

      // 3b. Snapshot: holder_snapshots (time-bucketed) + tracker_holder_snapshots (tenant-scoped for SNAPSHOTS conditions)
      if (syncSnapshot) {
        const { data: existing } = await db
          .from('holder_snapshots')
          .select('mint')
          .eq('mint', mint)
          .eq('snapshot_at', snapshotAt)
          .maybeSingle()

        if (!existing) {
          await db.from('holder_snapshots').upsert({
            mint,
            snapshot_at: snapshotAt,
            holder_wallets: holders,
            snapshot_date: snapshotDate,
            created_at: now.toISOString(),
          }, { onConflict: 'mint,snapshot_at' })
          await db.from('tracker_holder_snapshots').upsert({
            tenant_id: tenantId,
            mint,
            holder_wallets: holders,
            snapshot_date: snapshotDate,
            snapshot_at: snapshotAt,
            created_at: now.toISOString(),
          }, { onConflict: 'tenant_id,mint,snapshot_at' })
          synced++
        }
      }

      processed++
    } catch (err) {
      console.error('[cron-tracker] mint failed', { mint, error: String(err) })
    }
  }

  // If chunk was full, there may be more — schedule or report for chaining.
  const hasMore = mints.length === CHUNK_SIZE
  console.log('[cron-tracker] batch done', { processed, synced, offset, hasMore })
  return jsonResponse({ processed, synced, offset, hasMore }, req)
})
