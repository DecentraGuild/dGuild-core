import type { Ref } from 'vue'
import { ref } from 'vue'
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

export interface ShipmentCompressedLeafRow {
  recipient_wallet: string
  leaf_hash_decimal: string
  amount_raw: string
}

export function useShipmentHistory(tenantId: Ref<string | null | undefined>) {
  const supabase = useSupabase()

  const records = ref<ShipmentRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const expandedId = ref<number | null>(null)
  const leavesByRecordId = ref<Record<number, ShipmentCompressedLeafRow[]>>({})
  const leavesLoadingId = ref<number | null>(null)

  async function fetch() {
    const id = tenantId.value
    if (!id) return
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('shipment_records')
        .select('id, mint, recipient_count, total_amount, tx_signature, created_by, created_at')
        .eq('tenant_id', id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (err) throw new Error(err.message)
      records.value = (data ?? []) as ShipmentRecord[]
      leavesByRecordId.value = {}
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load shipment history'
      records.value = []
    } finally {
      loading.value = false
    }
  }

  function leavesFor(recordId: number): ShipmentCompressedLeafRow[] {
    return leavesByRecordId.value[recordId] ?? []
  }

  async function loadLeavesForShipment(recordId: number) {
    if (leavesByRecordId.value[recordId]) return
    leavesLoadingId.value = recordId
    try {
      const { data, error: err } = await supabase
        .from('shipment_compressed_leaves')
        .select('recipient_wallet, leaf_hash_decimal, amount_raw')
        .eq('shipment_record_id', recordId)
        .order('id', { ascending: true })
      if (err) throw new Error(err.message)
      leavesByRecordId.value = {
        ...leavesByRecordId.value,
        [recordId]: (data ?? []) as ShipmentCompressedLeafRow[],
      }
    } catch {
      leavesByRecordId.value = {
        ...leavesByRecordId.value,
        [recordId]: [],
      }
    } finally {
      leavesLoadingId.value = null
    }
  }

  async function toggleExpanded(id: number) {
    if (expandedId.value === id) {
      expandedId.value = null
    } else {
      expandedId.value = id
      await loadLeavesForShipment(id)
    }
  }

  function formatTotalAmount(raw: string): string {
    const n = Number(raw)
    if (!Number.isFinite(n)) return raw
    return n.toLocaleString(undefined, { maximumFractionDigits: 6 })
  }

  return {
    records,
    loading,
    error,
    expandedId,
    leavesLoadingId,
    leavesFor,
    fetch,
    toggleExpanded,
    formatTotalAmount,
  }
}
