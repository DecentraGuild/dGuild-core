import { describe, it, expect } from 'vitest'
import {
  fromRawUnits,
  toRawUnits,
  sanitizeTokenLabel,
  truncateAddress,
  formatUsdc,
  formatBillingUsdc,
  formatBillingUsdcWhole,
  formatUiAmount,
  formatRawTokenAmount,
  formatDate,
  escrowPriceToHuman,
} from './index.js'

describe('fromRawUnits', () => {
  it('returns 0 for null/undefined/zero', () => {
    expect(fromRawUnits(null, 6)).toBe(0)
    expect(fromRawUnits(undefined, 6)).toBe(0)
    expect(fromRawUnits('0', 6)).toBe(0)
    expect(fromRawUnits(0, 6)).toBe(0)
  })

  it('handles NFT amounts (0 decimals)', () => {
    expect(fromRawUnits('5', 0)).toBe(5)
    expect(fromRawUnits('100', 0)).toBe(100)
    expect(fromRawUnits(42, 0)).toBe(42)
  })

  it('handles SPL token amounts (6 decimals)', () => {
    expect(fromRawUnits('1000000', 6)).toBe(1)
    expect(fromRawUnits('500000', 6)).toBe(0.5)
    expect(fromRawUnits('1234567', 6)).toBe(1.234567)
  })

  it('handles SPL token amounts (9 decimals)', () => {
    expect(fromRawUnits('1000000000', 9)).toBe(1)
    expect(fromRawUnits('500000000', 9)).toBe(0.5)
  })

  it('handles small amounts that need padding', () => {
    expect(fromRawUnits('1', 6)).toBe(0.000001)
    expect(fromRawUnits('10', 6)).toBe(0.00001)
  })

  it('handles BN-like objects with toString', () => {
    const bn = { toString: () => '2000000' }
    expect(fromRawUnits(bn, 6)).toBe(2)
  })
})

describe('toRawUnits', () => {
  it('returns "0" for zero/falsy', () => {
    expect(toRawUnits(0, 6)).toBe('0')
  })

  it('converts human amount to raw units', () => {
    expect(toRawUnits(1, 6)).toBe('1000000')
    expect(toRawUnits(0.5, 6)).toBe('0500000')
    expect(toRawUnits(1.5, 9)).toBe('1500000000')
  })

  it('handles NFT amounts (0 decimals)', () => {
    expect(toRawUnits(5, 0)).toBe('5')
  })
})

describe('sanitizeTokenLabel', () => {
  it('returns empty for null/undefined', () => {
    expect(sanitizeTokenLabel(null)).toBe('')
    expect(sanitizeTokenLabel(undefined)).toBe('')
  })

  it('strips replacement characters', () => {
    expect(sanitizeTokenLabel('Token\uFFFD')).toBe('Token')
  })

  it('strips zero-width characters', () => {
    expect(sanitizeTokenLabel('Token\u200B')).toBe('Token')
    expect(sanitizeTokenLabel('Token\uFEFF')).toBe('Token')
  })

  it('strips control characters', () => {
    expect(sanitizeTokenLabel('Token\u0000')).toBe('Token')
  })

  it('trims whitespace', () => {
    expect(sanitizeTokenLabel('  Token  ')).toBe('Token')
  })

  it('preserves normal strings', () => {
    expect(sanitizeTokenLabel('My Cool Token')).toBe('My Cool Token')
  })
})

describe('truncateAddress', () => {
  it('returns empty for null/undefined', () => {
    expect(truncateAddress(null)).toBe('')
    expect(truncateAddress(undefined)).toBe('')
  })

  it('returns short addresses as-is', () => {
    expect(truncateAddress('abc')).toBe('abc')
  })

  it('truncates with default 6+4', () => {
    const addr = 'So11111111111111111111111111111111111111112'
    expect(truncateAddress(addr)).toBe('So1111...1112')
  })

  it('supports custom start/end chars', () => {
    const addr = 'So11111111111111111111111111111111111111112'
    expect(truncateAddress(addr, 4, 4)).toBe('So11...1112')
  })
})

