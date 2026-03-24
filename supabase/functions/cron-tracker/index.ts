/**
 * Tracker sync Edge Function — unified mode.
 *
 * pg_cron: tracker-unified (every 5 min) with body { mode: "unified" }.
 * Each tick advances a DB-backed rolodex cursor over the deduplicated set of
 * watched mints (all tenants, track_holders OR track_snapshot).
 * A single RPC fetch per mint feeds two adopters:
 *   • holder_current  — written when the holder-count tier says a refresh is due.
 *   • holder_snapshots — written once per snapshot bucket (cycle_minutes × N)
 *                        when at least one in-limit tenant has track_snapshot.
 * Snapshot data is global (no per-tenant mirror). Billing / access is gated by
 * watchtower_watches + tenant_meter_limits; no duplicate JSON is stored.
 *
 * Body: { mode?, syncMint?, tenantId? }
 *   mode "unified"  — batch rolodex advance (pg_cron, service role required).
 *   syncMint + tenantId — immediate single-mint sync (admin JWT, ignores mode).
 */

import { jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getWalletFromAuthHeader, isServiceRoleAuthorization, walletMatchesTenantAdmins } from '../_shared/auth.ts'
import { getWithinLimitMints } from '../_shared/watchtower-billing.ts'
import {
  alignSnapshotBucket,
  isHolderSyncDue,
  loadWatchtowerSyncConfig,
} from '../_shared/watchtower-sync-config.ts'
import { getRpcUrl } from '../_shared/rpc-url.ts'
import { fetchSplHolders } from '../_shared/fetch-spl-holders.ts'

const METADATA_REFRESH_AGE_DAYS = 7
const CHUNK_SIZE = 8

// ---------------------------------------------------------------------------
// RPC helpers
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

