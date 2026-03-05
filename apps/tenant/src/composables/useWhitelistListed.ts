/**
 * Fetches whether the given wallet is on any whitelist for the tenant.
 * Used to conditionally show the Whitelist nav item (only when user is listed).
 */
import { API_V1 } from '~/utils/apiBase'
import { useTenantStore } from '~/stores/tenant'

export function useWhitelistListed(slug: Ref<string | null>, wallet: Ref<string | null>) {
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId)
  const listed = ref<boolean | null>(null)
  const loading = ref(false)

  async function fetchListed() {
    const id = tenantId.value
    const w = wallet.value
    if (!id || !w) {
      listed.value = null
      return
    }
    loading.value = true
    try {
      const apiBase = useApiBase()
      const res = await fetch(
        `${apiBase.value}${API_V1}/tenant/${id}/whitelist/is-listed?wallet=${encodeURIComponent(w)}`,
        { credentials: 'include' }
      )
      if (!res.ok) {
        listed.value = false
        return
      }
      const data = (await res.json()) as { listed?: boolean }
      listed.value = data.listed === true
    } catch {
      listed.value = false
    } finally {
      loading.value = false
    }
  }

  watch([slug, wallet], () => fetchListed(), { immediate: true })

  return { listed, loading, refetch: fetchListed }
}
