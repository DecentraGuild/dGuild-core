import { describe, it, expect } from 'vitest'
import { BASE_CURRENCY_MINTS, BASE_CURRENCY_MINT_ADDRESSES, isBaseCurrencyMint } from './currencies.js'

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
