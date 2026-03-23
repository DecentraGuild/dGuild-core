import { describe, it, expect } from 'vitest'
import { getProductDisplayType, getProductUnitLabel } from './product-display.js'

describe('getProductDisplayType', () => {
  it('returns correct types for known products', () => {
    expect(getProductDisplayType('gates')).toBe('one_time_per_unit')
    expect(getProductDisplayType('crafter')).toBe('one_time_per_unit')
    expect(getProductDisplayType('raffles')).toBe('tiered_with_one_time')
    expect(getProductDisplayType('marketplace')).toBe('recurring')
    expect(getProductDisplayType('watchtower')).toBe('recurring')
    expect(getProductDisplayType('admin')).toBe('recurring')
    expect(getProductDisplayType('shipment')).toBe('recurring')
  })

  it('defaults to recurring for unknown products', () => {
    expect(getProductDisplayType('unknown')).toBe('recurring')
  })
})

describe('getProductUnitLabel', () => {
  it('returns correct labels for known products', () => {
    expect(getProductUnitLabel('gates')).toBe('Member list')
    expect(getProductUnitLabel('crafter')).toBe('Token')
    expect(getProductUnitLabel('raffles')).toBe('Raffle')
  })

  it('defaults to Unit for unknown products', () => {
    expect(getProductUnitLabel('marketplace')).toBe('Unit')
    expect(getProductUnitLabel('unknown')).toBe('Unit')
  })
})
