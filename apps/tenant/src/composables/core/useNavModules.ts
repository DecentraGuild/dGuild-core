/**
 * Modules visible in the sidebar nav. Used by layout and landing page
 * so both show the same navigable modules.
 */
import { useAuth } from '@decentraguild/auth'
import { isModuleVisibleToMembers, getModuleState } from '@decentraguild/core'
import { useTenantStore } from '~/stores/tenant'
import { MODULE_NAV, IMPLEMENTED_MODULES, NAV_ORDER } from '~/config/modules'
import { useEffectiveGate } from '~/composables/gates/useEffectiveGate'
import { useWalletOnList } from '~/composables/gates/useWalletOnList'

export interface NavModule {
  id: string
  path: string
  label: string
  icon: string
}

export function useNavModules() {
  const tenantStore = useTenantStore()
  const tenant = computed(() => tenantStore.tenant)
  const auth = useAuth()

  const isAdmin = computed(() => {
    const w = auth.wallet.value
    const admins = tenant.value?.admins ?? []
    return !!(w && admins.includes(w))
  })

  const navReady = ref(false)
  onMounted(() => { navReady.value = true })
  const isAdminForNav = computed(() => navReady.value && isAdmin.value)

  const _tenantDefaultListAddress = computed(() => {
    const acc = tenant.value?.defaultGate?.account
    return (acc && acc.trim()) || null
  })

  const marketplaceSettings = computed(() => tenantStore.marketplaceSettings)
  const raffleSettings = computed(() => tenantStore.raffleSettings)

  const effectiveMarketplaceWhitelist = useEffectiveGate(tenant, 'marketplace', {
    marketplaceSettings,
    raffleSettings,
  })
  const marketplaceListAddress = computed(() => {
    const v = effectiveMarketplaceWhitelist.value
    return v && typeof v === 'object' && v.account ? v.account.trim() || null : null
  })

  const effectiveRaffleWhitelist = useEffectiveGate(tenant, 'raffles', {
    marketplaceSettings,
    raffleSettings,
  })
  const raffleListAddress = computed(() => {
    const v = effectiveRaffleWhitelist.value
    return v && typeof v === 'object' && v.account ? v.account.trim() || null : null
  })

  const effectiveGatesWhitelist = useEffectiveGate(tenant, 'gates', {
    marketplaceSettings,
    raffleSettings,
  })
  const gatesListAddress = computed(() => {
    const v = effectiveGatesWhitelist.value
    return v && typeof v === 'object' && v.account ? v.account.trim() || null : null
  })

  const effectiveWatchtowerWhitelist = useEffectiveGate(tenant, 'watchtower', {
    marketplaceSettings,
    raffleSettings,
  })
  const watchtowerListAddress = computed(() => {
    const v = effectiveWatchtowerWhitelist.value
    return v && typeof v === 'object' && v.account ? v.account.trim() || null : null
  })

  const { isListed: isOnGatesList } = useWalletOnList(gatesListAddress)
  const { isListed: isOnMarketplaceList } = useWalletOnList(marketplaceListAddress)
  const { isListed: isOnRaffleList } = useWalletOnList(raffleListAddress)
  const { isListed: isOnWatchtowerList } = useWalletOnList(watchtowerListAddress)

  const navModules = computed((): NavModule[] => {
    const mods = tenant.value?.modules ?? {}
    const entries = Object.entries(mods)
      .filter(([id, e]) => {
        const navId = id === 'whitelist' ? 'gates' : id
        return isModuleVisibleToMembers(getModuleState(e)) && IMPLEMENTED_MODULES.has(navId)
      })
      .filter(([id]) => id !== 'admin' || isAdminForNav.value)
      .filter(([id]) => id !== 'crafter' || isAdminForNav.value)
      .filter(([id]) => {
        const effGates = effectiveGatesWhitelist.value
        if (id === 'gates' || id === 'whitelist') {
          if (effGates === 'admin-only') return isAdminForNav.value
          if (effGates && !isOnGatesList.value) return false
          return true
        }
        const effMkt = effectiveMarketplaceWhitelist.value
        if (id === 'marketplace' && effMkt === 'admin-only') return isAdminForNav.value
        if (id === 'marketplace' && effMkt && !isOnMarketplaceList.value) return false
        const effRaffle = effectiveRaffleWhitelist.value
        if (id === 'raffles' && effRaffle === 'admin-only') return isAdminForNav.value
        if (id === 'raffles' && effRaffle && !isOnRaffleList.value) return false
        const effWt = effectiveWatchtowerWhitelist.value
        if (id === 'watchtower' && effWt === 'admin-only') return isAdminForNav.value
        if (id === 'watchtower' && effWt && !isOnWatchtowerList.value) return false
        return true
      })
      .map(([id]) => {
        const navId = id === 'whitelist' ? 'gates' : id
        const entry = MODULE_NAV[navId]
        return {
          id: navId,
          path: entry?.path ?? '#',
          label: entry?.label ?? navId,
          icon: entry?.icon ?? 'lucide:circle',
        }
      })
    entries.sort((a, b) => {
      const ai = NAV_ORDER.indexOf(a.id)
      const bi = NAV_ORDER.indexOf(b.id)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
    return entries
  })

  return { navModules }
}
