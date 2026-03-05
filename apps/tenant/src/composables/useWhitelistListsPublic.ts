/**
 * Fetches the list of whitelists for a tenant (public read, no auth).
 * Used by WhitelistSelect and any UI that needs to show dGuild whitelist options.
 */
import { API_V1 } from '~/utils/apiBase'
import { useTenantStore } from '~/stores/tenant'

export interface WhitelistListPublic {
  address: string
  name: string
  imageUrl?: string | null
}

export function useWhitelistListsPublic(slug: Ref<string | null>) {
  const tenantId = computed(() => useTenantStore().tenantId)
  const lists = ref<WhitelistListPublic[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchLists() {
    const id = tenantId.value
    if (!id) {
      lists.value = []
      return
    }
    loading.value = true
    error.value = null
    try {
      const apiBase = useApiBase()
      const res = await fetch(
        `${apiBase.value}${API_V1}/tenant/${encodeURIComponent(id)}/whitelist/lists/public`,
        { credentials: 'include' }
      )
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Failed to load lists')
      }
      const data = (await res.json()) as { lists: WhitelistListPublic[] }
      lists.value = data.lists ?? []
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load lists'
      lists.value = []
    } finally {
      loading.value = false
    }
  }

  watch(slug, () => fetchLists(), { immediate: true })

  return { lists, loading, error, refetch: fetchLists }
}
