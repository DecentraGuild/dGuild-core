export interface ParsedCurrencyMintRow {
  mint: string
  groupPath?: string[]
}

export function parseCurrencyMintsFromView(raw: unknown): ParsedCurrencyMintRow[] {
  if (raw == null) return []
  if (typeof raw === 'string') {
    try {
      return parseCurrencyMintsFromView(JSON.parse(raw) as unknown)
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  if (raw.length === 0) return []
  if (typeof raw[0] === 'string') {
    return (raw as string[]).map((mint) => ({ mint }))
  }
  const rows = raw as Array<{ mint: string; groupPath?: string[] | null }>
  return rows.map((r) => ({
    mint: r.mint,
    groupPath: Array.isArray(r.groupPath) ? r.groupPath : undefined,
  }))
}
