/**
 * Watchtower billing: paid counts and within-limit checks.
 * Uses tenant_meter_limits (pricing engine v2).
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type PaidCountsByScope = {
  mints_current: number
  mintsSnapshot: number
  mintsTransactions: number
}

const SCOPE_TO_METER: Record<keyof PaidCountsByScope, string> = {
  mints_current: 'mints_current',
  mintsSnapshot: 'mints_snapshot',
  mintsTransactions: 'mints_transactions',
}

export async function getPaidCountsByScope(
  db: SupabaseClient,
  tenantId: string,
): Promise<PaidCountsByScope> {
  const { data: rows } = await db
    .from('tenant_meter_limits')
    .select('meter_key, quantity_total')
    .eq('tenant_id', tenantId)
    .in('meter_key', ['mints_current', 'mints_snapshot', 'mints_transactions'])

  const byMeter = (rows ?? []).reduce(
    (acc: Record<string, number>, r: { meter_key: string; quantity_total: number }) => {
      acc[r.meter_key] = Number(r.quantity_total)
      return acc
    },
    {},
  )

  return {
    mints_current: byMeter.mints_current ?? 0,
    mintsSnapshot: byMeter.mints_snapshot ?? 0,
    mintsTransactions: byMeter.mints_transactions ?? 0,
  }
}

export async function getWithinLimitMints(
  db: SupabaseClient,
  tenantId: string,
  scopeKey: keyof PaidCountsByScope,
): Promise<Set<string>> {
  const meterKey = SCOPE_TO_METER[scopeKey]
  const { data: limitRow } = await db
    .from('tenant_meter_limits')
    .select('quantity_total')
    .eq('tenant_id', tenantId)
    .eq('meter_key', meterKey)
    .maybeSingle()

  const limit = limitRow ? Number((limitRow as { quantity_total: number }).quantity_total) : 0
  if (limit <= 0) return new Set()

  const trackCol =
    scopeKey === 'mints_current'
      ? 'track_holders'
      : scopeKey === 'mintsSnapshot'
        ? 'track_snapshot'
        : 'track_transactions'
  const enabledCol =
    scopeKey === 'mints_current'
      ? 'enabled_at_holders'
      : scopeKey === 'mintsSnapshot'
        ? 'enabled_at_snapshot'
        : 'enabled_at_transactions'

  const { data: watches } = await db
    .from('watchtower_watches')
    .select(`mint, ${enabledCol}`)
    .eq('tenant_id', tenantId)
    .eq(trackCol, true)
    .not(enabledCol, 'is', null)
    .order(enabledCol, { ascending: true })
    .limit(limit)

  return new Set((watches ?? []).map((w) => w.mint as string))
}

export async function isMintWithinLimit(
  db: SupabaseClient,
  tenantId: string,
  mint: string,
  scopeKey: keyof PaidCountsByScope,
): Promise<boolean> {
  const within = await getWithinLimitMints(db, tenantId, scopeKey)
  return within.has(mint)
}
