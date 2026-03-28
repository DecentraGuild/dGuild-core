const LOCALE_OPTS = { sensitivity: 'base' } as const

export interface MintDisplaySortFields {
  mint: string
  name?: string | null
  label?: string | null
  symbol?: string | null
}

export function mintDisplaySortKey(r: MintDisplaySortFields): string {
  return (r.name?.trim() || r.label?.trim() || r.symbol?.trim() || r.mint)
}

export function compareMintDisplayName(a: MintDisplaySortFields, b: MintDisplaySortFields): number {
  const c = mintDisplaySortKey(a).localeCompare(mintDisplaySortKey(b), undefined, LOCALE_OPTS)
  return c !== 0 ? c : a.mint.localeCompare(b.mint)
}

export function sortByMintDisplayName<T extends MintDisplaySortFields>(items: readonly T[]): T[] {
  return [...items].sort(compareMintDisplayName)
}
