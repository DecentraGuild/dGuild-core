import { afterEach, describe, expect, it } from 'vitest'
import {
  INTERNAL_DEV_TENANT_ID,
  isInternalDevTenant,
  canActivateModule,
  isModuleNavigable,
  isModulePubliclyVisible,
  isModuleInPublicDocs,
  parseInternalDevTenantIds,
  resolveInternalDevTenantIdsFromEnv,
  setInternalDevTenantIds,
} from './module-catalog-types.js'

describe('INTERNAL_DEV_TENANT_ID', () => {
  it('is 0000000', () => {
    expect(INTERNAL_DEV_TENANT_ID).toBe('0000000')
  })
})

describe('isInternalDevTenant', () => {
  afterEach(() => {
    setInternalDevTenantIds(null)
  })

  it('returns true only for the internal id by default', () => {
    expect(isInternalDevTenant('0000000')).toBe(true)
    expect(isInternalDevTenant('some-other-tenant')).toBe(false)
    expect(isInternalDevTenant('')).toBe(false)
  })

  it('includes ids from setInternalDevTenantIds', () => {
    setInternalDevTenantIds(['alpha', 'beta'])
    expect(isInternalDevTenant('alpha')).toBe(true)
    expect(isInternalDevTenant('beta')).toBe(true)
    expect(isInternalDevTenant('0000000')).toBe(false)
  })
})

describe('parseInternalDevTenantIds / resolveInternalDevTenantIdsFromEnv', () => {
  it('parses comma-separated ids', () => {
    expect(parseInternalDevTenantIds('a, b ,c')).toEqual(['a', 'b', 'c'])
  })

  it('merges env list with default ids', () => {
    expect(resolveInternalDevTenantIdsFromEnv('x,y')).toEqual(['0000000', 'x', 'y'])
    expect(resolveInternalDevTenantIdsFromEnv(undefined)).toEqual(['0000000'])
  })
})

describe('isModuleNavigable', () => {
  it('includes coming_soon so tenant nav can list modules before GA', () => {
    expect(isModuleNavigable('coming_soon')).toBe(true)
    expect(isModuleNavigable('off')).toBe(false)
  })
})

describe('canActivateModule', () => {
  const internal = INTERNAL_DEV_TENANT_ID
  const external = 'some-tenant'

  it('available: anyone may activate', () => {
    expect(canActivateModule('available', external)).toBe(true)
    expect(canActivateModule('available', internal)).toBe(true)
  })

  it('coming_soon: only internal dev tenants may activate', () => {
    expect(canActivateModule('coming_soon', external)).toBe(false)
    expect(canActivateModule('coming_soon', internal)).toBe(true)
  })

  it('development: only internal tenant may activate', () => {
    expect(canActivateModule('development', internal)).toBe(true)
    expect(canActivateModule('development', external)).toBe(false)
  })

  it('deprecated: no new activations', () => {
    expect(canActivateModule('deprecated', external)).toBe(false)
    expect(canActivateModule('deprecated', internal)).toBe(false)
  })

  it('off: nobody may activate', () => {
    expect(canActivateModule('off', external)).toBe(false)
    expect(canActivateModule('off', internal)).toBe(false)
  })
})

describe('isModulePubliclyVisible', () => {
  it('hides development and off', () => {
    expect(isModulePubliclyVisible('development')).toBe(false)
    expect(isModulePubliclyVisible('off')).toBe(false)
  })

  it('shows available, coming_soon, deprecated', () => {
    expect(isModulePubliclyVisible('available')).toBe(true)
    expect(isModulePubliclyVisible('coming_soon')).toBe(true)
    expect(isModulePubliclyVisible('deprecated')).toBe(true)
  })
})

describe('isModuleInPublicDocs', () => {
  it('hides development and off from docs IA', () => {
    expect(isModuleInPublicDocs('development')).toBe(false)
    expect(isModuleInPublicDocs('off')).toBe(false)
  })

  it('keeps available, coming_soon, deprecated in docs IA', () => {
    expect(isModuleInPublicDocs('available')).toBe(true)
    expect(isModuleInPublicDocs('coming_soon')).toBe(true)
    expect(isModuleInPublicDocs('deprecated')).toBe(true)
  })
})
