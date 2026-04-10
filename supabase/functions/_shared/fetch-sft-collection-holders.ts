/**
 * SFT (Metaplex FungibleAsset) NFT collections: enumerate child mints via getAssetsByGroup,
 * run SPL GPA per child (legacy Token program), aggregate rows on the collection parent mint.
 *
 * Uses temporary holder_current rows on each child mint during multi-page GPA (same resume model
 * as fetch-spl-holders), then deletes child rows after merging into the parent.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { fetchSplHoldersWithProgress, holderWalletsJsonToMap } from './fetch-spl-holders.ts'
import { solanaJsonRpc } from './solana-json-rpc.ts'

export type SftHolderRow = { wallet: string; amount: string; mint: string }

const GROUP_PAGE = 1000

export async function fetchAllCollectionChildMintIds(rpcUrl: string, collectionMint: string): Promise<string[]> {
  const ids: string[] = []
  let page = 1
  for (;;) {
    const data = await solanaJsonRpc<{ items?: Array<{ id?: string }> }>(rpcUrl, 'getAssetsByGroup', {
      groupKey: 'collection',
      groupValue: collectionMint,
      limit: GROUP_PAGE,
      page,
    })
    const items = data.items ?? []
    for (const it of items) {
      if (it.id && typeof it.id === 'string') ids.push(it.id)
    }
    if (items.length < GROUP_PAGE) break
    page++
  }
  return ids
}

function rowsToJson(rows: SftHolderRow[]): unknown[] {
  return rows.map((r) => ({ wallet: r.wallet, amount: r.amount, mint: r.mint }))
}

/**
 * One incremental step for SFT collection holder sync. Call until `completed` is true.
 */
export async function runSftCollectionHolderSyncTick(
  db: SupabaseClient,
  rpcUrl: string,
  collectionMint: string,
  nowIso: string,
  chunk: { maxGpaPagesPerTick: number; maxChildrenPerTick: number },
): Promise<{ completed: boolean }> {
  const { data: progress } = await db
    .from('sft_collection_holder_sync_progress')
    .select('child_mints, current_child_index')
    .eq('collection_mint', collectionMint)
    .maybeSingle()

  let childMints: string[] = []
  let startIndex = 0

  if (!progress) {
    childMints = await fetchAllCollectionChildMintIds(rpcUrl, collectionMint)
    await db.from('holder_current').upsert({
      mint: collectionMint,
      holder_wallets: [],
      last_updated: nowIso,
    }, { onConflict: 'mint' })

    if (childMints.length === 0) {
      return { completed: true }
    }

    await db.from('spl_holder_gpa_progress').delete().in('mint', childMints)
    await db.from('holder_current').delete().in('mint', childMints)

    await db.from('sft_collection_holder_sync_progress').upsert({
      collection_mint: collectionMint,
      child_mints: childMints,
      current_child_index: 0,
      updated_at: nowIso,
    }, { onConflict: 'collection_mint' })

    startIndex = 0
  } else {
    const raw = progress.child_mints as unknown
    if (Array.isArray(raw)) {
      childMints = raw.filter((x): x is string => typeof x === 'string')
    }
    startIndex = typeof progress.current_child_index === 'number' ? progress.current_child_index : 0
  }

  if (childMints.length === 0) {
    await db.from('sft_collection_holder_sync_progress').delete().eq('collection_mint', collectionMint)
    return { completed: true }
  }

  let idx = startIndex
  let childrenProcessed = 0

  while (idx < childMints.length && childrenProcessed < chunk.maxChildrenPerTick) {
    const childMint = childMints[idx]

    const { data: gpaRow } = await db
      .from('spl_holder_gpa_progress')
      .select('pagination_key')
      .eq('mint', childMint)
      .maybeSingle()
    const resumeKey = gpaRow?.pagination_key ?? null

    let mergeMap = new Map<string, bigint>()
    if (resumeKey != null) {
      const { data: curChild } = await db
        .from('holder_current')
        .select('holder_wallets')
        .eq('mint', childMint)
        .maybeSingle()
      mergeMap = holderWalletsJsonToMap(curChild?.holder_wallets)
    }

    const spl = await fetchSplHoldersWithProgress(rpcUrl, childMint, {
      resumePaginationKey: resumeKey,
      mergeInto: mergeMap,
      maxPages: chunk.maxGpaPagesPerTick,
    })

    if (!spl.completed && spl.nextPaginationKey != null) {
      await db.from('holder_current').upsert({
        mint: childMint,
        holder_wallets: spl.holders,
        last_updated: nowIso,
      }, { onConflict: 'mint' })
      await db.from('spl_holder_gpa_progress').upsert({
        mint: childMint,
        pagination_key: spl.nextPaginationKey,
        updated_at: nowIso,
      }, { onConflict: 'mint' })
      await db.from('sft_collection_holder_sync_progress').upsert({
        collection_mint: collectionMint,
        child_mints: childMints,
        current_child_index: idx,
        updated_at: nowIso,
      }, { onConflict: 'collection_mint' })
      return { completed: false }
    }

    await db.from('spl_holder_gpa_progress').delete().eq('mint', childMint)

    const tagged: SftHolderRow[] = spl.holders.map((h) => ({
      wallet: h.wallet,
      amount: h.amount,
      mint: childMint,
    }))

    const { data: parentRow } = await db
      .from('holder_current')
      .select('holder_wallets')
      .eq('mint', collectionMint)
      .maybeSingle()
    const prev = (parentRow?.holder_wallets as unknown[]) ?? []
    const kept: SftHolderRow[] = []
    for (const row of prev) {
      if (!row || typeof row !== 'object') continue
      const o = row as { wallet?: string; amount?: string; mint?: string }
      if (String(o.mint ?? '') !== childMint && o.wallet) {
        kept.push({
          wallet: String(o.wallet),
          amount: String(o.amount ?? '0'),
          mint: String(o.mint ?? ''),
        })
      }
    }
    const mergedParent = [...kept, ...tagged]
    await db.from('holder_current').upsert({
      mint: collectionMint,
      holder_wallets: rowsToJson(mergedParent),
      last_updated: nowIso,
    }, { onConflict: 'mint' })

    await db.from('holder_current').delete().eq('mint', childMint)

    idx += 1
    childrenProcessed += 1

    await db.from('sft_collection_holder_sync_progress').upsert({
      collection_mint: collectionMint,
      child_mints: childMints,
      current_child_index: idx,
      updated_at: nowIso,
    }, { onConflict: 'collection_mint' })
  }

  if (idx >= childMints.length) {
    await db.from('sft_collection_holder_sync_progress').delete().eq('collection_mint', collectionMint)
    return { completed: true }
  }

  return { completed: false }
}
