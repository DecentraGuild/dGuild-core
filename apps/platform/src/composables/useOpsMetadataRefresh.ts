import { useSupabase, invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useTransactionNotificationsStore } from '~/stores/transactionNotifications'

export function useOpsMetadataRefresh() {
  const toastStore = useTransactionNotificationsStore()

  const metadataRefreshLoading = ref(false)
  const metadataRefreshResult = ref<string | null>(null)
  const metadataRefreshError = ref<string | null>(null)
  const metadataRefreshOffset = ref(0)

  async function seedMetadataFromConfigs() {
    const toastId = `metadata-seed-${Date.now()}`
    toastStore.add(toastId, { status: 'pending', message: 'Seeding metadata from configs…' })
    metadataRefreshLoading.value = true
    metadataRefreshResult.value = null
    metadataRefreshError.value = null
    try {
      const supabase = useSupabase()
      const res = await invokeEdgeFunction<{ seeded?: number; total?: number; message?: string; remaining?: number }>(supabase, 'marketplace', { action: 'metadata-seed-from-configs', limit: 100 })
      const msg = res.message ?? `Seeded ${res.seeded ?? 0} mints.`
      metadataRefreshResult.value = msg + ((res.remaining ?? 0) > 0 ? ' Click again to continue.' : '')
      toastStore.add(toastId, { status: 'success', message: msg })
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Failed to seed metadata'
      metadataRefreshError.value = errMsg
      toastStore.add(toastId, { status: 'error', message: errMsg })
    } finally { metadataRefreshLoading.value = false }
  }

  async function refreshMetadata(limit: number) {
    const toastId = `metadata-refresh-${Date.now()}`
    toastStore.add(toastId, { status: 'pending', message: 'Refreshing metadata…' })
    metadataRefreshLoading.value = true
    metadataRefreshResult.value = null
    metadataRefreshError.value = null
    try {
      const supabase = useSupabase()
      const res = await invokeEdgeFunction<{ refreshed?: number; total?: number; trackedTotal?: number; message?: string; nextOffset?: number | null; enqueuedCollections?: number }>(supabase, 'mint-catalog-index', { mode: 'ops-refresh', limit, offset: metadataRefreshOffset.value })
      const msg = res.message ?? `Refreshed ${res.refreshed ?? 0} of ${res.total ?? 0} mints${res.trackedTotal != null ? ` (${res.trackedTotal} in catalog scope)` : ''}.`
      metadataRefreshResult.value = msg + (res.nextOffset != null ? ' Click again to continue.' : '')
      metadataRefreshOffset.value = res.nextOffset ?? 0
      toastStore.add(toastId, { status: 'success', message: msg })
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Failed to refresh metadata'
      metadataRefreshError.value = errMsg
      toastStore.add(toastId, { status: 'error', message: errMsg })
    } finally { metadataRefreshLoading.value = false }
  }

  return { metadataRefreshLoading, metadataRefreshResult, metadataRefreshError, seedMetadataFromConfigs, refreshMetadata }
}
