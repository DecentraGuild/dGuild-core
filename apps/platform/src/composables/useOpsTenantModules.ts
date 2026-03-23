import { useSupabase, invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { getModuleCatalogListWithAddons } from '@decentraguild/catalog'
import type { TenantConfig } from '@decentraguild/core'

interface SubscriptionSummary { billingPeriod: string; periodStart: string; periodEnd: string; recurringAmountUsdc: number }

const catalogModules = getModuleCatalogListWithAddons().filter((m) => !m.docsOnly)

export function useOpsTenantModules(
  tenant: Ref<TenantConfig | null>,
  subscriptions: Ref<Record<string, SubscriptionSummary | null>>,
  minDateForNewSub: ComputedRef<string>,
  loadTenant: () => Promise<void>,
) {
  const moduleError = ref<string | null>(null)
  const toggleLoading = ref<string | null>(null)
  const endDateByModule = ref<Record<string, string>>({})

  const setPeriodEndModuleId = ref<string | null>(null)
  const setPeriodEndForm = ref({ periodEnd: '', billingPeriod: 'yearly' })
  const setPeriodEndError = ref<string | null>(null)
  const setPeriodEndSaving = ref(false)
  const setPeriodEndLoading = ref<string | null>(null)

  const moduleRows = computed(() =>
    catalogModules.map((entry) => {
      const id = entry.id
      const tenantEntry = (tenant.value?.modules ?? {})[id] as { state?: string } | undefined
      const state = ((tenantEntry?.state ?? 'off') as string) || 'off'
      const sub = subscriptions.value[id] ?? null
      return { id, state, subscription: sub }
    }),
  )

  async function toggleModule(moduleId: string, enabled: boolean, _periodEnd?: string) {
    if (!tenant.value) return
    moduleError.value = null; toggleLoading.value = moduleId
    try {
      const supabase = useSupabase()
      const state = enabled ? 'active' : 'off'
      const data = await invokeEdgeFunction<{ ok?: boolean }>(supabase, 'platform', {
        action: 'tenant-module',
        tenantId: tenant.value.id,
        moduleId,
        state,
      })
      if (data.ok) await loadTenant()
    } catch (e) {
      moduleError.value = e instanceof Error ? e.message : 'Failed to update module'
    } finally { toggleLoading.value = null }
  }

  function openSetPeriodEnd(moduleId: string) {
    setPeriodEndModuleId.value = moduleId; setPeriodEndError.value = null
    const sub = subscriptions.value[moduleId]
    setPeriodEndForm.value = { periodEnd: sub?.periodEnd ? sub.periodEnd.slice(0, 10) : minDateForNewSub.value, billingPeriod: 'yearly' }
  }

  async function submitSetPeriodEnd() {
    const moduleId = setPeriodEndModuleId.value
    if (!moduleId || !tenant.value) return
    setPeriodEndError.value = null; setPeriodEndSaving.value = true
    try {
      const supabase = useSupabase()
      await invokeEdgeFunction(supabase, 'platform', {
        action: 'billing-set-period-end',
        tenantId: tenant.value.id,
        moduleId,
        periodEnd: setPeriodEndForm.value.periodEnd,
      })
      setPeriodEndModuleId.value = null; await loadTenant()
    } catch (e) {
      setPeriodEndError.value = e instanceof Error ? e.message : 'Failed to set end date'
    } finally { setPeriodEndSaving.value = false }
  }

  return { moduleError, toggleLoading, endDateByModule, setPeriodEndModuleId, setPeriodEndForm, setPeriodEndError, setPeriodEndSaving, setPeriodEndLoading, moduleRows, toggleModule, openSetPeriodEnd, submitSetPeriodEnd }
}
