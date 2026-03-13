/**
 * Composable for the effective gate of a module.
 * Uses tenant default + module gate setting to resolve the final list.
 * For marketplace/raffle, pass store refs since gate comes from dedicated tables.
 */

import type { Ref } from 'vue'
import { computed } from 'vue'
import { getEffectiveGate, getModuleGateFromTenant } from '@decentraguild/core'
import type { ModuleGateModuleId, MarketplaceGateSettings } from '@decentraguild/core'

type TenantWithGate = {
  modules?: unknown
  defaultGate?: MarketplaceGateSettings | null | 'admin-only'
} | null | undefined

type ModuleGateValue = MarketplaceGateSettings | null | 'use-default' | 'admin-only' | 'public'

export function useEffectiveGate(
  tenant: Ref<TenantWithGate>,
  moduleId: ModuleGateModuleId,
  opts?: {
    marketplaceSettings?: Ref<{ gate?: ModuleGateValue } | null>
    raffleSettings?: Ref<{ defaultGate?: ModuleGateValue } | null>
  }
) {
  return computed(() => {
    const t = tenant.value
    const defaultGate = t?.defaultGate ?? null
    let moduleGate: ModuleGateValue | undefined
    if (moduleId === 'marketplace' && opts?.marketplaceSettings?.value) {
      const g = opts.marketplaceSettings.value.gate
      moduleGate = g === undefined ? 'use-default' : g
    } else if (moduleId === 'raffles' && opts?.raffleSettings?.value) {
      const g = opts.raffleSettings.value.defaultGate
      moduleGate = g === undefined ? 'use-default' : g
    } else {
      moduleGate = getModuleGateFromTenant(t, moduleId)
    }
    return getEffectiveGate(defaultGate, moduleGate)
  })
}
