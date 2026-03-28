const LOCALE_OPTS = { sensitivity: 'base' } as const

function displayKey(r: {
  mint: string
  name?: string | null
  label?: string | null
  symbol?: string | null
}): string {
  return (r.name?.trim() || r.label?.trim() || r.symbol?.trim() || r.mint)
}

export function compareMintCatalogDisplay(
  a: {
    mint: string
    name?: string | null
    label?: string | null
    symbol?: string | null
  },
  b: typeof a,
): number {
  const c = displayKey(a).localeCompare(displayKey(b), undefined, LOCALE_OPTS)
  return c !== 0 ? c : a.mint.localeCompare(b.mint)
}
