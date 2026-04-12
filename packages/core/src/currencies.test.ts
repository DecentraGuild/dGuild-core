import { describe, it, expect } from 'vitest'
import {
  BASE_CURRENCY_MINTS,
  BASE_CURRENCY_MINT_ADDRESSES,
  getBaseCurrencyDecimals,
  isBaseCurrencyMint,
} from './currencies.js'

describe('BASE_CURRENCY_MINTS', () => {
  it('contains SOL, WBTC, USDC, USDT', () => {
    const symbols = BASE_CURRENCY_MINTS.map((c) => c.symbol)
    expect(symbols).toContain('SOL')
    expect(symbols).toContain('WBTC')
    expect(symbols).toContain('USDC')
    expect(symbols).toContain('USDT')
  })

  it('has 4 entries', () => {
    expect(BASE_CURRENCY_MINTS).toHaveLength(4)
  })

  it('includes decimals for each entry', () => {
    for (const c of BASE_CURRENCY_MINTS) {
      expect(typeof c.decimals).toBe('number')
      expect(c.decimals).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('BASE_CURRENCY_MINT_ADDRESSES', () => {
  it('is a Set of 4 addresses', () => {
    expect(BASE_CURRENCY_MINT_ADDRESSES.size).toBe(4)
  })
})

describe('isBaseCurrencyMint', () => {
  it('returns true for known base currency mints', () => {
    expect(isBaseCurrencyMint('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(true)
    expect(isBaseCurrencyMint('So11111111111111111111111111111111111111112')).toBe(true)
  })

  it('returns false for unknown mints', () => {
    expect(isBaseCurrencyMint('RandomMintAddress123')).toBe(false)
    expect(isBaseCurrencyMint('')).toBe(false)
  })
})

describe('getBaseCurrencyDecimals', () => {
  it('returns chain decimals for each base mint', () => {
    expect(getBaseCurrencyDecimals('So11111111111111111111111111111111111111112')).toBe(9)
    expect(getBaseCurrencyDecimals('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(6)
    expect(getBaseCurrencyDecimals('unknown')).toBeUndefined()
  })
})
