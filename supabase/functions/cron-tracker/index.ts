/**
 * Tracker sync Edge Function.
 * pg_cron: tracker-holders (every 5 min) with body { mode: "holders" }; tracker-snapshots (every minute) { mode: "snapshot" } — bucket width from interval_timers (timer_key = watchtower_snapshot_bucket).
 * Missing JSON body (legacy tracker-sync): runs **holders batch only**; snapshots must use tracker-snapshots (avoids OOM from dual work in one Edge invocation).
 * Tier intervals and snapshot bucket size: interval_timers + platform_watchtower_holder_tier.
 * Body: { mode?, offset?, syncMint?, tenantId? } — syncMint + tenantId only = immediate sync for that mint (admin save).
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  const db = getAdminClient()
  const rpcEndpoint = getRpcUrl()
  const now = new Date()

  let offset = 0
  let syncMint: string | null = null
  let syncTenantId: string | null = null
  let mode: string | null = null
  try {
    const body = await req.json() as Record<string, unknown>
    offset = (body.offset as number) ?? 0
    syncMint = (body.syncMint as string)?.trim() || null
    syncTenantId = (body.tenantId as string)?.trim() || null
    mode = typeof body.mode === 'string' ? body.mode.trim() : null
  } catch { /* no body */ }

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

    if (syncSnapshot && !syncDiscord) {
      const { data: snapDup } = await db
        .from('holder_snapshots')
        .select('mint')
        .eq('mint', syncMint)
        .eq('snapshot_at', snapshotAt)
        .maybeSingle()
      if (snapDup) {
        return jsonResponse({ processed: 0, synced: 0, message: 'Snapshot already exists for bucket' }, req)
      }
    }

    if (syncSnapshot) {
      const { data: meta } = await db
        .from('mint_metadata')
        .select('updated_at')
        .eq('mint', syncMint)
        .maybeSingle()
      const metaAge = meta
        ? (now.getTime() - new Date(meta.updated_at as string).getTime()) / (1000 * 60 * 60 * 24)
        : Infinity
      if (metaAge > METADATA_REFRESH_AGE_DAYS) {
        const fetched = await fetchMintMetadata(rpcEndpoint, syncMint)
        if (fetched) {
          await db.from('mint_metadata').upsert({
            mint: syncMint,
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

    let holders: Array<{ wallet: string; amount: string }>
    if (kind === 'SPL') {
      holders = await fetchSplHolders(rpcEndpoint, syncMint)
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

  if (!isServiceRoleAuthorization(req)) {
    return errorResponse('Unauthorized', req, 401)
  }

  let legacyBare = false
  if (mode === null || mode === '') {
    legacyBare = true
    mode = 'holders'
  }
  if (mode !== 'holders' && mode !== 'snapshot') {
    return errorResponse('Batch requests require mode "holders" or "snapshot"', req, 400)
  }

  const config = await loadWatchtowerSyncConfig(db)

  if (mode === 'holders') {
    const { data: allWatches, error: watchErr } = await db
      .from('watchtower_watches')
      .select('tenant_id, mint, track_holders')
      .eq('track_holders', true)
      .order('tenant_id')
      .order('mint')
      .range(offset, offset + CHUNK_SIZE - 1)

    if (watchErr) return errorResponse(watchErr.message, req, 500)
    const mints = allWatches ?? []
    if (!mints.length) {
      if (!legacyBare) {
        return jsonResponse({ processed: 0, synced: 0, offset, hasMore: false, mode }, req)
      }
      return jsonResponse(
        { processed: 0, synced: 0, offset, hasMore: false, mode: 'holders', legacyBare: true },
        req,
      )
    }

    const tenantIds = [...new Set(mints.map((m) => String(m.tenant_id ?? '')))].filter(Boolean) as string[]
    const withinByTenant = new Map<string, Set<string>>()
    for (const tid of tenantIds) {
      const mints_current = await getWithinLimitMints(db, tid, 'mints_current')
      withinByTenant.set(tid, mints_current)
    }

    const mintKeys = mints.map((m) => String(m.mint ?? ''))
    const { data: syncMeta, error: syncMetaErr } = await db.rpc('holder_current_sync_meta', {
      p_mints: mintKeys,
    })
    if (syncMetaErr) {
      return errorResponse(syncMetaErr.message, req, 500)
    }
    const currentByMint = new Map<string, { holderCount: number; last_updated: string }>()
    for (const r of (syncMeta ?? []) as Array<{ mint: string; last_updated: string; holder_count: number }>) {
      currentByMint.set(r.mint, {
        holderCount: Number(r.holder_count) || 0,
        last_updated: r.last_updated,
      })
    }

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
      const within = withinByTenant.get(tenantId)
      if (!within?.has(mint)) continue

      const cur = currentByMint.get(mint)
      const holderCount = cur?.holderCount ?? 0
      const lastUp = cur?.last_updated ?? null
      if (!isHolderSyncDue(lastUp, holderCount, config.tiers, now)) continue

      const kind = kindByMint.get(mint) ?? 'NFT'
      try {
        let holders: Array<{ wallet: string; amount: string }>
        if (kind === 'SPL') {
          holders = await fetchSplHolders(rpcEndpoint, mint)
        } else {
          holders = await fetchNftHolders(rpcEndpoint, mint)
        }
        await db.from('holder_current').upsert({
          mint,
          holder_wallets: holders,
          last_updated: now.toISOString(),
        }, { onConflict: 'mint' })
        synced++
        processed++
      } catch {
        void 0
      }
    }

    const hasMore = mints.length === CHUNK_SIZE
    if (!legacyBare) {
      return jsonResponse({ processed, synced, offset, hasMore, mode }, req)
    }
    return jsonResponse(
      {
        processed,
        synced,
        offset,
        hasMore,
        mode: 'holders',
        legacyBare: true,
      },
      req,
    )
  }

  const { snapshotAt, snapshotDate } = alignSnapshotBucket(now, config.snapshot_interval_minutes)

  const { data: snapWatches, error: snapErr } = await db
    .from('watchtower_watches')
    .select('tenant_id, mint, track_snapshot')
    .eq('track_snapshot', true)
    .order('tenant_id')
    .order('mint')
    .range(offset, offset + CHUNK_SIZE - 1)

  if (snapErr) return errorResponse(snapErr.message, req, 500)
  const mints = snapWatches ?? []
  if (!mints.length) {
    return jsonResponse(
      { processed: 0, synced: 0, offset, hasMore: false, mode: legacyBare ? 'legacy-sync' : mode },
      req,
    )
  }

  const tenantIds = [...new Set(mints.map((m) => String(m.tenant_id ?? '')))].filter(Boolean) as string[]
  const withinSnap = new Map<string, Set<string>>()
  for (const tid of tenantIds) {
    const set = await getWithinLimitMints(db, tid, 'mintsSnapshot')
    withinSnap.set(tid, set)
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
    if (!withinSnap.get(tenantId)?.has(mint)) continue

    const kind = kindByMint.get(mint) ?? 'NFT'
    try {
      const { data: existingSnap } = await db
        .from('holder_snapshots')
        .select('mint')
        .eq('mint', mint)
        .eq('snapshot_at', snapshotAt)
        .maybeSingle()

      if (existingSnap) {
        processed++
        continue
      }

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

      let holders: Array<{ wallet: string; amount: string }>
      if (kind === 'SPL') {
        holders = await fetchSplHolders(rpcEndpoint, mint)
      } else {
        holders = await fetchNftHolders(rpcEndpoint, mint)
      }
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
      processed++
    } catch {
      void 0
    }
  }

  const hasMore = mints.length === CHUNK_SIZE
  const outMode = legacyBare ? 'legacy-sync' : mode
  return jsonResponse({ processed, synced, offset, hasMore, mode: outMode }, req)
})
