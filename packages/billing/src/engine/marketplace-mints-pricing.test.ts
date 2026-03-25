import { describe, it, expect } from 'vitest'
import { marketplaceMintsRecurringUsd } from './marketplace-mints-pricing.js'
import type { TierRow } from './marketplace-mints-pricing.js'

const SEED_TIERS: TierRow[] = [
  { min_quantity: 1, max_quantity: 10, unit_price: 0, tier_price: null, label: 'BASE' },
  { min_quantity: 11, max_quantity: 100, unit_price: 0, tier_price: 19, label: 'GROW' },
  { min_quantity: 101, max_quantity: 250, unit_price: 0, tier_price: 29, label: 'PRO' },
  { min_quantity: 251, max_quantity: null, unit_price: 0.1, tier_price: null, label: 'Overage' },
]

describe('marketplaceMintsRecurringUsd', () => {
  it('BASE 1–10 is free', () => {
    expect(marketplaceMintsRecurringUsd(SEED_TIERS, 5, 1)).toBe(0)
    expect(marketplaceMintsRecurringUsd(SEED_TIERS, 10, 1)).toBe(0)
  })

  it('GROW flat 19', () => {
    expect(marketplaceMintsRecurringUsd(SEED_TIERS, 11, 1)).toBe(19)
    expect(marketplaceMintsRecurringUsd(SEED_TIERS, 100, 1)).toBe(19)
  })

  it('PRO flat 29', () => {
    expect(marketplaceMintsRecurringUsd(SEED_TIERS, 101, 1)).toBe(29)
    expect(marketplaceMintsRecurringUsd(SEED_TIERS, 250, 1)).toBe(29)
  })

  it('Over 250: PRO + 0.10 per mint over 250', () => {
    expect(marketplaceMintsRecurringUsd(SEED_TIERS, 251, 1)).toBeCloseTo(29.1, 5)
    expect(marketplaceMintsRecurringUsd(SEED_TIERS, 300, 1)).toBeCloseTo(29 + 5, 5)
  })
})
