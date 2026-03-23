import { describe, it, expect } from 'vitest'
import { usageMeterLabel, USAGE_DISPLAY_SKIP_METERS } from './pricing-usage-display.js'

describe('usageMeterLabel', () => {
  it('returns known label for meter keys', () => {
    expect(usageMeterLabel('raffle_slots')).toBe('Raffle slots')
    expect(usageMeterLabel('mints_count')).toBe('Tradable mints in scope')
  })

  it('falls back to key', () => {
    expect(usageMeterLabel('unknown_meter')).toBe('unknown_meter')
  })
})

describe('USAGE_DISPLAY_SKIP_METERS', () => {
  it('skips base_currencies_count', () => {
    expect(USAGE_DISPLAY_SKIP_METERS.has('base_currencies_count')).toBe(true)
  })
})
