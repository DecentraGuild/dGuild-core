/**
 * Admin billing subscriptions. Reads from granted_entitlements and tenant_meter_limits (pricing engine v2).
 */
import type { BillingPeriod } from '@decentraguild/billing'
import { tenantMeterLimitKeyForModule } from '@decentraguild/billing'
import { useAdminTenant } from '~/composables/admin/useAdminTenant'
import { useSupabase } from '~/composables/core/useSupabase'

export interface SubscriptionInfo {
  billingPeriod: BillingPeriod
  periodEnd: string
  recurringAmountUsdc: number
  selectedTierId?: string
  conditionsSnapshot?: Record<string, number>
}

export type WatchtowerSubscriptionByScope = Record<string, SubscriptionInfo>

const WATCHTOWER_SCOPES = ['mints_current', 'mints_snapshot', 'mints_transactions'] as const
const SCOPE_DISPLAY: Record<string, string> = {
  mints_current: 'mints_current',
  mints_snapshot: 'mintsSnapshot',
  mints_transactions: 'mints_transactions',
}

function toSubscriptionInfo(
  quantityTotal: number,
  expiresAtMax: string | null,
): SubscriptionInfo {
  return {
    billingPeriod: 'monthly',
    periodEnd: expiresAtMax ?? new Date().toISOString(),
    recurringAmountUsdc: 0,
    conditionsSnapshot: {},
  }
}

export function useAdminSubscriptions() {
  const { tenantId } = useAdminTenant()
  const supabase = useSupabase()

  const subscriptions = reactive<
    Record<string, SubscriptionInfo | WatchtowerSubscriptionByScope | null>
  >({})

  async function fetchSubscription(moduleId: string) {
    const id = tenantId.value
    if (!id) return

    subscriptions[moduleId] = null

    if (moduleId === 'watchtower') {
      const { data: limits } = await supabase
        .from('tenant_meter_limits')
        .select('meter_key, quantity_total, expires_at_max')
        .eq('tenant_id', id)
        .in('meter_key', WATCHTOWER_SCOPES)

      const byScope: WatchtowerSubscriptionByScope = {}
      for (const scope of WATCHTOWER_SCOPES) {
        const row = (limits ?? []).find((r: { meter_key: string }) => r.meter_key === scope)
        const qty = row ? Number((row as { quantity_total: number }).quantity_total) : 0
        const expires = row ? (row as { expires_at_max: string | null }).expires_at_max : null
        const key = SCOPE_DISPLAY[scope] ?? scope
        byScope[key] = toSubscriptionInfo(qty, expires)
        byScope[key].conditionsSnapshot = { [key]: qty }
      }
      subscriptions[moduleId] = byScope
      return
    }

    const meterKey = tenantMeterLimitKeyForModule(moduleId)

    const { data: limit } = await supabase
      .from('tenant_meter_limits')
      .select('quantity_total, expires_at_max')
      .eq('tenant_id', id)
      .eq('meter_key', meterKey)
      .maybeSingle()

    if (limit) {
      const qty = Number((limit as { quantity_total: number }).quantity_total)
      const expires = (limit as { expires_at_max: string | null }).expires_at_max
      const info = toSubscriptionInfo(qty, expires)
      info.conditionsSnapshot = { [meterKey]: qty }
      subscriptions[moduleId] = info
    }
  }

  const { slug } = useAdminTenant()
  return { subscriptions, fetchSubscription, slug }
}
