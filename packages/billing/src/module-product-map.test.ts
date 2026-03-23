import { describe, it, expect } from 'vitest'
import {
  MODULE_TO_PRODUCT,
  CONDITION_TO_METER,
  METER_TO_CONDITION_KEYS,
  toMeterOverrides,
  valueFromConditionSetForMeter,
  numberFromConditionSetForMeter,
  tenantMeterLimitKeyForModule,
} from './module-product-map.js'

describe('MODULE_TO_PRODUCT', () => {
  it('maps modules to products', () => {
    expect(MODULE_TO_PRODUCT.marketplace).toBe('marketplace')
    expect(MODULE_TO_PRODUCT.watchtower).toBe('watchtower')
    expect(MODULE_TO_PRODUCT.admin).toBe('admin')
    expect(MODULE_TO_PRODUCT.slug).toBe('admin')
  })
})

describe('CONDITION_TO_METER', () => {
  it('maps condition keys to meter keys', () => {
    expect(CONDITION_TO_METER.mintsCount).toBe('mints_count')
    expect(CONDITION_TO_METER.listsCount).toBe('gate_lists')
    expect(CONDITION_TO_METER.tokensCount).toBe('crafter_tokens')
    expect(CONDITION_TO_METER.raffleSlotsUsed).toBe('raffle_slots')
  })
})

describe('toMeterOverrides', () => {
  it('returns undefined for empty/missing conditions', () => {
    expect(toMeterOverrides(undefined)).toBeUndefined()
    expect(toMeterOverrides({})).toBeUndefined()
  })

  it('maps condition keys to meter keys', () => {
    const result = toMeterOverrides({ mintsCount: 5, listsCount: 2 })
    expect(result).toEqual({ mints_count: 5, gate_lists: 2 })
  })

  it('converts booleans to 0/1', () => {
    const result = toMeterOverrides({ mintsCount: true as unknown as number })
    expect(result).toEqual({ mints_count: 1 })
  })

  it('passes through unknown keys unchanged', () => {
    const result = toMeterOverrides({ custom_meter: 10 })
    expect(result).toEqual({ custom_meter: 10 })
  })
})

describe('valueFromConditionSetForMeter', () => {
  it('reads meter key directly', () => {
    expect(valueFromConditionSetForMeter({ raffle_slots: 3 }, 'raffle_slots')).toBe(3)
  })

  it('resolves condition aliases from CONDITION_TO_METER', () => {
    expect(valueFromConditionSetForMeter({ raffleSlotsUsed: 5 }, 'raffle_slots')).toBe(5)
    expect(valueFromConditionSetForMeter({ listsCount: 2 }, 'gate_lists')).toBe(2)
  })

  it('prefers canonical meter key over alias when both present', () => {
    expect(
      valueFromConditionSetForMeter({ raffle_slots: 1, raffleSlotsUsed: 9 }, 'raffle_slots'),
    ).toBe(1)
  })
})

describe('numberFromConditionSetForMeter', () => {
  it('returns null for missing or non-number', () => {
    expect(numberFromConditionSetForMeter({}, 'raffle_slots')).toBeNull()
    expect(numberFromConditionSetForMeter({ raffle_slots: true as unknown as number }, 'raffle_slots')).toBeNull()
  })

  it('reads via alias', () => {
    expect(numberFromConditionSetForMeter({ raffleSlotsUsed: 4 }, 'raffle_slots')).toBe(4)
  })
})

describe('tenantMeterLimitKeyForModule', () => {
  it('maps known modules', () => {
    expect(tenantMeterLimitKeyForModule('raffles')).toBe('raffle_slots')
    expect(tenantMeterLimitKeyForModule('gates')).toBe('gate_lists')
  })

  it('falls back to module id', () => {
    expect(tenantMeterLimitKeyForModule('shipment')).toBe('shipment')
  })
})

describe('METER_TO_CONDITION_KEYS', () => {
  it('includes raffleSlotsUsed for raffle_slots', () => {
    expect(METER_TO_CONDITION_KEYS.raffle_slots).toContain('raffleSlotsUsed')
  })
})
