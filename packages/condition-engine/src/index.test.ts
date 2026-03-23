import { describe, it, expect } from 'vitest'
import {
  getHolderWallets,
  getHolderBalances,
  evaluateCondition,
  evaluateRule,
  type ConditionRow,
  type EvaluationContext,
} from './index.js'

function makeContext(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    linkedWallets: [],
    snapshotByAsset: new Map(),
    discordRoleIds: [],
    whitelistMembersByListAddress: new Map(),
    ...overrides,
  }
}

describe('getHolderWallets', () => {
  it('returns empty for empty snapshot', () => {
    expect(getHolderWallets([])).toEqual([])
  })

  it('returns wallets from string array', () => {
    expect(getHolderWallets(['w1', 'w2'])).toEqual(['w1', 'w2'])
  })

  it('returns wallets from object array', () => {
    const snap = [
      { wallet: 'w1', amount: '10' },
      { wallet: 'w2', amount: '20' },
    ]
    expect(getHolderWallets(snap)).toEqual(['w1', 'w2'])
  })
})

describe('getHolderBalances', () => {
  it('returns empty map for empty snapshot', () => {
    expect(getHolderBalances([])).toEqual(new Map())
  })

  it('assigns balance 1 for string-only snapshots', () => {
    const result = getHolderBalances(['w1', 'w2'])
    expect(result.get('w1')).toBe(1)
    expect(result.get('w2')).toBe(1)
  })

  it('uses amount from object snapshots', () => {
    const snap = [
      { wallet: 'w1', amount: '500' },
      { wallet: 'w2', amount: '1000' },
    ]
    const result = getHolderBalances(snap)
    expect(result.get('w1')).toBe(500)
    expect(result.get('w2')).toBe(1000)
  })
})

describe('evaluateCondition', () => {
  describe('HOLDING', () => {
    it('returns false with no linked wallets', () => {
      const c: ConditionRow = { type: 'HOLDING', payload: { mint: 'M1' }, logic_to_next: null }
      expect(evaluateCondition(c, makeContext())).toBe(false)
    })

    it('returns false with no snapshot for mint', () => {
      const c: ConditionRow = { type: 'HOLDING', payload: { mint: 'M1' }, logic_to_next: null }
      expect(evaluateCondition(c, makeContext({ linkedWallets: ['w1'] }))).toBe(false)
    })

    it('returns true when wallet holds at least 1 (default)', () => {
      const snap = new Map<string, string[]>([['M1', ['w1', 'w2']]])
      const c: ConditionRow = { type: 'HOLDING', payload: { mint: 'M1' }, logic_to_next: null }
      expect(evaluateCondition(c, makeContext({ linkedWallets: ['w1'], snapshotByAsset: snap }))).toBe(true)
    })

    it('returns false when wallet does not hold enough', () => {
      const snap = new Map([['M1', [{ wallet: 'w1', amount: '5' }]]])
      const c: ConditionRow = { type: 'HOLDING', payload: { mint: 'M1', amount: 10 }, logic_to_next: null }
      expect(evaluateCondition(c, makeContext({ linkedWallets: ['w1'], snapshotByAsset: snap }))).toBe(false)
    })

    it('sums across multiple linked wallets', () => {
      const snap = new Map([['M1', [{ wallet: 'w1', amount: '5' }, { wallet: 'w2', amount: '6' }]]])
      const c: ConditionRow = { type: 'HOLDING', payload: { mint: 'M1', amount: 10 }, logic_to_next: null }
      expect(evaluateCondition(c, makeContext({ linkedWallets: ['w1', 'w2'], snapshotByAsset: snap }))).toBe(true)
    })
  })

  describe('DISCORD', () => {
    it('returns true when user has the role', () => {
      const c: ConditionRow = { type: 'DISCORD', payload: { required_role_id: 'R1' }, logic_to_next: null }
      expect(evaluateCondition(c, makeContext({ discordRoleIds: ['R1', 'R2'] }))).toBe(true)
    })

    it('returns false when user lacks the role', () => {
      const c: ConditionRow = { type: 'DISCORD', payload: { required_role_id: 'R3' }, logic_to_next: null }
      expect(evaluateCondition(c, makeContext({ discordRoleIds: ['R1', 'R2'] }))).toBe(false)
    })
  })

  describe('WHITELIST', () => {
    it('returns true when wallet is on the list', () => {
      const members = new Map([['L1', new Set(['w1', 'w2'])]])
      const c: ConditionRow = { type: 'WHITELIST', payload: { list_address: 'L1' }, logic_to_next: null }
      expect(evaluateCondition(c, makeContext({ linkedWallets: ['w1'], whitelistMembersByListAddress: members }))).toBe(true)
    })

    it('returns false when wallet is not on the list', () => {
      const members = new Map([['L1', new Set(['w2'])]])
      const c: ConditionRow = { type: 'WHITELIST', payload: { list_address: 'L1' }, logic_to_next: null }
      expect(evaluateCondition(c, makeContext({ linkedWallets: ['w1'], whitelistMembersByListAddress: members }))).toBe(false)
    })
  })

  describe('TIME_WEIGHTED', () => {
    it('returns true when minPercent is 0', () => {
      const c: ConditionRow = { type: 'TIME_WEIGHTED', payload: { mint: 'M1', begin_snapshot_at: '', end_snapshot_at: '', min_percent: 0 }, logic_to_next: null }
      expect(evaluateCondition(c, makeContext({ linkedWallets: ['w1'] }))).toBe(true)
    })

    it('checks wallet share against minPercent', () => {
      const shares = new Map([['w1', 50]])
      const c: ConditionRow = { type: 'TIME_WEIGHTED', payload: { mint: 'M1', begin_snapshot_at: '', end_snapshot_at: '', min_percent: 40 }, logic_to_next: null }
      expect(evaluateCondition(c, makeContext({ linkedWallets: ['w1'], walletShareByWallet: shares }))).toBe(true)
    })

    it('returns false when share is below minPercent', () => {
      const shares = new Map([['w1', 10]])
      const c: ConditionRow = { type: 'TIME_WEIGHTED', payload: { mint: 'M1', begin_snapshot_at: '', end_snapshot_at: '', min_percent: 40 }, logic_to_next: null }
      expect(evaluateCondition(c, makeContext({ linkedWallets: ['w1'], walletShareByWallet: shares }))).toBe(false)
    })
  })

  it('returns false for unknown condition type', () => {
    const c = { type: 'UNKNOWN' as 'HOLDING', payload: {}, logic_to_next: null }
    expect(evaluateCondition(c, makeContext())).toBe(false)
  })
})

