export interface HOLDINGPayload {
  mint: string
  amount?: number
}

export interface NFTPayload {
  mint?: string
  collection_or_mint?: string
  amount?: number
  trait_key?: string
  trait_value?: string
}

export interface DISCORDPayload {
  required_role_id: string
}

export interface WHITELISTPayload {
  list_address: string
}

export interface TIME_WEIGHTEDPayload {
  mint: string
  begin_snapshot_at: string
  end_snapshot_at?: string
  min_percent?: number
}

export type ConditionRow = {
  type: 'HOLDING' | 'TRAIT' | 'DISCORD' | 'WHITELIST' | 'SHIPMENT' | 'SNAPSHOTS' | 'TIME_WEIGHTED'
  payload: Record<string, unknown>
  logic_to_next: 'AND' | 'OR' | null
}

export type HolderSnapshot = string[] | Array<{ wallet: string; amount: string }>

export interface EvaluationContext {
  linkedWallets: string[]
  snapshotByAsset: Map<string, HolderSnapshot>
  discordRoleIds: string[]
  whitelistMembersByListAddress: Map<string, Set<string>>
  /** For TIME_WEIGHTED: precomputed share (0-100) per wallet. Caller must populate. */
  walletShareByWallet?: Map<string, number>
}

export function getHolderWallets(snapshot: HolderSnapshot): string[] {
  if (!snapshot.length) return []
  if (typeof snapshot[0] === 'string') return snapshot as string[]
  return (snapshot as Array<{ wallet: string }>).map((h) => h.wallet)
}

export function getHolderBalances(snapshot: HolderSnapshot): Map<string, number> {
  const map = new Map<string, number>()
  if (!snapshot.length) return map
  if (typeof snapshot[0] === 'string') {
    for (const w of snapshot as string[]) map.set(w, 1)
    return map
  }
  for (const h of snapshot as Array<{ wallet: string; amount: string }>) {
    map.set(h.wallet, Number(h.amount))
  }
  return map
}

export function evaluateCondition(c: ConditionRow, context: EvaluationContext): boolean {
  if (c.type === 'HOLDING') {
    const p = c.payload as unknown as HOLDINGPayload
    if (!p.mint || context.linkedWallets.length === 0) return false
    const snap = context.snapshotByAsset.get(p.mint)
    if (!snap) return false
    const targetAmount = typeof p.amount === 'number' && p.amount > 0 ? p.amount : 1
    const balances = getHolderBalances(snap)
    const total = context.linkedWallets.reduce((sum, w) => sum + (balances.get(w) ?? 0), 0)
    return total >= targetAmount
  }
  if (c.type === 'TRAIT') {
    const p = c.payload as unknown as NFTPayload
    const assetId = p.mint ?? p.collection_or_mint
    if (!assetId || context.linkedWallets.length === 0) return false
    const snap = context.snapshotByAsset.get(assetId)
    if (!snap) return false
    const targetAmount = typeof p.amount === 'number' && p.amount > 0 ? p.amount : 1
    const balances = getHolderBalances(snap)
    const total = context.linkedWallets.reduce((sum, w) => sum + (balances.get(w) ?? 0), 0)
    return total >= targetAmount
  }
  if (c.type === 'DISCORD') {
    const p = c.payload as unknown as DISCORDPayload
    return p.required_role_id ? context.discordRoleIds.includes(p.required_role_id) : false
  }
  if (c.type === 'WHITELIST') {
    const p = c.payload as unknown as WHITELISTPayload
    if (!p.list_address || context.linkedWallets.length === 0) return false
    const members = context.whitelistMembersByListAddress.get(p.list_address)
    if (!members) return false
    return context.linkedWallets.some((w) => members.has(w))
  }
  if (c.type === 'SHIPMENT' || c.type === 'SNAPSHOTS') {
    const p = c.payload as { mint?: string; amount?: number }
    if (!p.mint || context.linkedWallets.length === 0) return false
    const snap = context.snapshotByAsset.get(p.mint)
    if (!snap) return false
    const targetAmount = typeof p.amount === 'number' && p.amount > 0 ? p.amount : 1
    const balances = getHolderBalances(snap)
    const total = context.linkedWallets.reduce((sum, w) => sum + (balances.get(w) ?? 0), 0)
    return total >= targetAmount
  }
  if (c.type === 'TIME_WEIGHTED') {
    const p = c.payload as unknown as TIME_WEIGHTEDPayload
    if (!p.mint || context.linkedWallets.length === 0) return false
    const minPercent = typeof p.min_percent === 'number' && p.min_percent >= 0 ? p.min_percent : 0
    if (minPercent <= 0) return true
    const shares = context.walletShareByWallet
    if (!shares) return false
    const share = context.linkedWallets.reduce((sum, w) => sum + (shares.get(w) ?? 0), 0)
    return share >= minPercent
  }
  return false
}

export function evaluateRule(conditions: ConditionRow[], context: EvaluationContext): boolean {
  if (conditions.length === 0) return false
  const results = conditions.map((c) => evaluateCondition(c, context))
  let value = results[0]!
  for (let i = 1; i < results.length; i++) {
    const op = conditions[i - 1]!.logic_to_next
    value = op === 'OR' ? value || results[i]! : value && results[i]!
  }
  return value
}
