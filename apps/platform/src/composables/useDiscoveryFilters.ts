import type { Ref } from 'vue'
import type { TenantConfig, ModuleGateModuleId } from '@decentraguild/core'
import {
  getModuleState,
  isModuleVisibleToMembers,
  getEffectiveGate,
  getModuleGateFromTenant,
} from '@decentraguild/core'
import { getModuleCatalogList, getModuleDisplayName, isModuleNavigable } from '@decentraguild/config'

export interface ActiveModuleWithGate {
  name: string
  hasGate: boolean
}

export type AccessFilter = 'any' | 'public' | 'gates'

export function useDiscoveryFilters(tenants: Ref<TenantConfig[]>) {
  const searchQuery = ref('')
  const moduleFilter = ref<string | null>(null)
  const accessFilter = ref<AccessFilter>('any')

  const debouncedSearch = ref('')
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  watch(searchQuery, (q) => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debouncedSearch.value = q.trim().toLowerCase()
      debounceTimer = null
    }, 300)
  }, { immediate: true })

  function hasGates(tenant: TenantConfig): boolean {
    const account = tenant.defaultGate?.account?.trim()
    return Boolean(account)
  }

  function activeModuleIds(tenant: TenantConfig): string[] {
    if (!tenant.modules || typeof tenant.modules !== 'object') return []
    return Object.entries(tenant.modules)
      .filter(([, entry]) => isModuleVisibleToMembers(getModuleState(entry)))
      .map(([id]) => id)
  }

  /** Gate for a module: from getModuleGateFromTenant (marketplace/raffles) or module.settingsjson.gate. */
  function getModuleGate(
    tenant: TenantConfig,
    moduleId: string
  ): { programId: string; account: string } | null | undefined {
    if (moduleId === 'marketplace' || moduleId === 'raffles') {
      const fromCore = getModuleGateFromTenant(tenant, moduleId as ModuleGateModuleId)
      return fromCore
    }
    const entry = tenant.modules?.[moduleId]
    const sj = entry?.settingsjson as Record<string, unknown> | undefined
    if (!sj) return undefined
    const direct = sj.gate as { programId?: string; account?: string } | null | undefined
    if (!direct) return direct
    const defaultGate = tenant.defaultGate
    return {
      programId: direct.programId ?? defaultGate?.programId ?? '',
      account: direct.account ?? '',
    }
  }

  function activeModulesWithGate(tenant: TenantConfig): ActiveModuleWithGate[] {
    const ids = activeModuleIds(tenant)
    return ids.map((id) => {
      const moduleGate = getModuleGate(tenant, id)
      const defaultGate = tenant.defaultGate
      const effective = getEffectiveGate(defaultGate, moduleGate)
      return {
        name: getModuleDisplayName(id),
        hasGate: effective !== null,
      }
    })
  }

  const moduleFilterOptions = computed(() => {
    const list = getModuleCatalogList().filter((m) => isModuleNavigable(m.status))
    return list.map((m) => ({ value: m.id, label: m.name }))
  })

  const filteredTenants = computed(() => {
    const list = tenants.value
    const query = debouncedSearch.value
    const moduleId = moduleFilter.value
    const access = accessFilter.value

    return list.filter((t) => {
      if (query) {
        const name = (t.name ?? '').toLowerCase()
        const desc = (t.description ?? '').toLowerCase()
        if (!name.includes(query) && !desc.includes(query)) return false
      }
      if (moduleId) {
        const active = activeModuleIds(t)
        if (!active.includes(moduleId)) return false
      }
      if (access === 'public' && hasGates(t)) return false
      if (access === 'gates' && !hasGates(t)) return false
      return true
    })
  })

  return {
    searchQuery,
    moduleFilter,
    accessFilter,
    hasGates,
    activeModuleIds,
    activeModulesWithGate,
    getModuleDisplayName,
    moduleFilterOptions,
    filteredTenants,
  }
}
