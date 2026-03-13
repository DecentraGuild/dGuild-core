/**
 * Check whether the current wallet is on a specific whitelist (on-chain check via whitelist Edge Function).
 * Uses shared cache + request coalescing so multiple useWalletOnList instances for the same list
 * (e.g. gates, marketplace, raffles all use-default) only trigger one API call.
 */
import { useTenantStore } from '~/stores/tenant'
import { useSupabase } from '~/composables/core/useSupabase'
import { useAuth } from '@decentraguild/auth'

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { result: boolean; at: number }>()
const pending = new Map<string, Promise<boolean>>()

function cacheKey(list: string, wallet: string) {
  return `${list}:${wallet}`
}

async function fetchListed(list: string, wallet: string): Promise<boolean> {
  const key = cacheKey(list, wallet)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result

  const inFlight = pending.get(key)
  if (inFlight) return inFlight

  const promise = (async () => {
    try {
      const supabase = useSupabase()
      const { data, error } = await supabase.functions.invoke('gates', {
        body: { action: 'check', listAddress: list, wallet },
      })
      if (error) throw error
      const result = (data as { listed: boolean }).listed ?? false
      cache.set(key, { result, at: Date.now() })
      return result
    } catch {
      return false
    } finally {
      pending.delete(key)
    }
  })()
  pending.set(key, promise)
  return promise
}

export function useWalletOnList(listAddress: Ref<string | null>) {
  const tenantId = computed(() => useTenantStore().tenantId)
  const { wallet } = useAuth()
  const isListed = ref(false)
  const loading = ref(false)

  async function check() {
    const id = tenantId.value
    const list = listAddress.value
    const w = wallet.value
    if (!id || !list || !w) {
      isListed.value = false
      return
    }
    loading.value = true
    try {
      isListed.value = await fetchListed(list, w)
    } finally {
      loading.value = false
    }
  }

  watch([listAddress, wallet], () => check(), { immediate: true })

  return { isListed, loading, check }
}
