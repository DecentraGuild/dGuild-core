/**
 * Billing price preview via the billing Edge Function.
 * Returns live conditions and computed price for a module.
 */
import type { BillingPeriod, ConditionSet, PriceResult } from '@decentraguild/billing'
import { useTenantStore } from '~/stores/tenant'
import { useSupabase } from '~/composables/core/useSupabase'
import { getEdgeFunctionErrorMessage } from '~/utils/edgeFunctionError'

export function usePricePreview(
  slug: Ref<string | null>,
  moduleId: Ref<string>,
  billingPeriod?: Ref<BillingPeriod>,
) {
  const tenantId = computed(() => useTenantStore().tenantId)
  const conditions = ref<ConditionSet | null>(null)
  const price = ref<PriceResult | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh() {
    const id = tenantId.value
    const m = moduleId.value
    if (!id || !m) {
      conditions.value = null
      price.value = null
      return
    }
    loading.value = true
    error.value = null
    try {
      const supabase = useSupabase()
      const { data, error: fnError } = await supabase.functions.invoke('billing', {
        body: {
          action: 'preview',
          tenantId: id,
          moduleId: m,
          billingPeriod: billingPeriod?.value ?? 'monthly',
        },
      })
      if (fnError) throw new Error(getEdgeFunctionErrorMessage(fnError, 'Failed to load pricing'))
      const result = data as { conditions?: ConditionSet; price?: PriceResult }
      conditions.value = result.conditions ?? null
      price.value = result.price ?? null
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load pricing'
      conditions.value = null
      price.value = null
    } finally {
      loading.value = false
    }
  }

  watch([slug, moduleId, () => billingPeriod?.value], () => refresh(), { immediate: true })

  return { conditions, price, loading, error, refresh }
}
