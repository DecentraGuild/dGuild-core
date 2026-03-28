import { truncateAddress } from '@decentraguild/display'
import { PublicKey } from '@solana/web3.js'
import { invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { shallowRef, watchEffect } from 'vue'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantStore } from '~/stores/tenant'

interface ProfileEntry {
  wallet_address: string
  member_id: string
  nickname: string | null
}

function canonicalSolanaAddress(address: string): string | null {
  const t = address.trim()
  if (!t) return null
  try {
    return new PublicKey(t).toBase58()
  } catch {
    return null
  }
}

const tenantNicknameMaps = shallowRef(new Map<string, Map<string, string>>())
const loadingSet = new Set<string>()

async function loadForTenant(tenantId: string) {
  if (tenantNicknameMaps.value.has(tenantId) || loadingSet.has(tenantId)) return
  loadingSet.add(tenantId)
  let inner = new Map<string, string>()
  try {
    const supabase = useSupabase()
    const data = await invokeEdgeFunction<{ profiles: ProfileEntry[] }>(
      supabase,
      'member-profile',
      { action: 'profiles', tenantId },
    )
    const built = new Map<string, string>()
    for (const p of data.profiles ?? []) {
      const nick = typeof p.nickname === 'string' ? p.nickname.trim() : ''
      if (!nick) continue
      const raw = (p.wallet_address ?? '').trim()
      const canon = canonicalSolanaAddress(raw) ?? raw
      built.set(canon, nick)
      if (raw !== canon) built.set(raw, nick)
    }
    inner = built
  } catch {
    inner = new Map()
  } finally {
    loadingSet.delete(tenantId)
    const next = new Map(tenantNicknameMaps.value)
    next.set(tenantId, inner)
    tenantNicknameMaps.value = next
  }
}

export function useMemberProfiles() {
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId)

  watchEffect(() => {
    if (tenantId.value) void loadForTenant(tenantId.value)
  })

  function resolveWallet(address: string, startChars = 6, endChars = 4): string {
    const tid = tenantId.value ?? ''
    const map = tenantNicknameMaps.value.get(tid)
    const raw = address.trim()
    const canon = canonicalSolanaAddress(raw) ?? raw
    const nickname = map?.get(canon) ?? map?.get(raw)
    return nickname ?? truncateAddress(address, startChars, endChars)
  }

  function invalidateCache() {
    const tid = tenantId.value
    if (!tid) return
    const next = new Map(tenantNicknameMaps.value)
    next.delete(tid)
    tenantNicknameMaps.value = next
  }

  return { resolveWallet, invalidateCache }
}
