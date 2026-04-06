import type { getAdminClient } from './supabase-admin.ts'
import {
  dasItemToCollectionMember,
  fetchCollectionGroupPage,
  mergeAttributesIntoPartialTraitState,
  parsePartialTraitState,
  partialTraitStateToTraitIndex,
} from './index-collection-members.ts'
import { fetchMintMetadata } from './mint-metadata.ts'
import { mergeMintMetadataUpsertFromFetchResult } from './mint-metadata-merge.ts'
import { loadPlatformMetadataScope } from './platform-metadata-mint-list.ts'

type Db = ReturnType<typeof getAdminClient>

type ProgressRow = {
  collection_mint: string
  next_page: number
  partial_trait_index: unknown
  last_error: string | null
  updated_at: string
}

const DEFAULT_MAX_COLLECTIONS = 4
const DEFAULT_MAX_PAGES = 2

export async function loadMintIndexCaps(db: Db): Promise<{ maxCollections: number; maxPages: number }> {
  const { data } = await db
    .from('interval_timers')
    .select('timer_key, interval_minutes')
    .in('timer_key', ['mint_index_max_collections_per_tick', 'mint_index_max_pages_per_tick'])

  let maxCollections = DEFAULT_MAX_COLLECTIONS
  let maxPages = DEFAULT_MAX_PAGES
  for (const row of data ?? []) {
    const k = row.timer_key as string
    const v = Math.max(1, Number(row.interval_minutes) || 1)
    if (k === 'mint_index_max_collections_per_tick') maxCollections = v
    if (k === 'mint_index_max_pages_per_tick') maxPages = v
  }
  return { maxCollections, maxPages }
}

export async function enqueueCollectionIndexing(db: Db, collectionMint: string, nowIso: string): Promise<void> {
  await db.from('collection_members_index_progress').upsert(
    {
      collection_mint: collectionMint,
      next_page: 1,
      partial_trait_index: { trait_keys: [], trait_options: {} },
      last_error: null,
      updated_at: nowIso,
    },
    { onConflict: 'collection_mint' },
  )
}

export type TickResult = {
  collectionsProcessed: number
  pagesProcessed: number
  completedCollections: string[]
}

function partialToJson(p: { trait_keys: string[]; trait_options: Record<string, string[]> }) {
  return { trait_keys: p.trait_keys, trait_options: p.trait_options }
}

