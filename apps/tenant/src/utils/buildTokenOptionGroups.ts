/**
 * Shared utility for building OptionsSelect option groups from token/mint lists.
 * Used by CreateTradeForm (offer + request dropdowns) and any similar selectors.
 */

export type TokenKind = 'NFT' | 'SPL' | 'Currency'

export interface TokenOptionInput {
  mint: string
  [key: string]: unknown
}

export interface OptionGroup {
  groupLabel: string
  options: { value: string; label: string }[]
}

const SORT_LABELS = (a: { label: string }, b: { label: string }) =>
  a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })

/**
 * Bucket items into NFT / SPL / Currency, sort by label, return groups for OptionsSelect.
 */
export function buildTokenOptionGroups<T extends TokenOptionInput>(
  items: T[],
  classify: (item: T) => TokenKind,
  getLabel: (item: T) => string
): OptionGroup[] {
  const nft: { value: string; label: string }[] = []
  const spl: { value: string; label: string }[] = []
  const currency: { value: string; label: string }[] = []

  for (const item of items) {
    const label = getLabel(item)
    const opt = { value: item.mint, label }
    const kind = classify(item)
    if (kind === 'NFT') nft.push(opt)
    else if (kind === 'Currency') currency.push(opt)
    else spl.push(opt)
  }

  nft.sort(SORT_LABELS)
  spl.sort(SORT_LABELS)
  currency.sort(SORT_LABELS)

  const groups: OptionGroup[] = []
  if (nft.length) groups.push({ groupLabel: 'NFT', options: nft })
  if (spl.length) groups.push({ groupLabel: 'SPL', options: spl })
  if (currency.length) groups.push({ groupLabel: 'Currency', options: currency })
  return groups
}
