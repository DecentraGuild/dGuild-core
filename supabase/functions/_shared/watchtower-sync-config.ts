import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { nftHolderWalletsJsonToMap } from './fetch-nft-holders.ts'

export type HolderTierRow = {
  sort_order: number
  max_holders: number | null
  interval_minutes: number
}

export type NftItemTierRow = {
  sort_order: number
  max_items: number | null
  interval_minutes: number
}

const DEFAULT_CYCLE_MINUTES = 5
const DEFAULT_SNAPSHOT_EVERY_N_CYCLES = 12  // 5 × 12 = 60 min default snapshot bucket

export const TIMER_KEY_CYCLE = 'watchtower_cycle_minutes'
export const TIMER_KEY_SNAPSHOT_N = 'watchtower_snapshot_every_n_cycles'
export const TIMER_KEY_MAX_MINTS_PER_TICK = 'watchtower_max_mints_per_tick'
export const TIMER_KEY_SFT_MAX_GPA_PAGES = 'watchtower_sft_max_gpa_pages_per_tick'
export const TIMER_KEY_SFT_MAX_CHILDREN = 'watchtower_sft_max_children_per_tick'

const DEFAULT_MAX_MINTS_PER_TICK = 10
const DEFAULT_SFT_MAX_GPA_PAGES = 8
const DEFAULT_SFT_MAX_CHILDREN = 1

const DEFAULT_TIERS: HolderTierRow[] = [
  { sort_order: 1, max_holders: 500, interval_minutes: 5 },
  { sort_order: 2, max_holders: 5000, interval_minutes: 15 },
  { sort_order: 3, max_holders: null, interval_minutes: 60 },
]

const DEFAULT_NFT_ITEM_TIERS: NftItemTierRow[] = [
  { sort_order: 1, max_items: 100, interval_minutes: 5 },
  { sort_order: 2, max_items: 1000, interval_minutes: 15 },
  { sort_order: 3, max_items: 5000, interval_minutes: 30 },
  { sort_order: 4, max_items: null, interval_minutes: 60 },
]

export type WatchtowerSyncConfig = {
  /** Cron tick / rolodex chunk cadence in minutes. */
  cycle_minutes: number
  /** Take a new snapshot every N cycles (snapshot bucket = cycle_minutes × N). */
  snapshot_every_n_cycles: number
  /** Derived: cycle_minutes × snapshot_every_n_cycles — width of one snapshot bucket. */
  snapshot_interval_minutes: number
  tiers: HolderTierRow[]
  /** Refresh cadence for NFT mints by last-known total item count (sum of amounts). */
  nft_item_tiers: NftItemTierRow[]
  /** Max mints to run a full holder sync for per unified cron tick (protects Supabase IO). */
  max_mints_per_tick: number
  /** GPA pages per cron tick for each SFT collection child mint. */
  sft_max_gpa_pages_per_tick: number
  /** Child mints fully completed per tick (within each child, GPA may span ticks). */
  sft_max_children_per_tick: number
}

export async function loadWatchtowerSyncConfig(
  db: SupabaseClient,
): Promise<WatchtowerSyncConfig> {
  const [
    { data: cycleRow },
    { data: nRow },
    { data: maxMintsRow },
    { data: sftGpaRow },
    { data: sftChildRow },
    { data: tierRows, error: tierErr },
    { data: nftTierRows, error: nftTierErr },
  ] = await Promise.all([
    db.from('interval_timers').select('interval_minutes').eq('timer_key', TIMER_KEY_CYCLE).maybeSingle(),
    db.from('interval_timers').select('interval_minutes').eq('timer_key', TIMER_KEY_SNAPSHOT_N).maybeSingle(),
    db.from('interval_timers').select('interval_minutes').eq('timer_key', TIMER_KEY_MAX_MINTS_PER_TICK).maybeSingle(),
    db.from('interval_timers').select('interval_minutes').eq('timer_key', TIMER_KEY_SFT_MAX_GPA_PAGES).maybeSingle(),
    db.from('interval_timers').select('interval_minutes').eq('timer_key', TIMER_KEY_SFT_MAX_CHILDREN).maybeSingle(),
    db.from('platform_watchtower_holder_tier').select('sort_order, max_holders, interval_minutes').order('sort_order'),
    db.from('platform_watchtower_nft_item_tier').select('sort_order, max_items, interval_minutes').order('sort_order'),
  ])

  if (tierErr) {
    console.warn('[watchtower-sync-config] tier load failed', tierErr.message)
  }
  if (nftTierErr) {
    console.warn('[watchtower-sync-config] NFT item tier load failed', nftTierErr.message)
  }

  const cycle_minutes =
    typeof cycleRow?.interval_minutes === 'number' && cycleRow.interval_minutes > 0
      ? cycleRow.interval_minutes
      : DEFAULT_CYCLE_MINUTES

  const snapshot_every_n_cycles =
    typeof nRow?.interval_minutes === 'number' && nRow.interval_minutes >= 1
      ? nRow.interval_minutes
      : DEFAULT_SNAPSHOT_EVERY_N_CYCLES

  const snapshot_interval_minutes = cycle_minutes * snapshot_every_n_cycles

  const tiers =
    tierRows && tierRows.length > 0
      ? (tierRows as HolderTierRow[])
      : DEFAULT_TIERS

  const nft_item_tiers =
    nftTierRows && nftTierRows.length > 0
      ? (nftTierRows as NftItemTierRow[])
      : DEFAULT_NFT_ITEM_TIERS

  const max_mints_per_tick =
    typeof maxMintsRow?.interval_minutes === 'number' && maxMintsRow.interval_minutes >= 1
      ? Math.floor(maxMintsRow.interval_minutes)
      : DEFAULT_MAX_MINTS_PER_TICK

  const sft_max_gpa_pages_per_tick =
    typeof sftGpaRow?.interval_minutes === 'number' && sftGpaRow.interval_minutes >= 1
      ? Math.floor(sftGpaRow.interval_minutes)
      : DEFAULT_SFT_MAX_GPA_PAGES

  const sft_max_children_per_tick =
    typeof sftChildRow?.interval_minutes === 'number' && sftChildRow.interval_minutes >= 1
      ? Math.floor(sftChildRow.interval_minutes)
      : DEFAULT_SFT_MAX_CHILDREN

  return {
    cycle_minutes,
    snapshot_every_n_cycles,
    snapshot_interval_minutes,
    tiers,
    nft_item_tiers,
    max_mints_per_tick,
    sft_max_gpa_pages_per_tick,
    sft_max_children_per_tick,
  }
}

