import type { Ref } from 'vue'
import { useSupabase, invokeEdgeFunction } from '@decentraguild/nuxt-composables'

interface BindListConfig<TUnbound> {
  fetchAction: string
  bindAction: string
  unbindAction: string
  keyField: string
  parseUnbound: (data: unknown) => TUnbound[]
}

export function useOpsTenantBindList<TUnbound>(
  tenantId: Ref<string | null>,
  config: BindListConfig<TUnbound>,
  reload: () => Promise<void>,
) {
  const unboundItems = ref<TUnbound[]>([]) as Ref<TUnbound[]>
  const selectedUnbound = ref('')
  const fetchLoading = ref(false)
  const bindLoading = ref(false)
  const unbindLoading = ref<string | null>(null)
  const listError = ref<string | null>(null)

  async function fetchUnbound() {
    if (!tenantId.value) return
    listError.value = null
    fetchLoading.value = true
    try {
      const supabase = useSupabase()
      const data = await invokeEdgeFunction(supabase, 'platform', { action: config.fetchAction, tenantId: tenantId.value })
      unboundItems.value = config.parseUnbound(data)
      selectedUnbound.value = ''
    } catch (e) {
      listError.value = e instanceof Error ? e.message : 'Failed to fetch'
    } finally {
      fetchLoading.value = false
    }
  }

  async function bind() {
    const key = selectedUnbound.value
    if (!tenantId.value || !key) return
    listError.value = null
    bindLoading.value = true
    try {
      const supabase = useSupabase()
      await invokeEdgeFunction(supabase, 'platform', { action: config.bindAction, tenantId: tenantId.value, [config.keyField]: key })
      selectedUnbound.value = ''
      await reload()
      unboundItems.value = unboundItems.value.filter(
        (item) => (item as Record<string, unknown>)[config.keyField] !== key,
      )
    } catch (e) {
      listError.value = e instanceof Error ? e.message : 'Failed to bind'
    } finally {
      bindLoading.value = false
    }
  }

  async function unbind(key: string) {
    if (!tenantId.value) return
    listError.value = null
    unbindLoading.value = key
    try {
      const supabase = useSupabase()
      await invokeEdgeFunction(supabase, 'platform', { action: config.unbindAction, tenantId: tenantId.value, [config.keyField]: key })
      await reload()
    } catch (e) {
      listError.value = e instanceof Error ? e.message : 'Failed to unbind'
    } finally {
      unbindLoading.value = null
    }
  }

  return {
    unboundItems,
    selectedUnbound,
    fetchLoading,
    bindLoading,
    unbindLoading,
    listError,
    fetchUnbound,
    bind,
    unbind,
  }
}