export async function runCollectionIndexTick(
  db: Db,
  rpcUrl: string,
  nowIso: string,
): Promise<TickResult> {
  const { maxCollections, maxPages } = await loadMintIndexCaps(db)

  const { data: rows, error } = await db
    .from('collection_members_index_progress')
    .select('collection_mint, next_page, partial_trait_index, last_error, updated_at')
    .order('updated_at', { ascending: true })
    .limit(maxCollections)

  if (error || !rows?.length) {
    return { collectionsProcessed: 0, pagesProcessed: 0, completedCollections: [] }
  }

  let pagesProcessed = 0
  const completedCollections: string[] = []

  for (const raw of rows as ProgressRow[]) {
    const collectionMint = raw.collection_mint
    let page = Number(raw.next_page) || 1
    let partial = parsePartialTraitState(raw.partial_trait_index)

    let pagesThisCollection = 0
    while (pagesThisCollection < maxPages) {
      const { ok, items } = await fetchCollectionGroupPage(rpcUrl, collectionMint, page)
      if (!ok) {
        await db
          .from('collection_members_index_progress')
          .update({ last_error: 'getAssetsByGroup request failed', updated_at: nowIso })
          .eq('collection_mint', collectionMint)
        break
      }

      pagesProcessed++
      pagesThisCollection++

      const members = items.map((it) => dasItemToCollectionMember(collectionMint, it))
      const attrsList = members.map((m) => m.traits as Array<{ trait_type?: string; value?: string }> | undefined)
      mergeAttributesIntoPartialTraitState(partial, attrsList)

      if (members.length > 0) {
        await db.from('collection_members').upsert(
          members.map((m) => ({
            collection_mint: m.collection_mint,
            mint: m.mint,
            name: m.name,
            image: m.image,
            traits: m.traits,
            owner: m.owner,
            updated_at: nowIso,
          })),
          { onConflict: 'collection_mint,mint' },
        )

        const metaUpserts = members.map((m) => ({
          mint: m.mint,
          name: m.name,
          symbol: null as string | null,
          image: m.image,
          decimals: null as number | null,
          traits: m.traits,
          trait_index: null as unknown,
          token_standard: 'NonFungible' as string | null,
          updated_at: nowIso,
        }))
        await db.from('mint_metadata').upsert(metaUpserts, { onConflict: 'mint' })
      }

      const isLastPage = items.length < 1000
      if (isLastPage) {
        const traitIndex = partialTraitStateToTraitIndex(partial)
        const { data: ex } = await db.from('mint_metadata').select('*').eq('mint', collectionMint).maybeSingle()
        const fresh = await fetchMintMetadata(collectionMint, 'NFT')
        if (fresh) {
          const merged = mergeMintMetadataUpsertFromFetchResult(
            ex as Record<string, unknown> | null,
            collectionMint,
            { ...fresh, traitIndex },
            nowIso,
          )
          await db.from('mint_metadata').upsert(merged, { onConflict: 'mint' })
        } else {
          await db
            .from('mint_metadata')
            .update({ trait_index: traitIndex, updated_at: nowIso })
            .eq('mint', collectionMint)
        }

        await db.from('collection_members_index_progress').delete().eq('collection_mint', collectionMint)
        completedCollections.push(collectionMint)
        break
      }

      page += 1
      await db
        .from('collection_members_index_progress')
        .update({
          next_page: page,
          partial_trait_index: partialToJson(partial),
          last_error: null,
          updated_at: nowIso,
        })
        .eq('collection_mint', collectionMint)
    }
  }

  return {
    collectionsProcessed: rows.length,
    pagesProcessed,
    completedCollections,
  }
}

export type OpsRefreshChunkResult = {
  refreshed: number
  total: number
  trackedTotal: number
  offset: number
  nextOffset: number | null
  enqueuedCollections: number
}

export async function runOpsMetadataRefreshChunk(
  db: Db,
  rpcUrl: string,
  offset: number,
  limit: number,
  nowIso: string,
): Promise<OpsRefreshChunkResult> {
  const { mints, kindByMint } = await loadPlatformMetadataScope(db)
  if (mints.length === 0) {
    return { refreshed: 0, total: 0, trackedTotal: 0, offset, nextOffset: null, enqueuedCollections: 0 }
  }
  if (offset >= mints.length) {
    return { refreshed: 0, total: 0, trackedTotal: mints.length, offset, nextOffset: null, enqueuedCollections: 0 }
  }

  const slice = mints.slice(offset, offset + limit)
  const { data: existingRows } = await db.from('mint_metadata').select('*').in('mint', slice)
  const existingByMint = new Map((existingRows ?? []).map((r) => [r.mint as string, r as Record<string, unknown>]))

  let refreshed = 0
  let enqueuedCollections = 0

  for (const mint of slice) {
    const kind = kindByMint.get(mint) ?? 'SPL'
    const hint = kind === 'NFT' ? 'NFT' : 'SPL'
    const meta = await fetchMintMetadata(mint, hint)
    if (meta) {
      const row = mergeMintMetadataUpsertFromFetchResult(existingByMint.get(mint), mint, meta, nowIso)
      await db.from('mint_metadata').upsert(row, { onConflict: 'mint' })
      refreshed++
      if (meta.kind === 'NFT' && (meta.collectionSize ?? 0) > 0) {
        await enqueueCollectionIndexing(db, mint, nowIso)
        enqueuedCollections++
      }
    }
  }

  const nextOff = offset + slice.length
  const hasMore = nextOff < mints.length
  return {
    refreshed,
    total: slice.length,
    trackedTotal: mints.length,
    offset,
    nextOffset: hasMore ? nextOff : null,
    enqueuedCollections,
  }
}
