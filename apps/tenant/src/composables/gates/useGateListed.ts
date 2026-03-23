/**
 * Check whether the current wallet is on any gate for this tenant.
 * Used for gating public module visibility in the nav.
 */
import { invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useTenantStore } from '~/stores/tenant'
import { useSupabase } from '~/composables/core/useSupabase'
import { useAuth } from '@decentraguild/auth'

export function useGateListed() {
  const tenantId = computed(() => useTenantStore().tenantId)
  const { wallet } = useAuth()
  const isListed = ref(false)
  const loading = ref(false)

  async function check() {
    const id = tenantId.value
    const w = wallet.value
    if (!id || !w) {
      isListed.value = false
      return
    }
    loading.value = true
    try {
      const supabase = useSupabase()
      const data = await invokeEdgeFunction<{ listed: boolean }>(supabase, 'gates', { action: 'is-listed', tenantId: id, wallet: w })
      isListed.value = data.listed ?? false
    } catch {
      isListed.value = false
    } finally {
      loading.value = false
    }
  }

  watch([tenantId, wallet], () => check(), { immediate: true })

  return { isListed, loading, check }
}
