/**
 * Watchtower billing: paid counts and within-limit checks.
 * Only mints within the paid limit (first N by enabled_at per scope) get sync and data access.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type PaidCountsByScope = {
  mints_current: number
  mintsSnapshot: number
  mintsTransactions: number
}

const SCOPE_KEYS = ['mints_current', 'mintsSnapshot', 'mintsTransactions'] as const
const SCOPE_TO_ENABLED_AT = {
  mints_current: 'enabled_at_holders',
  mintsSnapshot: 'enabled_at_snapshot',
  mintsTransactions: 'enabled_at_transactions',
} as const
const SCOPE_TO_TRACK = {
  mints_current: 'track_holders',
  mintsSnapshot: 'track_snapshot',
  mintsTransactions: 'track_transactions',
} as const

export async function getPaidCountsByScope(
  db: SupabaseClient,
  tenantId: string,
): Promise<PaidCountsByScope> {
  const { data: rows } = await db
    .from('billing_subscriptions')
    .select('scope_key, conditions_snapshot')
    .eq('tenant_id', tenantId)
    .eq('module_id', 'watchtower')
  const result: PaidCountsByScope = { mints_current: 0, mintsSnapshot: 0, mintsTransactions: 0 }
  for (const row of rows ?? []) {
    const cond = (row.conditions_snapshot as Record<string, number> | null) ?? {}
    const scopeKey = (row.scope_key as string) ?? ''
    if (scopeKey && SCOPE_KEYS.includes(scopeKey as keyof PaidCountsByScope)) {
      result[scopeKey as keyof PaidCountsByScope] = Number(cond[scopeKey]) || 0
    }
  }
  return result
}

export async function getWithinLimitMints(
  db: SupabaseClient,
  tenantId: string,
  scopeKey: keyof PaidCountsByScope,
): Promise<Set<string>> {
  const paid = await getPaidCountsByScope(db, tenantId)
  const paidCount = paid[scopeKey]
  if (paidCount <= 0) return new Set()

  const enabledCol = SCOPE_TO_ENABLED_AT[scopeKey]
  const trackCol = SCOPE_TO_TRACK[scopeKey]
  const { data: watches } = await db
    .from('watchtower_watches')
    .select(`mint, ${enabledCol}`)
    .eq('tenant_id', tenantId)
    .eq(trackCol, true)
    .not(enabledCol, 'is', null)
    .order(enabledCol, { ascending: true })

  const within: string[] = []
  for (const w of watches ?? []) {
    if (within.length >= paidCount) break
    within.push(w.mint as string)
  }
  return new Set(within)
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
