/**
 * Shipment history for Plan Shipment tab.
 * Fetches shipment_records for the tenant (admin RLS).
 */

import type { Ref } from 'vue'
import { useSupabase } from '~/composables/core/useSupabase'

export interface ShipmentRecord {
  id: number
  mint: string
  recipient_count: number
  total_amount: string
  tx_signature: string
  created_by: string
  created_at: string
}

export function useShipmentHistory(tenantId: Ref<string | null>) {
  const records = ref<ShipmentRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetch() {
    const id = tenantId.value
    if (!id) {
      records.value = []
      loading.value = false
      error.value = null
      return
    }
    loading.value = true
    error.value = null
    try {
      const supabase = useSupabase()
      const { data, err } = await supabase
        .from('shipment_records')
        .select('id, mint, recipient_count, total_amount, tx_signature, created_by, created_at')
        .eq('tenant_id', id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (err) throw new Error(err.message)
      records.value = (data ?? []) as ShipmentRecord[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load shipment history'
      records.value = []
    } finally {
      loading.value = false
    }
  }

  return { records, loading, error, fetch }
}
