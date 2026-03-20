import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type HolderTierRow = {
  sort_order: number
  max_holders: number | null
  interval_minutes: number
}

const DEFAULT_SNAPSHOT_INTERVAL_MINUTES = 720

const DEFAULT_TIERS: HolderTierRow[] = [
  { sort_order: 1, max_holders: 500, interval_minutes: 5 },
  { sort_order: 2, max_holders: 5000, interval_minutes: 15 },
  { sort_order: 3, max_holders: null, interval_minutes: 60 },
]

export type WatchtowerSyncConfig = {
  snapshot_interval_minutes: number
  tiers: HolderTierRow[]
}

export async function loadWatchtowerSyncConfig(
  db: SupabaseClient,
): Promise<WatchtowerSyncConfig> {
  const [{ data: settingsRow }, { data: tierRows, error: tierErr }] = await Promise.all([
    db.from('platform_watchtower_settings').select('snapshot_interval_minutes').eq('id', 1).maybeSingle(),
    db.from('platform_watchtower_holder_tier').select('sort_order, max_holders, interval_minutes').order('sort_order'),
  ])
  if (tierErr) {
    console.warn('[watchtower-sync-config] tier load failed', tierErr.message)
  }
  const snapshot_interval_minutes =
    typeof settingsRow?.snapshot_interval_minutes === 'number' && settingsRow.snapshot_interval_minutes > 0
      ? settingsRow.snapshot_interval_minutes
      : DEFAULT_SNAPSHOT_INTERVAL_MINUTES
  const tiers =
    tierRows && tierRows.length > 0
      ? (tierRows as HolderTierRow[])
      : DEFAULT_TIERS
  return { snapshot_interval_minutes, tiers }
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