describe('evaluateRule', () => {
  it('returns false for empty conditions', () => {
    expect(evaluateRule([], makeContext())).toBe(false)
  })

  it('returns single condition result', () => {
    const c: ConditionRow = { type: 'DISCORD', payload: { required_role_id: 'R1' }, logic_to_next: null }
    expect(evaluateRule([c], makeContext({ discordRoleIds: ['R1'] }))).toBe(true)
    expect(evaluateRule([c], makeContext({ discordRoleIds: [] }))).toBe(false)
  })

  it('handles AND logic', () => {
    const c1: ConditionRow = { type: 'DISCORD', payload: { required_role_id: 'R1' }, logic_to_next: 'AND' }
    const c2: ConditionRow = { type: 'DISCORD', payload: { required_role_id: 'R2' }, logic_to_next: null }
    expect(evaluateRule([c1, c2], makeContext({ discordRoleIds: ['R1', 'R2'] }))).toBe(true)
    expect(evaluateRule([c1, c2], makeContext({ discordRoleIds: ['R1'] }))).toBe(false)
  })

  it('handles OR logic', () => {
    const c1: ConditionRow = { type: 'DISCORD', payload: { required_role_id: 'R1' }, logic_to_next: 'OR' }
    const c2: ConditionRow = { type: 'DISCORD', payload: { required_role_id: 'R2' }, logic_to_next: null }
    expect(evaluateRule([c1, c2], makeContext({ discordRoleIds: ['R2'] }))).toBe(true)
    expect(evaluateRule([c1, c2], makeContext({ discordRoleIds: [] }))).toBe(false)
  })

  it('handles mixed AND/OR logic', () => {
    const c1: ConditionRow = { type: 'DISCORD', payload: { required_role_id: 'R1' }, logic_to_next: 'OR' }
    const c2: ConditionRow = { type: 'DISCORD', payload: { required_role_id: 'R2' }, logic_to_next: 'AND' }
    const c3: ConditionRow = { type: 'DISCORD', payload: { required_role_id: 'R3' }, logic_to_next: null }
    // (true OR true) AND true = true
    expect(evaluateRule([c1, c2, c3], makeContext({ discordRoleIds: ['R1', 'R2', 'R3'] }))).toBe(true)
    // (false OR true) AND false = false
    expect(evaluateRule([c1, c2, c3], makeContext({ discordRoleIds: ['R2'] }))).toBe(false)
  })
})