describe('formatUsdc', () => {
  it('formats USDC amounts', () => {
    expect(formatUsdc(1)).toBe('1')
    expect(formatUsdc(0)).toBe('0')
    expect(formatUsdc(1.5)).toBe('1.5')
    expect(formatUsdc(0.000001)).toBe('0.000001')
  })

  it('strips trailing zeros', () => {
    expect(formatUsdc(1.100000)).toBe('1.1')
  })
})

describe('formatBillingUsdc', () => {
  it('rounds to cents and avoids float dust', () => {
    expect(formatBillingUsdc(48.999996)).toBe('49')
    expect(formatBillingUsdc(50.709996)).toBe('50.71')
    expect(formatBillingUsdc(4.225833)).toBe('4.23')
  })
})

describe('formatBillingUsdcWhole', () => {
  it('rounds to cents then floors to whole USDC', () => {
    expect(formatBillingUsdcWhole(48.999996)).toBe('49')
    expect(formatBillingUsdcWhole(50.709996)).toBe('50')
    expect(formatBillingUsdcWhole(4.225833)).toBe('4')
  })
})

describe('formatUiAmount', () => {
  it('returns "0" for null/undefined/NaN', () => {
    expect(formatUiAmount(null)).toBe('0')
    expect(formatUiAmount(undefined)).toBe('0')
    expect(formatUiAmount(NaN)).toBe('0')
    expect(formatUiAmount(Infinity)).toBe('0')
  })

  it('floors to integer for NFTs (maxDecimals=0)', () => {
    expect(formatUiAmount(5.9, 0)).toBe('5')
    expect(formatUiAmount(10, 0)).toBe('10')
  })

  it('returns integer amounts without decimal', () => {
    expect(formatUiAmount(42)).toBe('42')
  })

  it('strips trailing zeros', () => {
    expect(formatUiAmount(1.5)).toBe('1.5')
    expect(formatUiAmount(1.100000)).toBe('1.1')
  })
})

describe('formatRawTokenAmount', () => {
  it('returns "0" for null/undefined/zero', () => {
    expect(formatRawTokenAmount(null, 6)).toBe('0')
    expect(formatRawTokenAmount(undefined, 6)).toBe('0')
    expect(formatRawTokenAmount('0', 6)).toBe('0')
  })

  it('returns "?" when decimals unknown', () => {
    expect(formatRawTokenAmount('1000000', null)).toBe('?')
    expect(formatRawTokenAmount('1000000', undefined)).toBe('?')
  })

  it('formats NFT amounts with kind=NFT', () => {
    expect(formatRawTokenAmount('5', 0, 'NFT')).toBe('5')
    expect(formatRawTokenAmount('5', null, 'NFT')).toBe('5')
  })

  it('formats SPL amounts', () => {
    expect(formatRawTokenAmount('1000000', 6, 'SPL')).toBe('1')
    expect(formatRawTokenAmount('1500000', 6, 'SPL')).toBe('1.5')
  })

  it('handles BN-like objects', () => {
    const bn = { toString: () => '2000000' }
    expect(formatRawTokenAmount(bn, 6)).toBe('2')
  })
})

describe('formatDate', () => {
  it('formats ISO strings', () => {
    const result = formatDate('2026-01-15T00:00:00Z')
    expect(result).toBeTruthy()
    expect(result).not.toBe('2026-01-15T00:00:00Z')
  })

  it('formats Date objects', () => {
    const result = formatDate(new Date('2026-01-15'))
    expect(result).toBeTruthy()
  })

  it('returns string repr for invalid dates', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })
})

describe('escrowPriceToHuman', () => {
  it('returns number as-is for valid positive', () => {
    expect(escrowPriceToHuman(1.5)).toBe(1.5)
    expect(escrowPriceToHuman(100)).toBe(100)
  })

  it('returns 0 for null/undefined/negative/NaN', () => {
    expect(escrowPriceToHuman(null)).toBe(0)
    expect(escrowPriceToHuman(undefined)).toBe(0)
    expect(escrowPriceToHuman(-1)).toBe(0)
    expect(escrowPriceToHuman(NaN)).toBe(0)
  })

  it('converts string numbers', () => {
    expect(escrowPriceToHuman('2.5')).toBe(2.5)
  })
})