async function refreshMintMetadataIfStale(
  db: ReturnType<typeof getAdminClient>,
  rpcEndpoint: string,
  mint: string,
  now: Date,
): Promise<void> {
  const { data: meta } = await db
    .from('mint_metadata')
    .select('updated_at')
    .eq('mint', mint)
    .maybeSingle()

  const metaAge = meta
    ? (now.getTime() - new Date(meta.updated_at as string).getTime()) / (1000 * 60 * 60 * 24)
    : Infinity

  if (metaAge <= METADATA_REFRESH_AGE_DAYS) return

  const fetched = await fetchMintMetadata(rpcEndpoint, mint)
  if (!fetched) return

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

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  const db = getAdminClient()
  const rpcEndpoint = getRpcUrl()
  const now = new Date()

  let syncMint: string | null = null
  let syncTenantId: string | null = null
  let mode: string | null = null
  try {
    const body = await req.json() as Record<string, unknown>
    syncMint = (body.syncMint as string)?.trim() || null
    syncTenantId = (body.tenantId as string)?.trim() || null
    mode = typeof body.mode === 'string' ? body.mode.trim() : null
  } catch { /* no body */ }

  // -------------------------------------------------------------------------
  // Immediate single-mint sync — admin JWT path (triggered from admin save)
  // -------------------------------------------------------------------------
  if (syncMint && syncTenantId) {
    const authHeader = req.headers.get('Authorization')
    const wallet = await getWalletFromAuthHeader(authHeader)
    if (!wallet) {
      return errorResponse('Authentication required for single-mint sync', req, 401)
    }
    const { data: tenant } = await db
      .from('tenant_config')
      .select('admins')
      .eq('id', syncTenantId)
      .maybeSingle()
    const admins = (tenant?.admins as string[]) ?? []
    if (!walletMatchesTenantAdmins(wallet, admins)) {
      return errorResponse('Forbidden: not a tenant admin', req, 403)
    }

    const config = await loadWatchtowerSyncConfig(db)
    const { snapshotAt, snapshotDate } = alignSnapshotBucket(now, config.snapshot_interval_minutes)

    const { data: watch } = await db
      .from('watchtower_watches')
      .select('track_holders, track_snapshot')
      .eq('tenant_id', syncTenantId)
      .eq('mint', syncMint)
      .maybeSingle()
    if (!watch || (!watch.track_holders && !watch.track_snapshot)) {
      return jsonResponse({ processed: 0, synced: 0, message: 'Mint not watched' }, req)
    }

    const [currentWithin, snapshotWithin] = await Promise.all([
      watch.track_holders ? getWithinLimitMints(db, syncTenantId, 'mints_current') : Promise.resolve(new Set<string>()),
      watch.track_snapshot ? getWithinLimitMints(db, syncTenantId, 'mintsSnapshot') : Promise.resolve(new Set<string>()),
    ])
    const syncCurrent = watch.track_holders && currentWithin.has(syncMint)
    const syncSnapshot = watch.track_snapshot && snapshotWithin.has(syncMint)
    if (!syncCurrent && !syncSnapshot) {
      return jsonResponse({ processed: 0, synced: 0, message: 'Mint over paid limit' }, req)
    }

    const { data: catalog } = await db
      .from('tenant_mint_catalog')
      .select('kind')
      .eq('tenant_id', syncTenantId)
      .eq('mint', syncMint)
      .maybeSingle()
    const kind = (catalog?.kind as 'SPL' | 'NFT') ?? 'NFT'

    if (syncSnapshot) {
      const { data: snapDup } = await db
        .from('holder_snapshots')
        .select('mint')
        .eq('mint', syncMint)
        .eq('snapshot_at', snapshotAt)
        .maybeSingle()
      if (snapDup && !syncCurrent) {
        return jsonResponse({ processed: 0, synced: 0, message: 'Snapshot already exists for bucket' }, req)
      }
      await refreshMintMetadataIfStale(db, rpcEndpoint, syncMint, now)
    }

    let holders: Array<{ wallet: string; amount: string }>
    if (kind === 'SPL') {
      holders = await fetchSplHolders(rpcEndpoint, syncMint)
    } else {
      holders = await fetchNftHolders(rpcEndpoint, syncMint)
    }

    if (syncCurrent) {
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
      }
    }

    return jsonResponse({ processed: 1, synced: 1 }, req)
  }

  // -------------------------------------------------------------------------
  // Batch unified mode — service role only (pg_cron)
  // -------------------------------------------------------------------------
  if (!isServiceRoleAuthorization(req)) {
    return errorResponse('Unauthorized', req, 401)
  }

  if (mode !== 'unified') {
    return errorResponse('Batch requests require mode "unified"', req, 400)
  }

  const config = await loadWatchtowerSyncConfig(db)
  const { snapshotAt, snapshotDate } = alignSnapshotBucket(now, config.snapshot_interval_minutes)

  // Load cursor (last processed mint from previous tick)
  const { data: stateRow } = await db
    .from('cron_tracker_state')
    .select('last_mint')
    .eq('id', 1)
    .maybeSingle()
  const cursor = (stateRow as { last_mint: string | null } | null)?.last_mint ?? null

  // Advance cursor: load next CHUNK_SIZE distinct mints after the cursor
  const { data: mintRows, error: mintErr } = await db.rpc('cron_tracker_next_mints', {
    p_after_mint: cursor,
    p_limit: CHUNK_SIZE,
  })
  if (mintErr) return errorResponse(mintErr.message, req, 500)

  const mints = (mintRows ?? []) as Array<{
    mint: string
    needs_current: boolean
    needs_snapshot: boolean
    kind: string
  }>

  // Empty slice: we hit the end of the list — wrap cursor back to NULL so next tick starts over
  if (!mints.length) {
    if (cursor !== null) {
      await db.from('cron_tracker_state')
        .update({ last_mint: null, updated_at: now.toISOString() })
        .eq('id', 1)
    }
    return jsonResponse({ processed: 0, synced: 0, cursor: null, wrapped: true, mode }, req)
  }

  const mintKeys = mints.map((m) => m.mint)

  // Collect all tenants watching these mints to check billing limits in bulk
  const { data: allWatches } = await db
    .from('watchtower_watches')
    .select('tenant_id, mint, track_holders, track_snapshot')
    .in('mint', mintKeys)

  const tenantIds = [...new Set((allWatches ?? []).map((w) => String(w.tenant_id ?? '')))]
    .filter(Boolean)

  // Billing limits — one getWithinLimitMints call per tenant (current + snapshot)
  const withinCurrentByTenant = new Map<string, Set<string>>()
  const withinSnapshotByTenant = new Map<string, Set<string>>()
  await Promise.all(tenantIds.map(async (tid) => {
    const [cur, snap] = await Promise.all([
      getWithinLimitMints(db, tid, 'mints_current'),
      getWithinLimitMints(db, tid, 'mintsSnapshot'),
    ])
    withinCurrentByTenant.set(tid, cur)
    withinSnapshotByTenant.set(tid, snap)
  }))

  // Index watches by mint
  const watchesByMint = new Map<string, Array<{ tenant_id: string; track_holders: boolean; track_snapshot: boolean }>>()
  for (const w of allWatches ?? []) {
    const m = w.mint as string
    const list = watchesByMint.get(m) ?? []
    list.push({
      tenant_id: String(w.tenant_id ?? ''),
      track_holders: Boolean(w.track_holders),
      track_snapshot: Boolean(w.track_snapshot),
    })
    watchesByMint.set(m, list)
  }

  // Holder-current freshness meta (avoids loading full JSONB)
  const { data: syncMeta, error: syncMetaErr } = await db.rpc('holder_current_sync_meta', { p_mints: mintKeys })
  if (syncMetaErr) return errorResponse(syncMetaErr.message, req, 500)

  const currentByMint = new Map<string, { holderCount: number; last_updated: string }>()
  for (const r of (syncMeta ?? []) as Array<{ mint: string; last_updated: string; holder_count: number }>) {
    currentByMint.set(r.mint, { holderCount: Number(r.holder_count) || 0, last_updated: r.last_updated })
  }

  // Which snapshot buckets already exist (avoid re-fetching)
  const { data: existingSnaps } = await db
    .from('holder_snapshots')
    .select('mint')
    .in('mint', mintKeys)
    .eq('snapshot_at', snapshotAt)
  const existingSnapMints = new Set((existingSnaps ?? []).map((s) => s.mint as string))

  let processed = 0
  let synced = 0

  for (const mintRow of mints) {
    const mint = mintRow.mint
    const kind = (mintRow.kind as 'SPL' | 'NFT') ?? 'NFT'
    const watches = watchesByMint.get(mint) ?? []

    // Does any in-limit tenant need current?
    const anyCurrent = watches.some(
      (w) => w.track_holders && withinCurrentByTenant.get(w.tenant_id)?.has(mint),
    )
    // Does any in-limit tenant need snapshot?
    const anySnapshot = watches.some(
      (w) => w.track_snapshot && withinSnapshotByTenant.get(w.tenant_id)?.has(mint),
    )

    const meta = currentByMint.get(mint)
    const currentDue = anyCurrent && isHolderSyncDue(
      meta?.last_updated ?? null,
      meta?.holderCount ?? 0,
      config.tiers,
      now,
    )
    const snapshotDue = anySnapshot && !existingSnapMints.has(mint)

    if (!currentDue && !snapshotDue) {
      processed++
      continue
    }

    try {
      if (snapshotDue) {
        await refreshMintMetadataIfStale(db, rpcEndpoint, mint, now)
      }

      // Single RPC fetch — shared by both adopters
      let holders: Array<{ wallet: string; amount: string }>
      if (kind === 'SPL') {
        holders = await fetchSplHolders(rpcEndpoint, mint)
      } else {
        holders = await fetchNftHolders(rpcEndpoint, mint)
      }

      // Adopter A: global current holders
      if (currentDue) {
        await db.from('holder_current').upsert({
          mint,
          holder_wallets: holders,
          last_updated: now.toISOString(),
        }, { onConflict: 'mint' })
      }

      // Adopter B: global snapshot bucket
      if (snapshotDue) {
        await db.from('holder_snapshots').upsert({
          mint,
          snapshot_at: snapshotAt,
          holder_wallets: holders,
          snapshot_date: snapshotDate,
          created_at: now.toISOString(),
        }, { onConflict: 'mint,snapshot_at' })
      }

      synced++
      processed++
    } catch {
      void 0
    }
  }

  // Advance cursor: if slice was smaller than CHUNK_SIZE we hit the end → wrap
  const wrapped = mints.length < CHUNK_SIZE
  const nextCursor = wrapped ? null : (mints[mints.length - 1]?.mint ?? null)

  await db.from('cron_tracker_state')
    .update({ last_mint: nextCursor, updated_at: now.toISOString() })
    .eq('id', 1)

  return jsonResponse({ processed, synced, cursor: nextCursor, wrapped, mode }, req)
})
