/**
 * Admin Gating tab: read/write gate settings for each scope (default, marketplace, raffles, watchtower).
 * Each scope has its own save path; values come from tenant_config, marketplace_settings, raffle_settings.
 * Marketplace, raffles, and watchtower use local state so unsaved changes are not overwritten by refetches.
 */

import type { Ref } from 'vue'
import type { MarketplaceGateSettings } from '@decentraguild/core'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantStore } from '~/stores/tenant'
import type { GatingScopeId } from '@decentraguild/config'

export type GateFormValue = MarketplaceGateSettings | null | 'use-default' | 'admin-only'

export interface GatingRowState {
  value: GateFormValue
  dirty: boolean
  saving: boolean
  saveSuccess: boolean
  saveError: string | null
}

function toCompareStr(v: GateFormValue): string {
  if (v === 'use-default') return '__use_default__'
  if (v === 'admin-only') return '__admin_only__'
  if (v && typeof v === 'object' && v.account) return v.account
  return ''
}

export function useAdminGating(formDefaultGate: Ref<MarketplaceGateSettings | null>) {
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId ?? null)
  const tenant = computed(() => tenantStore.tenant)
  const marketplaceSettings = computed(() => tenantStore.marketplaceSettings)
  const raffleSettings = computed(() => tenantStore.raffleSettings)

  const initialStrs = reactive<Record<GatingScopeId, string | null>>({
    default: null,
    gates: null,
    marketplace: null,
    raffles: null,
    watchtower: null,
  })

  /** Local state: undefined = no override (use store), null = Public, 'use-default' = inherit, etc. */
  const localValues = reactive<Record<GatingScopeId, GateFormValue | undefined>>({
    default: undefined,
    gates: undefined,
    marketplace: undefined,
    raffles: undefined,
    watchtower: undefined,
  })

  const rowState = reactive<Record<GatingScopeId, GatingRowState>>({
    default: { value: null, dirty: false, saving: false, saveSuccess: false, saveError: null },
    gates: { value: null, dirty: false, saving: false, saveSuccess: false, saveError: null },
    marketplace: { value: null, dirty: false, saving: false, saveSuccess: false, saveError: null },
    raffles: { value: null, dirty: false, saving: false, saveSuccess: false, saveError: null },
    watchtower: { value: null, dirty: false, saving: false, saveSuccess: false, saveError: null },
  })

  const defaultValue = computed((): GateFormValue => {
    const v = formDefaultGate?.value
    if (v === 'admin-only') return 'admin-only'
    return v ?? null
  })
  const marketplaceValue = computed((): GateFormValue => {
    const g = marketplaceSettings.value?.gate ?? (marketplaceSettings.value as { whitelist?: unknown })?.whitelist
    if (g === undefined) return 'use-default'
    if (g === null || g === 'public') return null
    if (typeof g === 'string' && g === 'use-default') return 'use-default'
    if (typeof g === 'string' && g === 'admin-only') return 'admin-only'
    if (typeof g === 'object' && (g as { account?: string }).account) return g as MarketplaceGateSettings
    return null
  })
  const raffleValue = computed((): GateFormValue => {
    const g = raffleSettings.value?.defaultGate
    if (g === undefined) return 'use-default'
    if (g === null || g === 'public') return null
    if (g === 'use-default') return 'use-default'
    if (g === 'admin-only') return 'admin-only'
    if (typeof g === 'object' && (g as { account?: string }).account) return g as MarketplaceGateSettings
    return null
  })
  const gatesValue = computed((): GateFormValue => {
    const sj = tenant.value?.modules?.gates?.settingsjson as Record<string, unknown> | undefined
    const v = sj?.gate
    if (v === undefined) return 'use-default'
    if (v === null || v === 'public') return null
    if (typeof v === 'string' && v === 'admin-only') return 'admin-only'
    if (typeof v === 'object' && (v as { account?: string }).account) return v as MarketplaceGateSettings
    return null
  })

  const watchtowerValue = computed((): GateFormValue => {
    const sj = tenant.value?.modules?.watchtower?.settingsjson as Record<string, unknown> | undefined
    const v = sj?.gate
    if (v === undefined) return 'use-default'
    if (v === null || v === 'public') return null
    if (typeof v === 'string' && v === 'admin-only') return 'admin-only'
    if (typeof v === 'object' && (v as { account?: string }).account) return v as MarketplaceGateSettings
    return null
  })

  function getValue(scopeId: GatingScopeId): GateFormValue {
    const local = localValues[scopeId]
    if (local !== undefined) return local
    switch (scopeId) {
      case 'default':
        return defaultValue.value
      case 'gates':
        return gatesValue.value
      case 'marketplace':
        return marketplaceValue.value
      case 'raffles':
        return raffleValue.value
      case 'watchtower':
        return watchtowerValue.value
      default:
        return null
    }
  }

  function initStrs() {
    initialStrs.default = toCompareStr(defaultValue.value)
    initialStrs.gates = toCompareStr(gatesValue.value)
    initialStrs.marketplace = toCompareStr(marketplaceValue.value)
    initialStrs.raffles = toCompareStr(raffleValue.value)
    initialStrs.watchtower = toCompareStr(watchtowerValue.value)
  }

  watch(tenantId, (id) => {
    if (id) {
      localValues.gates = undefined
      localValues.marketplace = undefined
      localValues.raffles = undefined
      localValues.watchtower = undefined
      initStrs()
    }
  }, { immediate: true })

  watch([marketplaceSettings, raffleSettings, () => tenant.value?.modules?.gates, () => tenant.value?.modules?.watchtower], () => {
    if (tenantId.value && localValues.gates === undefined && localValues.marketplace === undefined && localValues.raffles === undefined && localValues.watchtower === undefined) {
      initStrs()
    }
  })

  const dirty = computed(() => ({
    default: toCompareStr(defaultValue.value) !== (initialStrs.default ?? ''),
    gates: toCompareStr(getValue('gates')) !== (initialStrs.gates ?? ''),
    marketplace: toCompareStr(getValue('marketplace')) !== (initialStrs.marketplace ?? ''),
    raffles: toCompareStr(getValue('raffles')) !== (initialStrs.raffles ?? ''),
    watchtower: toCompareStr(getValue('watchtower')) !== (initialStrs.watchtower ?? ''),
  }))

  function onUpdate(scopeId: GatingScopeId, value: GateFormValue) {
    const id = tenantId.value
    const t = tenant.value
    if (!id || !t) return

    const resolved = value === 'use-default' ? undefined : (value ?? null)
    if (scopeId === 'gates' || scopeId === 'marketplace' || scopeId === 'raffles' || scopeId === 'watchtower') {
      localValues[scopeId] = value
    }

    switch (scopeId) {
      case 'default':
        if (formDefaultGate) formDefaultGate.value = value === 'use-default' ? null : (value === 'admin-only' ? 'admin-only' : value)
        break
      case 'gates':
        // Only update localValues; persist on Save
        break
      case 'marketplace': {
        const base = marketplaceSettings.value ?? {
          collectionMints: [],
          splAssetMints: [],
          currencyMints: [],
          shopFee: { wallet: '', makerFlatFee: 0, takerFlatFee: 0, makerPercentFee: 0, takerPercentFee: 0 },
        }
        tenantStore.setMarketplaceSettings({ ...base, gate: resolved })
        break
      }
      case 'raffles':
        tenantStore.setRaffleSettings({
          ...(raffleSettings.value ?? {}),
          defaultGate: value === 'use-default' ? 'use-default' : resolved,
        })
        break
      case 'watchtower': {
        const prev = t.modules ?? {}
        const wt = prev.watchtower ?? {}
        const sj = (wt.settingsjson ?? {}) as Record<string, unknown>
        tenantStore.setTenant({
          ...t,
          modules: {
            ...prev,
            watchtower: { ...wt, settingsjson: { ...sj, gate: resolved } },
          },
        })
        break
      }
    }
  }

  async function save(scopeId: GatingScopeId): Promise<boolean> {
    const id = tenantId.value
    if (!id) return false

    rowState[scopeId].saving = true
    rowState[scopeId].saveError = null
    rowState[scopeId].saveSuccess = false

    const value = getValue(scopeId)
    const gateVal = value === 'use-default' ? undefined : (value ?? null)

    try {
      const supabase = useSupabase()

      switch (scopeId) {
        case 'default': {
          if (formDefaultGate) formDefaultGate.value = value === 'use-default' ? null : (value === 'admin-only' ? 'admin-only' : value)
          const { error } = await supabase
            .from('tenant_config')
            .update({ default_gate: gateVal, updated_at: new Date().toISOString() })
            .eq('id', id)
          if (error) throw new Error(error.message)
          const updated = tenant.value
          if (updated) {
            tenantStore.setTenant({ ...updated, defaultGate: gateVal === 'admin-only' ? 'admin-only' : (gateVal ?? undefined) })
          }
          break
        }
        case 'marketplace': {
          const current = marketplaceSettings.value ?? {
            collectionMints: [],
            splAssetMints: [],
            currencyMints: [],
            shopFee: { wallet: '', makerFlatFee: 0, takerFlatFee: 0, makerPercentFee: 0, takerPercentFee: 0 },
          }
          const gateToStore = value === 'use-default' ? undefined : (value === null ? 'public' : value)
          const newSettings = { ...current, gate: gateToStore }
          const { error } = await supabase
            .from('marketplace_settings')
            .upsert({ tenant_id: id, settings: newSettings, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })
          if (error) throw new Error(error.message)
          tenantStore.setMarketplaceSettings(newSettings)
          break
        }
        case 'raffles': {
          const defaultGateToStore = value === 'use-default' ? 'use-default' : (value === null ? 'public' : value)
          const settings = { defaultGate: defaultGateToStore }
          const { error } = await supabase
            .from('raffle_settings')
            .upsert({ tenant_id: id, settings, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })
          if (error) throw new Error(error.message)
          tenantStore.setRaffleSettings(settings)
          break
        }
        case 'gates': {
          const prev = tenant.value?.modules ?? {}
          const gt = prev.gates ?? {}
          const sj = (gt.settingsjson ?? {}) as Record<string, unknown>
          const gateToStore = value === 'use-default' ? undefined : (value === null ? 'public' : value)
          const modules = {
            ...prev,
            gates: { ...gt, settingsjson: { ...sj, gate: gateToStore } },
          }
          const { error } = await supabase
            .from('tenant_config')
            .update({ modules, updated_at: new Date().toISOString() })
            .eq('id', id)
          if (error) throw new Error(error.message)
          const updated = tenant.value
          if (updated) {
            tenantStore.setTenant({ ...updated, modules })
          }
          break
        }
        case 'watchtower': {
          const prev = tenant.value?.modules ?? {}
          const wt = prev.watchtower ?? {}
          const sj = (wt.settingsjson ?? {}) as Record<string, unknown>
          const gateToStore = value === 'use-default' ? undefined : (value === null ? 'public' : value)
          const modules = {
            ...prev,
            watchtower: { ...wt, settingsjson: { ...sj, gate: gateToStore } },
          }
          const { error } = await supabase
            .from('tenant_config')
            .update({ modules, updated_at: new Date().toISOString() })
            .eq('id', id)
          if (error) throw new Error(error.message)
          const updated = tenant.value
          if (updated) {
            tenantStore.setTenant({ ...updated, modules })
          }
          break
        }
      }

      initialStrs[scopeId] = toCompareStr(value)
      if (scopeId === 'gates' || scopeId === 'marketplace' || scopeId === 'raffles' || scopeId === 'watchtower') {
        localValues[scopeId] = undefined
      }
      rowState[scopeId].saveSuccess = true
      setTimeout(() => { rowState[scopeId].saveSuccess = false }, 2000)
      return true
    } catch (e) {
      rowState[scopeId].saveError = e instanceof Error ? e.message : 'Failed to save'
      return false
    } finally {
      rowState[scopeId].saving = false
    }
  }

  return {
    slug: computed(() => tenantStore.slug ?? null),
    getValue,
    dirty,
    rowState,
    onUpdate,
    save,
  }
}
