import { describe, it, expect } from 'vitest'
import { TENANT_DOMAIN, getTenantSlugFromHost } from './resolver.js'

describe('TENANT_DOMAIN', () => {
  it('is .dguild.org', () => {
    expect(TENANT_DOMAIN).toBe('.dguild.org')
  })
})

describe('getTenantSlugFromHost', () => {
  it('returns null for empty host', () => {
    expect(getTenantSlugFromHost('')).toBe(null)
  })

  it('returns null for localhost', () => {
    expect(getTenantSlugFromHost('localhost')).toBe(null)
    expect(getTenantSlugFromHost('localhost:3002')).toBe(null)
    expect(getTenantSlugFromHost('127.0.0.1')).toBe(null)
  })

  it('returns null for www.dguild.org', () => {
    expect(getTenantSlugFromHost('www.dguild.org')).toBe(null)
  })

  it('returns null for api.dguild.org', () => {
    expect(getTenantSlugFromHost('api.dguild.org')).toBe(null)
  })

  it('returns null for bare dguild.org', () => {
    expect(getTenantSlugFromHost('dguild.org')).toBe(null)
  })

  it('extracts subdomain slug from host', () => {
    expect(getTenantSlugFromHost('skull.dguild.org')).toBe('skull')
    expect(getTenantSlugFromHost('dapp.dguild.org')).toBe('dapp')
  })

  it('is case-insensitive', () => {
    expect(getTenantSlugFromHost('Skull.DGuild.Org')).toBe('skull')
  })

  it('prefers ?tenant= query param over host', () => {
    const params = new URLSearchParams('tenant=myorg')
    expect(getTenantSlugFromHost('skull.dguild.org', params)).toBe('myorg')
  })

  it('ignores empty ?tenant= param', () => {
    const params = new URLSearchParams('tenant=')
    expect(getTenantSlugFromHost('skull.dguild.org', params)).toBe('skull')
  })

  it('returns ?tenant= on localhost', () => {
    const params = new URLSearchParams('tenant=myorg')
    expect(getTenantSlugFromHost('localhost', params)).toBe('myorg')
  })

  it('returns null for unrelated domains', () => {
    expect(getTenantSlugFromHost('example.com')).toBe(null)
  })
})
