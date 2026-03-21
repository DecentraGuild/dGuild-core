/**
 * When billing grants watchtower meter capacity, ensure watches with tracks on
 * have enabled_at_* set so getWithinLimitMints (cron-tracker / watchtower) includes them.
 */
import type { DbClient } from '../types.js'

const WATCHTOWER_METERS = new Set(['mints_current', 'mints_snapshot', 'mints_transactions'])

export async function backfillWatchtowerEnabledAtForMeters(
  db: DbClient,
  tenantId: string,
  meterKeys: Iterable<string>,
): Promise<void> {
  const now = new Date().toISOString()
  for (const key of meterKeys) {
    if (!WATCHTOWER_METERS.has(key)) continue
    if (key === 'mints_current') {
      await db
        .from('watchtower_watches')
        .update({ enabled_at_holders: now, updated_at: now })
        .eq('tenant_id', tenantId)
        .eq('track_holders', true)
        .is('enabled_at_holders', null)
    }
    if (key === 'mints_snapshot') {
      await db
        .from('watchtower_watches')
        .update({ enabled_at_snapshot: now, updated_at: now })
        .eq('tenant_id', tenantId)
        .eq('track_snapshot', true)
        .is('enabled_at_snapshot', null)
    }
    if (key === 'mints_transactions') {
      await db
        .from('watchtower_watches')
        .update({ enabled_at_transactions: now, updated_at: now })
        .eq('tenant_id', tenantId)
        .eq('track_transactions', true)
        .is('enabled_at_transactions', null)
    }
  }
}
