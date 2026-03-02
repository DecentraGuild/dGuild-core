/**
 * Checks whether the given wallet is on a specific whitelist for the tenant.
 * Used for tenant-level and module-level gating.
 */
import { API_V1 } from '~/utils/apiBase'

export function useWalletOnList(
  slug: Ref<string | null>,
  listAddress: Ref<string | null>,
  wallet: Ref<string | null>
) {
  const listed = ref<boolean | null>(null)
  const loading = ref(false)

  async function fetchCheck() {
    const s = slug.value
    const list = listAddress.value
    const w = wallet.value
    if (!s || !list?.trim() || !w?.trim()) {
      listed.value = null
      return
    }
    loading.value = true
    try {
      const apiBase = useApiBase()
      const res = await fetch(
        `${apiBase.value}${API_V1}/tenant/${encodeURIComponent(s)}/whitelist/check?wallet=${encodeURIComponent(w)}&list=${encodeURIComponent(list)}`,
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

  watch([slug, listAddress, wallet], () => fetchCheck(), { immediate: true })

  return { listed, loading, refetch: fetchCheck }
}
