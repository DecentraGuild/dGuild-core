import type { BillingPeriod, ConditionSet, PriceResult } from '@decentraguild/billing'
import { API_V1 } from '~/utils/apiBase'
import { useTenantStore } from '~/stores/tenant'

export function usePricePreview(
  slug: Ref<string | null>,
  moduleId: Ref<string>,
  billingPeriod?: Ref<BillingPeriod>,
) {
  const apiBase = useApiBase()
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

    const period = billingPeriod?.value ?? 'monthly'
    const url = `${apiBase.value}${API_V1}/tenant/${encodeURIComponent(id)}/billing/price-preview?moduleId=${encodeURIComponent(m)}&billingPeriod=${encodeURIComponent(period)}`

    loading.value = true
    error.value = null
    try {
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { conditions?: ConditionSet; price?: PriceResult }
      conditions.value = data.conditions ?? null
      price.value = data.price ?? null
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load pricing'
      conditions.value = null
      price.value = null
    } finally {
      loading.value = false
    }
  }

  watch(
    [slug, moduleId, () => billingPeriod?.value],
    () => refresh(),
    { immediate: true },
  )

  return { conditions, price, loading, error, refresh }
}
