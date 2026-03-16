/**
 * Billing quote. Calls billing Edge Function quote action.
 */
import type { Ref } from 'vue'
import type { QuoteResult } from '@decentraguild/billing'
import { MODULE_TO_PRODUCT } from '@decentraguild/billing'
import { useSupabase } from '~/composables/core/useSupabase'
import { useAdminTenant } from '~/composables/admin/useAdminTenant'
import { getEdgeFunctionErrorMessage } from '~/utils/edgeFunctionError'

export function useQuote(opts: {
  moduleId: Ref<string>
  durationDays?: Ref<number>
  meterOverrides?: Ref<Record<string, number> | undefined>
  bundleId?: Ref<string | undefined>
  slugOnly?: boolean
}) {
  const { tenantId } = useAdminTenant()
  const supabase = useSupabase()

  const quote = ref<QuoteResult | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const billingDisabled = ref(false)

  async function fetchQuote() {
    const id = tenantId.value
    const mid = opts.moduleId.value
    if (!id || !mid) {
      quote.value = null
      return
    }

    const productKey = MODULE_TO_PRODUCT[mid] ?? mid
    loading.value = true
    error.value = null
    try {
      const body: Record<string, unknown> = {
        action: 'quote',
        tenantId: id,
        productKey,
        durationDays: opts.durationDays?.value ?? 30,
      }
      if (opts.meterOverrides?.value) body.meterOverrides = opts.meterOverrides.value
      if (opts.bundleId?.value) body.bundleId = opts.bundleId.value
      if (opts.slugOnly) {
        body.productKey = 'admin'
        body.meterOverrides = { slug: 1 }
        body.durationDays = 365
      }

      const { data, error: fnError } = await supabase.functions.invoke('billing', { body })
      if (fnError) throw new Error(getEdgeFunctionErrorMessage(fnError, 'Quote failed'))
      if (!data) throw new Error('No quote returned')

      quote.value = data as QuoteResult
      billingDisabled.value = false
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Quote failed'
      quote.value = null
      billingDisabled.value = true
    } finally {
      loading.value = false
    }
  }

  return { quote, loading, error, billingDisabled, fetchQuote }
}
