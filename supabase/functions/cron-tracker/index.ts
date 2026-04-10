/**
 * Tracker sync Edge Function — unified mode.
 *
 * pg_cron: tracker-unified (every 5 min) with body { mode: "unified" }.
 * Unified batch: due-first / snapshot-first over all billable watches (`billing_eligible_*` on
 * watchtower_watches, maintained by triggers). Capped by `watchtower_max_mints_per_tick` (Supabase IO).
 * A single RPC lists candidates + meta; each selected mint may update holder_current and holder_snapshots.
 *
 * Body: { mode?, syncMint?, tenantId? }
 *   mode "unified"  — batch (pg_cron, service role required).
 *   syncMint + tenantId — immediate single-mint sync (admin JWT; NFT tier delay bypassed).
 */

import { jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getWalletFromAuthHeader, isServiceRoleAuthorization, walletMatchesTenantAdmins } from '../_shared/auth.ts'
import {
  alignSnapshotBucket,
  currentTierOverdueMinutes,
  isHolderSyncDue,
  isNftHolderSyncDue,
  loadWatchtowerSyncConfig,
  type WatchtowerSyncConfig,
} from '../_shared/watchtower-sync-config.ts'
import { getRpcUrl } from '../_shared/rpc-url.ts'
import { fetchSplHoldersWithProgress, holderWalletsJsonToMap } from '../_shared/fetch-spl-holders.ts'
import {
  fetchNftHoldersWithProgress,
  nftHolderWalletsJsonToMap,
} from '../_shared/fetch-nft-holders.ts'
import { fetchMintMetadata } from '../_shared/mint-metadata.ts'
import { mergeMintMetadataUpsertFromFetchResult } from '../_shared/mint-metadata-merge.ts'
import { runSftCollectionHolderSyncTick } from '../_shared/fetch-sft-collection-holders.ts'

const METADATA_REFRESH_AGE_DAYS = 7

type CronCandidateRow = {
  mint: string
  kind: string
  nft_collection_sync_mode: string | null
  last_updated: string | null
  holder_count: number
  item_total: number
  has_snapshot_for_bucket: boolean
  spl_pagination_key: string | null
  nft_next_page: number | null
  sft_holder_sync_resume: boolean
  any_current_eligible: boolean
  any_snapshot_eligible: boolean
}

type ClassifiedWork = {
  row: CronCandidateRow
  kind: 'SPL' | 'NFT'
  tier: number
  overdueMin: number
}

function classifyCronWork(row: CronCandidateRow, config: WatchtowerSyncConfig, now: Date): ClassifiedWork | null {
  const kind = row.kind === 'SPL' ? 'SPL' : 'NFT'
  const isSftCollection = kind === 'NFT' && row.nft_collection_sync_mode === 'sft_per_mint'
  const resume = isSftCollection
    ? Boolean(row.sft_holder_sync_resume)
    : kind === 'SPL'
    ? Boolean(row.spl_pagination_key)
    : row.nft_next_page != null && Number.isFinite(Number(row.nft_next_page)) && Number(row.nft_next_page) >= 1
  const snapshotDue = row.any_snapshot_eligible && !row.has_snapshot_for_bucket
  const itemTotal = Number(row.item_total) || 0
  const holderCount = Number(row.holder_count) || 0
  const currentDue = row.any_current_eligible && (
    isSftCollection
      ? isHolderSyncDue(row.last_updated, holderCount, config.tiers, now)
      : kind === 'NFT'
      ? isNftHolderSyncDue(row.last_updated, itemTotal, config.nft_item_tiers, now)
      : isHolderSyncDue(row.last_updated, holderCount, config.tiers, now)
  )
  if (!resume && !snapshotDue && !currentDue) return null
  let tier = 2
  if (resume) tier = 0
  else if (snapshotDue) tier = 1
  const overdueMin = tier === 2
    ? currentTierOverdueMinutes(
      row.last_updated,
      holderCount,
      itemTotal,
      kind,
      config.tiers,
      config.nft_item_tiers,
      now,
      row.nft_collection_sync_mode,
    )
    : 0
  return { row, kind, tier, overdueMin }
}

// ---------------------------------------------------------------------------
// Metadata refresh (shared fetch: DAS + JSON uri image resolution; merge preserves prior image)
// ---------------------------------------------------------------------------

