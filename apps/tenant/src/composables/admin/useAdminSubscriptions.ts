/**
 * Admin billing subscriptions per module.
 * Reads directly from billing_subscriptions via PostgREST (RLS enforces tenant admin access).
 * Watchtower returns per-track subscriptions keyed by scope (mints_current, mintsSnapshot, mintsTransactions).
 */

import type { BillingPeriod } from '@decentraguild/billing'
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

function rowToSubscriptionInfo(row: Record<string, unknown>): SubscriptionInfo {
  const conditions = (row.conditions_snapshot as Record<string, unknown> | undefined) ?? {}
  const conditionsSnapshot =
    Object.keys(conditions).length > 0
      ? (Object.fromEntries(
          Object.entries(conditions).filter(([, v]) => typeof v === 'number'),
        ) as Record<string, number>)
      : undefined
  return {
    billingPeriod: row.billing_period as BillingPeriod,
    periodEnd: row.period_end as string,
    recurringAmountUsdc: Number(row.recurring_amount_usdc),
    selectedTierId: (row.price_snapshot as Record<string, unknown>)?.selectedTierId as
      | string
      | undefined,
    ...(conditionsSnapshot && { conditionsSnapshot }),
  }
}

export function useAdminSubscriptions() {
  const { tenantId, slug } = useAdminTenant()

  const subscriptions = reactive<
    Record<string, SubscriptionInfo | WatchtowerSubscriptionByScope | null>
  >({})

  async function fetchSubscription(moduleId: string) {
    const id = tenantId.value
    if (!id) return
    try {
      const supabase = useSupabase()
      if (moduleId === 'watchtower') {
        const { data: rows, error } = await supabase
          .from('billing_subscriptions')
          .select('scope_key, billing_period, period_end, recurring_amount_usdc, price_snapshot, conditions_snapshot')
          .eq('tenant_id', id)
          .eq('module_id', moduleId)
        if (error) throw error
        const byScope: WatchtowerSubscriptionByScope = {}
        const scopeKeys = ['mints_current', 'mintsSnapshot', 'mintsTransactions']
        for (const row of rows ?? []) {
          const r = row as Record<string, unknown>
          const scopeKey = (r.scope_key as string) ?? ''
          const info = rowToSubscriptionInfo(r)
          if (scopeKey) {
            byScope[scopeKey] = info
          } else {
            const cond = (r.conditions_snapshot as Record<string, number> | undefined) ?? {}
            for (const key of scopeKeys) {
              const count = Number(cond[key]) || 0
              if (count > 0) byScope[key] = { ...info, conditionsSnapshot: { [key]: count } }
            }
          }
        }
        subscriptions[moduleId] = Object.keys(byScope).length > 0 ? byScope : null
        return
      }

      const { data, error } = await supabase
        .from('billing_subscriptions')
        .select('billing_period, period_end, recurring_amount_usdc, price_snapshot, conditions_snapshot')
        .eq('tenant_id', id)
        .eq('module_id', moduleId)
        .eq('scope_key', '')
        .maybeSingle()

      if (error) throw error
      if (data) {
        subscriptions[moduleId] = rowToSubscriptionInfo(data as Record<string, unknown>)
        return
      }

      if (moduleId === 'slug') {
        const { data: payments } = await supabase
          .from('billing_payments')
          .select('billing_period, period_end, amount_usdc, price_snapshot')
          .eq('tenant_id', id)
          .eq('module_id', 'slug')
          .eq('status', 'confirmed')
          .in('payment_type', ['initial', 'extend'])
          .order('confirmed_at', { ascending: false })
          .limit(1)
        const row = Array.isArray(payments) ? payments[0] : null
        if (row) {
          const r = row as Record<string, unknown>
          const priceSnap = (r.price_snapshot as Record<string, unknown>) ?? {}
          subscriptions.slug = {
            billingPeriod: (r.billing_period as BillingPeriod) ?? 'yearly',
            periodEnd: r.period_end as string,
            recurringAmountUsdc: (priceSnap.recurringYearly as number) ?? Number(r.amount_usdc),
          }
        } else {
          subscriptions.slug = null
        }
      } else {
        subscriptions[moduleId] = null
      }
    } catch {
      subscriptions[moduleId] = null
    }
  }

  return { subscriptions, fetchSubscription, slug }
}
