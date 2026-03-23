/**
 * Composable for generating shipment JSON from condition rules.
 * Calls qualification API (rules-mode-json or weighted-time-json).
 */
import type { LoadedShipmentJson } from '~/composables/shipment/usePlanShipmentForm'
import { invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useSupabase } from '~/composables/core/useSupabase'

export interface GenerateParams {
  tenantId: string
  conditionSetId: number
  mint: string
  fixedAmount?: number
  totalAmount?: number
  isWeighted: boolean
}

export function useShipmentJsonGenerator() {
  const supabase = useSupabase()

  async function generate(params: GenerateParams): Promise<LoadedShipmentJson | null> {
    const { tenantId, conditionSetId, mint, fixedAmount = 0, totalAmount = 0, isWeighted } = params
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new Error('Connect your wallet and sign in to generate JSON.')
    }
    const action = isWeighted ? 'weighted-time-json' : 'rules-mode-json'
    const body = isWeighted
      ? { action, tenantId, conditionSetId, totalAmount, mint: mint.trim() }
      : { action, tenantId, conditionSetId, fixedAmount, mint: mint.trim() }
    const data = await invokeEdgeFunction<{
      mint?: string
      recipients?: Array<{ address: string; amount: number }>
      totalAmount?: number
    }>(supabase, 'qualification', body, { headers: { Authorization: `Bearer ${session.access_token}` }, errorFallback: 'Failed to generate' })
    const result = data
    if (!result?.mint || !Array.isArray(result.recipients)) {
      throw new Error('Invalid response from qualification')
    }
    return {
      mint: result.mint,
      recipients: result.recipients,
      ...(result.totalAmount != null && { totalAmount: result.totalAmount }),
    }
  }

  return { generate }
}