export function intervalMinutesForHolderCount(tiers: HolderTierRow[], holderCount: number): number {
  const sorted = [...tiers].sort((a, b) => a.sort_order - b.sort_order)
  for (const t of sorted) {
    if (t.max_holders == null) return t.interval_minutes
    if (holderCount <= t.max_holders) return t.interval_minutes
  }
  return sorted[sorted.length - 1]?.interval_minutes ?? 5
}

export function minHolderIntervalMinutes(tiers: HolderTierRow[]): number {
  if (!tiers.length) return 5
  return Math.min(...tiers.map((t) => t.interval_minutes))
}

export function holderCountFromRow(holderWallets: unknown): number {
  if (Array.isArray(holderWallets)) return holderWallets.length
  return 0
}

export function isHolderSyncDue(
  lastUpdatedIso: string | null,
  holderCount: number,
  tiers: HolderTierRow[],
  now: Date,
): boolean {
  if (!lastUpdatedIso) return true
  const interval = intervalMinutesForHolderCount(tiers, holderCount)
  const elapsed = now.getTime() - new Date(lastUpdatedIso).getTime()
  return elapsed >= interval * 60 * 1000
}

export function intervalMinutesForNftItemCount(tiers: NftItemTierRow[], itemCount: number): number {
  const sorted = [...tiers].sort((a, b) => a.sort_order - b.sort_order)
  for (const t of sorted) {
    if (t.max_items == null) return t.interval_minutes
    if (itemCount <= t.max_items) return t.interval_minutes
  }
  return sorted[sorted.length - 1]?.interval_minutes ?? 5
}

/** Sum of per-wallet amounts in `holder_wallets` JSON (NFT / SPL). */
export function nftItemCountFromHolderWallets(raw: unknown): number {
  let sum = 0
  for (const v of nftHolderWalletsJsonToMap(raw).values()) sum += v
  return sum
}

export function isNftHolderSyncDue(
  lastUpdatedIso: string | null,
  itemCount: number,
  tiers: NftItemTierRow[],
  now: Date,
): boolean {
  if (!lastUpdatedIso) return true
  const interval = intervalMinutesForNftItemCount(tiers, itemCount)
  const elapsed = now.getTime() - new Date(lastUpdatedIso).getTime()
  return elapsed >= interval * 60 * 1000
}

/** Minutes past the tier-based "next refresh" time; higher = more stale (for due-first sort). */
/** NFT + sft_per_mint uses SPL-style holder row-count tiers (not NFT item tiers). */
export function currentTierOverdueMinutes(
  lastUpdatedIso: string | null,
  holderCount: number,
  itemCount: number,
  kind: 'SPL' | 'NFT',
  holderTiers: HolderTierRow[],
  nftTiers: NftItemTierRow[],
  now: Date,
  nftCollectionSyncMode?: string | null,
): number {
  if (!lastUpdatedIso) return 1e9
  const useHolderTiers = kind === 'SPL' || (kind === 'NFT' && nftCollectionSyncMode === 'sft_per_mint')
  const intervalMin = useHolderTiers
    ? intervalMinutesForHolderCount(holderTiers, holderCount)
    : intervalMinutesForNftItemCount(nftTiers, itemCount)
  const elapsedMin = (now.getTime() - new Date(lastUpdatedIso).getTime()) / 60000
  return elapsedMin - intervalMin
}

export function alignSnapshotBucket(
  now: Date,
  intervalMinutes: number,
): { snapshotAt: string; snapshotDate: string } {
  const ms = now.getTime()
  const bucketMs = Math.floor(ms / (intervalMinutes * 60 * 1000)) * (intervalMinutes * 60 * 1000)
  const bucket = new Date(bucketMs)
  return {
    snapshotAt: bucket.toISOString(),
    snapshotDate: bucket.toISOString().slice(0, 10),
  }
}
