import { describe, expect, it } from 'vitest'
import {
  INTERNAL_DEV_TENANT_ID,
  isInternalDevTenant,
  canActivateModule,
  isModulePubliclyVisible,
  isModuleInPublicDocs,
} from './module-catalog-types.js'

describe('INTERNAL_DEV_TENANT_ID', () => {
  it('is 0000000', () => {
    expect(INTERNAL_DEV_TENANT_ID).toBe('0000000')
  })
})

describe('isInternalDevTenant', () => {
  it('returns true only for the internal id', () => {
    expect(isInternalDevTenant('0000000')).toBe(true)
    expect(isInternalDevTenant('some-other-tenant')).toBe(false)
    expect(isInternalDevTenant('')).toBe(false)
  })
})

describe('canActivateModule', () => {
  const internal = INTERNAL_DEV_TENANT_ID
  const external = 'some-tenant'

  it('available: anyone may activate', () => {
    expect(canActivateModule('available', external)).toBe(true)
    expect(canActivateModule('available', internal)).toBe(true)
  })

  it('coming_soon: nobody may activate (flip to available to ship)', () => {
    expect(canActivateModule('coming_soon', external)).toBe(false)
    expect(canActivateModule('coming_soon', internal)).toBe(false)
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
