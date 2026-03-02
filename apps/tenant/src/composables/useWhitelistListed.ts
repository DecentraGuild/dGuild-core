/**
 * Fetches whether the given wallet is on any whitelist for the tenant.
 * Used to conditionally show the Whitelist nav item (only when user is listed).
 */
import { API_V1 } from '~/utils/apiBase'

export function useWhitelistListed(slug: Ref<string | null>, wallet: Ref<string | null>) {
  const listed = ref<boolean | null>(null)
  const loading = ref(false)

  async function fetchListed() {
    const s = slug.value
    const w = wallet.value
    if (!s || !w) {
      listed.value = null
      return
    }
    loading.value = true
    try {
      const apiBase = useApiBase()
      const res = await fetch(
        `${apiBase.value}${API_V1}/tenant/${s}/whitelist/is-listed?wallet=${encodeURIComponent(w)}`,
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