async function refreshMintMetadataIfStale(
  db: ReturnType<typeof getAdminClient>,
  mint: string,
  kind: 'SPL' | 'NFT',
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

  const hint = kind === 'SPL' ? 'SPL' : 'NFT'
  const fetched = await fetchMintMetadata(mint, hint)
  if (!fetched) return

  const { data: existing } = await db.from('mint_metadata').select('*').eq('mint', mint).maybeSingle()
  const row = mergeMintMetadataUpsertFromFetchResult(existing, mint, fetched, now.toISOString())
  await db.from('mint_metadata').upsert(row, { onConflict: 'mint' })
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
      .select('track_holders, track_snapshot, billing_eligible_current, billing_eligible_snapshot')
      .eq('tenant_id', syncTenantId)
      .eq('mint', syncMint)
      .maybeSingle()
    if (!watch || (!watch.track_holders && !watch.track_snapshot)) {
      return jsonResponse({ processed: 0, synced: 0, message: 'Mint not watched' }, req)
    }

    const syncCurrent = Boolean(watch.track_holders && watch.billing_eligible_current)
    const syncSnapshot = Boolean(watch.track_snapshot && watch.billing_eligible_snapshot)
    if (!syncCurrent && !syncSnapshot) {
      return jsonResponse({ processed: 0, synced: 0, message: 'Mint over paid limit' }, req)
    }

    const { data: catalog } = await db
      .from('tenant_mint_catalog')
      .select('kind, nft_collection_sync_mode')
      .eq('tenant_id', syncTenantId)
      .eq('mint', syncMint)
      .maybeSingle()
    const kind = (catalog?.kind as 'SPL' | 'NFT') ?? 'NFT'
    const nftCollectionSyncMode = (catalog?.nft_collection_sync_mode as string | null) ?? null

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
      await refreshMintMetadataIfStale(db, syncMint, kind, now)
    }

    let holders: Array<{ wallet: string; amount: string; mint?: string }>
    let splCompleted = true
    let nftCompleted = true
    let sftCompleted = true

    if (kind === 'SPL') {
      const { data: gpaRow } = await db
        .from('spl_holder_gpa_progress')
        .select('pagination_key')
        .eq('mint', syncMint)
        .maybeSingle()

      const resumeKey = gpaRow?.pagination_key ?? null

      let mergeMap = new Map<string, bigint>()
      if (resumeKey != null) {
        const { data: cur } = await db
          .from('holder_current')
          .select('holder_wallets')
          .eq('mint', syncMint)
          .maybeSingle()
        mergeMap = holderWalletsJsonToMap(cur?.holder_wallets)
      }

      const spl = await fetchSplHoldersWithProgress(rpcEndpoint, syncMint, {
        resumePaginationKey: resumeKey,
        mergeInto: mergeMap,
      })
      holders = spl.holders
      splCompleted = spl.completed

      if (!spl.completed && spl.nextPaginationKey != null) {
        await db.from('spl_holder_gpa_progress').upsert({
          mint: syncMint,
          pagination_key: spl.nextPaginationKey,
          updated_at: now.toISOString(),
        }, { onConflict: 'mint' })
      } else {
        await db.from('spl_holder_gpa_progress').delete().eq('mint', syncMint)
      }
    } else if (nftCollectionSyncMode === 'sft_per_mint') {
      sftCompleted = false
      while (true) {
        const r = await runSftCollectionHolderSyncTick(db, rpcEndpoint, syncMint, now.toISOString(), {
          maxGpaPagesPerTick: 10_000,
          maxChildrenPerTick: 10_000,
        })
        if (r.completed) {
          sftCompleted = true
          break
        }
      }
      const { data: hc } = await db
        .from('holder_current')
        .select('holder_wallets')
        .eq('mint', syncMint)
        .maybeSingle()
      const hw = hc?.holder_wallets
      holders = Array.isArray(hw)
        ? (hw as Array<{ wallet: string; amount: string; mint?: string }>)
        : []
    } else {
      const { data: nftRow } = await db
        .from('nft_holder_group_progress')
        .select('next_page')
        .eq('mint', syncMint)
        .maybeSingle()
      const resumePage = nftRow?.next_page != null ? Number(nftRow.next_page) : null
      const resumingNft = resumePage != null && Number.isFinite(resumePage) && resumePage >= 1

      let mergeCounts = new Map<string, number>()
      if (resumingNft) {
        const { data: cur } = await db
          .from('holder_current')
          .select('holder_wallets')
          .eq('mint', syncMint)
          .maybeSingle()
        mergeCounts = nftHolderWalletsJsonToMap(cur?.holder_wallets)
      }

      const nft = await fetchNftHoldersWithProgress(rpcEndpoint, syncMint, {
        startPage: resumingNft ? resumePage! : 1,
        mergeInto: mergeCounts,
      })
      holders = nft.holders
      nftCompleted = nft.completed

      if (!nft.completed && nft.nextPage != null) {
        await db.from('nft_holder_group_progress').upsert({
          mint: syncMint,
          next_page: nft.nextPage,
          updated_at: now.toISOString(),
        }, { onConflict: 'mint' })
      } else {
        await db.from('nft_holder_group_progress').delete().eq('mint', syncMint)
      }
    }

    if (kind === 'SPL') {
      await db.from('holder_current').upsert({
        mint: syncMint,
        holder_wallets: holders,
        last_updated: now.toISOString(),
      }, { onConflict: 'mint' })
    } else if (nftCollectionSyncMode !== 'sft_per_mint') {
      await db.from('holder_current').upsert({
        mint: syncMint,
        holder_wallets: holders,
        last_updated: now.toISOString(),
      }, { onConflict: 'mint' })
    }

    if (syncSnapshot) {
      if (kind === 'SPL' && !splCompleted) {
        return jsonResponse({
          processed: 1,
          synced: 0,
          splHoldersContinuing: true,
          message: 'SPL holder sync in progress; snapshot is written when the holder scan completes.',
        }, req)
      }
      if (kind === 'NFT' && nftCollectionSyncMode === 'sft_per_mint' && !sftCompleted) {
        return jsonResponse({
          processed: 1,
          synced: 0,
          sftHoldersContinuing: true,
          message: 'SFT collection holder sync in progress; snapshot is written when all child mints complete.',
        }, req)
      }
      if (kind === 'NFT' && nftCollectionSyncMode !== 'sft_per_mint' && !nftCompleted) {
        return jsonResponse({
          processed: 1,
          synced: 0,
          nftHoldersContinuing: true,
          message: 'NFT holder sync in progress; snapshot is written when the group scan completes.',
        }, req)
      }
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

    const done = kind === 'SPL'
      ? splCompleted
      : nftCollectionSyncMode === 'sft_per_mint'
      ? sftCompleted
      : nftCompleted
    return jsonResponse({
      processed: 1,
      synced: done ? 1 : 0,
      splHoldersContinuing: kind === 'SPL' && !splCompleted,
      nftHoldersContinuing: kind === 'NFT' && nftCollectionSyncMode !== 'sft_per_mint' && !nftCompleted,
      sftHoldersContinuing: kind === 'NFT' && nftCollectionSyncMode === 'sft_per_mint' && !sftCompleted,
    }, req)
  }

  // -------------------------------------------------------------------------
  // Batch unified mode — service role only (pg_cron)
  // -------------------------------------------------------------------------
  if (!isServiceRoleAuthorization(req)) {
    return errorResponse('Unauthorized', req, 401)
  }

  if (!mode) {
    mode = 'unified'
  }

  if (mode !== 'unified') {
    return errorResponse('Batch requests require mode "unified"', req, 400)
  }

  const config = await loadWatchtowerSyncConfig(db)
  const { snapshotAt, snapshotDate } = alignSnapshotBucket(now, config.snapshot_interval_minutes)

  const { data: rawCandidates, error: candErr } = await db.rpc('watchtower_cron_mint_candidates', {
    p_snapshot_at: snapshotAt,
  })
  if (candErr) return errorResponse(candErr.message, req, 500)

  const candidates = (rawCandidates ?? []) as CronCandidateRow[]
  const classified: ClassifiedWork[] = []
  for (const row of candidates) {
    const c = classifyCronWork(row, config, now)
    if (c) classified.push(c)
  }

  classified.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier
    if (a.tier === 2) return b.overdueMin - a.overdueMin
    return a.row.mint.localeCompare(b.row.mint)
  })

  const maxTick = Math.max(1, config.max_mints_per_tick)
  const workSet = classified.slice(0, maxTick)
  const candidateWorkCount = classified.length
  const capped = candidateWorkCount > maxTick

  if (workSet.length === 0) {
    return jsonResponse({
      processed: 0,
      synced: 0,
      mode,
      capped: false,
      candidateWorkCount: 0,
      selectedCount: 0,
      rpcCandidateRowCount: candidates.length,
    }, req)
  }

  const gpaByMint = new Map<string, string>()
  const nftNextPageByMint = new Map<string, number>()
  for (const item of workSet) {
    const m = item.row.mint
    const pk = item.row.spl_pagination_key
    if (item.kind === 'SPL' && pk) gpaByMint.set(m, pk)
    const np = item.row.nft_next_page
    if (item.kind === 'NFT' && np != null && Number.isFinite(Number(np)) && Number(np) >= 1) {
      nftNextPageByMint.set(m, Number(np))
    }
  }

  let processed = 0
  let synced = 0

  for (const item of workSet) {
    const mint = item.row.mint
    const kind = item.kind
    const anyCurrent = item.row.any_current_eligible
    const anySnapshot = item.row.any_snapshot_eligible

    const itemTotal = Number(item.row.item_total) || 0
    const holderCount = Number(item.row.holder_count) || 0
    const isSft = kind === 'NFT' && item.row.nft_collection_sync_mode === 'sft_per_mint'
    const currentDue = anyCurrent && (
      isSft
        ? isHolderSyncDue(
          item.row.last_updated,
          holderCount,
          config.tiers,
          now,
        )
        : kind === 'NFT'
        ? isNftHolderSyncDue(
          item.row.last_updated,
          itemTotal,
          config.nft_item_tiers,
          now,
        )
        : isHolderSyncDue(
          item.row.last_updated,
          holderCount,
          config.tiers,
          now,
        )
    )
    const snapshotDue = anySnapshot && !item.row.has_snapshot_for_bucket

    const splResumeKey = kind === 'SPL' ? gpaByMint.get(mint) ?? null : null
    const splIncomplete = kind === 'SPL' && splResumeKey != null
    const nftResumePage = kind === 'NFT' && !isSft ? nftNextPageByMint.get(mint) ?? null : null
    const nftIncomplete = kind === 'NFT' && !isSft && nftResumePage != null
    const sftIncomplete = isSft && item.row.sft_holder_sync_resume

    if (!currentDue && !snapshotDue && !splIncomplete && !nftIncomplete && !sftIncomplete) {
      processed++
      continue
    }

    try {
      if (snapshotDue) {
        await refreshMintMetadataIfStale(db, mint, kind, now)
      }

      let holders: Array<{ wallet: string; amount: string; mint?: string }> = []
      let splCompleted = true
      let nftCompleted = true
      let sftCompleted = true

      if (kind === 'SPL') {
        let mergeMap = new Map<string, bigint>()
        if (splIncomplete) {
          const { data: cur } = await db
            .from('holder_current')
            .select('holder_wallets')
            .eq('mint', mint)
            .maybeSingle()
          mergeMap = holderWalletsJsonToMap(cur?.holder_wallets)
        }
        const spl = await fetchSplHoldersWithProgress(rpcEndpoint, mint, {
          resumePaginationKey: splResumeKey,
          mergeInto: mergeMap,
        })
        holders = spl.holders
        splCompleted = spl.completed
        if (!spl.completed && spl.nextPaginationKey != null) {
          await db.from('spl_holder_gpa_progress').upsert({
            mint,
            pagination_key: spl.nextPaginationKey,
            updated_at: now.toISOString(),
          }, { onConflict: 'mint' })
          gpaByMint.set(mint, spl.nextPaginationKey)
        } else {
          await db.from('spl_holder_gpa_progress').delete().eq('mint', mint)
          gpaByMint.delete(mint)
        }
      } else if (isSft) {
        const sft = await runSftCollectionHolderSyncTick(db, rpcEndpoint, mint, now.toISOString(), {
          maxGpaPagesPerTick: config.sft_max_gpa_pages_per_tick,
          maxChildrenPerTick: config.sft_max_children_per_tick,
        })
        sftCompleted = sft.completed
        const { data: hc } = await db
          .from('holder_current')
          .select('holder_wallets')
          .eq('mint', mint)
          .maybeSingle()
        const hw = hc?.holder_wallets
        holders = Array.isArray(hw)
          ? (hw as Array<{ wallet: string; amount: string; mint?: string }>)
          : []
      } else {
        let mergeCounts = new Map<string, number>()
        if (nftIncomplete) {
          const { data: cur } = await db
            .from('holder_current')
            .select('holder_wallets')
            .eq('mint', mint)
            .maybeSingle()
          mergeCounts = nftHolderWalletsJsonToMap(cur?.holder_wallets)
        }
        const startPage = nftResumePage ?? 1
        const nft = await fetchNftHoldersWithProgress(rpcEndpoint, mint, {
          startPage,
          mergeInto: mergeCounts,
        })
        holders = nft.holders
        nftCompleted = nft.completed
        if (!nft.completed && nft.nextPage != null) {
          await db.from('nft_holder_group_progress').upsert({
            mint,
            next_page: nft.nextPage,
            updated_at: now.toISOString(),
          }, { onConflict: 'mint' })
          nftNextPageByMint.set(mint, nft.nextPage)
        } else {
          await db.from('nft_holder_group_progress').delete().eq('mint', mint)
          nftNextPageByMint.delete(mint)
        }
      }

      if (kind === 'SPL') {
        await db.from('holder_current').upsert({
          mint,
          holder_wallets: holders,
          last_updated: now.toISOString(),
        }, { onConflict: 'mint' })
      } else if (!isSft) {
        await db.from('holder_current').upsert({
          mint,
          holder_wallets: holders,
          last_updated: now.toISOString(),
        }, { onConflict: 'mint' })
      }

      const holdersReady = (kind === 'SPL' && splCompleted) ||
        (isSft && sftCompleted) ||
        (kind === 'NFT' && !isSft && nftCompleted)

      if (snapshotDue && holdersReady) {
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

  return jsonResponse({
    processed,
    synced,
    mode,
    capped,
    candidateWorkCount,
    selectedCount: workSet.length,
    rpcCandidateRowCount: candidates.length,
  }, req)
})
