import { truncateAddress } from '@decentraguild/display'
import { invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantStore } from '~/stores/tenant'

interface ProfileEntry {
  wallet_address: string
  member_id: string
  nickname: string | null
}

const cache = reactive<Map<string, Map<string, string>>>(new Map())
const loadingSet = new Set<string>()

async function loadForTenant(tenantId: string) {
  if (cache.has(tenantId) || loadingSet.has(tenantId)) return
  loadingSet.add(tenantId)
  try {
    const supabase = useSupabase()
    const data = await invokeEdgeFunction<{ profiles: ProfileEntry[] }>(
      supabase,
      'member-profile',
      { action: 'profiles', tenantId },
    )
    const map = new Map<string, string>()
    for (const p of data.profiles) {
      if (p.nickname) map.set(p.wallet_address, p.nickname)
    }
    cache.set(tenantId, map)
  } catch {
    cache.set(tenantId, new Map())
  } finally {
    loadingSet.delete(tenantId)
  }
}

export function useMemberProfiles() {
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId)

  watchEffect(() => {
    if (tenantId.value) loadForTenant(tenantId.value)
  })

  function resolveWallet(address: string, startChars = 6, endChars = 4): string {
    const nickname = cache.get(tenantId.value ?? '')?.get(address)
    return nickname ?? truncateAddress(address, startChars, endChars)
  }

  function invalidateCache() {
    if (tenantId.value) cache.delete(tenantId.value)
  }

  return { resolveWallet, invalidateCache }
}
