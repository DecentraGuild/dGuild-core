import { useSupabase, invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import type { TenantConfig } from '@decentraguild/core'

const WATCHTOWER_METER_KEYS = ['mints_current', 'mints_snapshot', 'mints_transactions'] as const

function watchtowerFormKey(scopeKey: string): string {
  if (scopeKey === 'mints_snapshot' || scopeKey === 'mintsSnapshot') return 'mintsSnapshot'
  if (scopeKey === 'mints_transactions' || scopeKey === 'mintsTransactions') return 'mintsTransactions'
  return scopeKey
}

const WATCHTOWER_SCOPE_LABEL: Record<string, string> = {
  mints_current: 'Current holders',
  mints_snapshot: 'Snapshot',
  mints_transactions: 'Transactions',
  mintsSnapshot: 'Snapshot',
  mintsTransactions: 'Transactions',
}

function watchtowerScopeLabel(scopeKey: string): string {
  return WATCHTOWER_SCOPE_LABEL[scopeKey] ?? scopeKey
}

export function useOpsTenantBilling(
  tenant: Ref<TenantConfig | null>,
  meterLimits: Ref<Array<{ meter_key: string; quantity_total: number; expires_at_max: string | null }>>,
  billingSubsRaw: Ref<Array<Record<string, unknown>>>,
  loadTenant: () => Promise<void>,
) {
  const watchtowerTrackInputs = ref<Record<string, number>>({ mints_current: 0, mintsSnapshot: 0, mintsTransactions: 0 })
  const watchtowerTracksSaving = ref(false)
  const watchtowerTracksError = ref<string | null>(null)

  const hasWatchtowerModule = computed(() => {
    const m = (tenant.value?.modules ?? {})['watchtower'] as { state?: string } | undefined
    return m?.state === 'active' || m?.state === 'staging' || m?.state === 'deactivating'
  })

  const watchtowerTracks = computed(() => {
    const limits = meterLimits.value.filter((r) => WATCHTOWER_METER_KEYS.includes(r.meter_key as (typeof WATCHTOWER_METER_KEYS)[number]))
    if (limits.length) {
      return limits.map((r) => {
        const scopeKey = r.meter_key
        return {
          scopeKey,
          formKey: watchtowerFormKey(scopeKey),
          label: watchtowerScopeLabel(scopeKey),
          count: r.quantity_total,
        }
      })
    }
    const rows = billingSubsRaw.value.filter((r) => r.module_id === 'watchtower' && r.scope_key && ['mints_current', 'mintsSnapshot', 'mintsTransactions'].includes(r.scope_key as string))
    if (rows.length) {
      return rows.map((r) => {
        const scopeKey = r.scope_key as string
        const cond = (r.conditions_snapshot as Record<string, number>) ?? {}
        return {
          scopeKey,
          formKey: watchtowerFormKey(scopeKey),
          label: watchtowerScopeLabel(scopeKey),
          count: Number(cond[scopeKey]) || 0,
        }
      })
    }
    return WATCHTOWER_METER_KEYS.map((key) => ({
      scopeKey: key,
      formKey: watchtowerFormKey(key),
      label: watchtowerScopeLabel(key),
      count: 0,
    }))
  })

  watch(
    watchtowerTracks,
    (tracks) => {
      const next: Record<string, number> = { mints_current: 0, mintsSnapshot: 0, mintsTransactions: 0 }
      for (const t of tracks) next[t.formKey] = t.count
      watchtowerTrackInputs.value = next
    },
    { immediate: true },
  )

  async function saveWatchtowerTracks() {
    if (!tenant.value) return
    watchtowerTracksError.value = null; watchtowerTracksSaving.value = true
    try {
      const supabase = useSupabase()
      await invokeEdgeFunction(supabase, 'platform', {
        action: 'billing-set-watchtower-tracks',
        tenantId: tenant.value.id,
        mints_current: watchtowerTrackInputs.value.mints_current,
        mintsSnapshot: watchtowerTrackInputs.value.mintsSnapshot,
        mintsTransactions: watchtowerTrackInputs.value.mintsTransactions,
      })
      await loadTenant()
    } catch (e) {
      watchtowerTracksError.value = e instanceof Error ? e.message : 'Failed to save tracks'
    } finally { watchtowerTracksSaving.value = false }
  }

  return { watchtowerTracks, watchtowerTrackInputs, watchtowerTracksSaving, watchtowerTracksError, hasWatchtowerModule, saveWatchtowerTracks }
}
