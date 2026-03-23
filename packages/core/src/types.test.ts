import { describe, it, expect } from 'vitest'
import {
  normalizeModules,
  isModuleVisibleToMembers,
  isModuleVisibleInAdmin,
  getModuleState,
  getEffectiveGate,
  getModuleGateFromTenant,
  resolveGateForTransaction,
  type TenantModulesMap,
  type MarketplaceGateSettings,
} from './types.js'

describe('normalizeModules', () => {
  it('returns empty for null/undefined', () => {
    expect(normalizeModules(null)).toEqual({})
    expect(normalizeModules(undefined)).toEqual({})
  })

  it('normalizes legacy array format', () => {
    const raw = [
      { id: 'admin', enabled: true },
      { id: 'marketplace', enabled: false },
    ]
    const result = normalizeModules(raw)
    expect(result.admin.state).toBe('active')
    expect(result.marketplace.state).toBe('off')
  })

  it('normalizes object format with states', () => {
    const raw: TenantModulesMap = {
      admin: { state: 'active' },
      marketplace: { state: 'staging' },
    }
    const result = normalizeModules(raw)
    expect(result.admin.state).toBe('active')
    expect(result.marketplace.state).toBe('staging')
  })

  it('defaults unknown states to off', () => {
    const raw = { admin: { state: 'bogus' as 'off' } }
    const result = normalizeModules(raw)
    expect(result.admin.state).toBe('off')
  })

  it('handles legacy active boolean', () => {
    const raw = { admin: { active: true } } as unknown as TenantModulesMap
    const result = normalizeModules(raw)
    expect(result.admin.state).toBe('active')
  })

  it('preserves deactivatedate and deactivatingUntil', () => {
    const raw: TenantModulesMap = {
      admin: { state: 'deactivating', deactivatedate: '2026-04-01', deactivatingUntil: '2026-05-01' },
    }
    const result = normalizeModules(raw)
    expect(result.admin.deactivatedate).toBe('2026-04-01')
    expect(result.admin.deactivatingUntil).toBe('2026-05-01')
  })
})

describe('isModuleVisibleToMembers', () => {
  it('returns true for active and deactivating', () => {
    expect(isModuleVisibleToMembers('active')).toBe(true)
    expect(isModuleVisibleToMembers('deactivating')).toBe(true)
  })

  it('returns false for off and staging', () => {
    expect(isModuleVisibleToMembers('off')).toBe(false)
    expect(isModuleVisibleToMembers('staging')).toBe(false)
  })
})

describe('isModuleVisibleInAdmin', () => {
  it('returns true for staging, active, deactivating', () => {
    expect(isModuleVisibleInAdmin('staging')).toBe(true)
    expect(isModuleVisibleInAdmin('active')).toBe(true)
    expect(isModuleVisibleInAdmin('deactivating')).toBe(true)
  })

  it('returns false for off', () => {
    expect(isModuleVisibleInAdmin('off')).toBe(false)
  })
})

describe('getModuleState', () => {
  it('returns state from entry', () => {
    expect(getModuleState({ state: 'active' })).toBe('active')
    expect(getModuleState({ state: 'staging' })).toBe('staging')
  })

  it('returns off for undefined entry', () => {
    expect(getModuleState(undefined)).toBe('off')
  })

  it('returns off for invalid state', () => {
    expect(getModuleState({ state: 'bogus' as 'off' })).toBe('off')
  })
})

describe('getEffectiveGate', () => {
  const list: MarketplaceGateSettings = { programId: 'P1', account: 'A1' }

  it('returns admin-only when module gate is admin-only', () => {
    expect(getEffectiveGate(null, 'admin-only')).toBe('admin-only')
  })

  it('returns null (public) when module gate is null or public', () => {
    expect(getEffectiveGate(list, null)).toBe(null)
    expect(getEffectiveGate(list, 'public')).toBe(null)
  })

  it('returns module gate object when specified', () => {
    expect(getEffectiveGate(null, list)).toEqual(list)
  })

  it('falls back to tenant default when module gate is undefined', () => {
    expect(getEffectiveGate(list, undefined)).toEqual(list)
    expect(getEffectiveGate('admin-only', undefined)).toBe('admin-only')
    expect(getEffectiveGate(null, undefined)).toBe(null)
  })

  it('returns null for empty account in module gate', () => {
    const empty = { programId: 'P1', account: '' }
    expect(getEffectiveGate(null, empty)).toBe(null)
  })
})

describe('getModuleGateFromTenant', () => {
  it('returns undefined when tenant has no modules', () => {
    expect(getModuleGateFromTenant(null, 'gates')).toBeUndefined()
    expect(getModuleGateFromTenant({ modules: {} }, 'gates')).toBeUndefined()
  })

  it('returns gate from settingsjson for gates module', () => {
    const tenant = {
      modules: {
        gates: { state: 'active' as const, settingsjson: { gate: 'admin-only' } },
      },
    }
    expect(getModuleGateFromTenant(tenant, 'gates')).toBe('admin-only')
  })

  it('returns gate object from marketplace', () => {
    const list: MarketplaceGateSettings = { programId: 'P1', account: 'A1' }
    const tenant = {
      modules: {
        marketplace: { state: 'active' as const, settingsjson: { gate: list } },
      },
    }
    expect(getModuleGateFromTenant(tenant, 'marketplace')).toEqual(list)
  })

  it('returns defaultGate from raffles', () => {
    const tenant = {
      modules: {
        raffles: { state: 'active' as const, settingsjson: { defaultGate: 'admin-only' } },
      },
    }
    expect(getModuleGateFromTenant(tenant, 'raffles')).toBe('admin-only')
  })
})

describe('resolveGateForTransaction', () => {
  const list: MarketplaceGateSettings = { programId: 'P1', account: 'A1' }

  it('returns effective gate when it has a valid account', () => {
    expect(resolveGateForTransaction(list, 'use-default')).toEqual(list)
  })

  it('returns null for public effective gate', () => {
    expect(resolveGateForTransaction(null, 'use-default')).toBe(null)
  })

  it('returns form override when specified', () => {
    const override: MarketplaceGateSettings = { programId: 'P2', account: 'A2' }
    expect(resolveGateForTransaction(null, override)).toEqual(override)
  })

  it('returns null for null form override', () => {
    expect(resolveGateForTransaction(null, null)).toBe(null)
  })
})
