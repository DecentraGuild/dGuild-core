/**
 * Unit tests for the billing pricing engine (computePrice from @decentraguild/billing).
 * Ensures pricing models produce expected results.
 */

import { describe, it, expect } from 'vitest'
import { computePrice } from '@decentraguild/billing'

describe('computePrice', () => {
  it('add_unit: returns one-time amount and billable true when pricePerUnit > 0', () => {
    const result = computePrice(
      'whitelist',
      {},
      { modelType: 'add_unit', name: 'Whitelist', pricePerUnit: 25 },
      { billingPeriod: 'monthly' }
    )
    expect(result.billable).toBe(true)
    expect(result.oneTimeTotal).toBe(25)
    expect(result.recurringMonthly).toBe(0)
    expect(result.recurringYearly).toBe(0)
    expect(result.components).toHaveLength(1)
    expect(result.components[0].type).toBe('one-time')
    expect(result.components[0].amount).toBe(25)
  })

  it('add_unit: returns billable false when pricePerUnit is 0', () => {
    const result = computePrice(
      'whitelist',
      {},
      { modelType: 'add_unit', name: 'Whitelist', pricePerUnit: 0 },
      { billingPeriod: 'monthly' }
    )
    expect(result.billable).toBe(false)
    expect(result.oneTimeTotal).toBe(0)
    expect(result.components).toHaveLength(0)
  })

  it('returns empty result when pricing model is null', () => {
    const result = computePrice('marketplace', {}, null, { billingPeriod: 'monthly' })
    expect(result.billable).toBe(false)
    expect(result.oneTimeTotal).toBe(0)
    expect(result.recurringMonthly).toBe(0)
    expect(result.recurringYearly).toBe(0)
    expect(result.moduleId).toBe('marketplace')
  })

  it('flat_recurring: applies yearly discount when billingPeriod is yearly', () => {
    const result = computePrice(
      'slug',
      {},
      {
        modelType: 'flat_recurring',
        name: 'Custom slug',
        recurringPrice: 100,
        yearlyDiscountPercent: 20,
      },
      { billingPeriod: 'yearly' }
    )
    expect(result.billable).toBe(true)
    expect(result.recurringMonthly).toBeCloseTo((100 * 12 * 0.8) / 12, 5)
    expect(result.recurringYearly).toBeCloseTo(100 * 12 * 0.8, 5)
    expect(result.appliedYearlyDiscount).toBe(20)
  })
})
