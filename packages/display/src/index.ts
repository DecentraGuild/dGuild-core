/**
 * Token and amount formatting utilities for display.
 * Used by escrow, wallet, admin, future modules.
 */

/**
 * Convert raw token amount to human-readable number.
 * @param amount - Raw amount (BN, string, or number)
 * @param decimals - Token decimals (0 for NFTs)
 */
export function fromRawUnits(
  amount: { toString: () => string } | string | number | null | undefined,
  decimals: number
): number {
  if (amount === null || amount === undefined || amount === '0' || amount === 0) return 0

  const amountStr =
    typeof amount === 'object' && amount !== null && 'toString' in amount
      ? (amount as { toString: () => string }).toString()
      : String(amount)

  if (decimals === 0) {
    return parseInt(amountStr, 10) || 0
  }

  const padded = amountStr.padStart(decimals + 1, '0')
  const integerPart = padded.slice(0, -decimals) || '0'
  const decimalPart = padded.slice(-decimals)
  return parseFloat(`${integerPart}.${decimalPart}`) || 0
}

/**
 * Convert human amount to raw units (string for BN compatibility).
 */
export function toRawUnits(amount: number, decimals: number): string {
  if (!amount || amount === 0) return '0'

  const amountStr = typeof amount === 'number' ? amount.toString() : String(amount)
  const [integerPart, decimalPart = ''] = amountStr.split('.')
  const paddedDecimal = decimalPart.padEnd(decimals, '0').slice(0, decimals)
  return integerPart + paddedDecimal
}

/**
 * Sanitize token symbol/name for display: remove replacement characters, zero-width chars, and control chars.
 * On-chain metadata sometimes contains invalid or invisible Unicode that renders as boxes.
 */
export function sanitizeTokenLabel(value: string | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return s
    .replace(/\uFFFD/g, '') // Unicode replacement character (often shows as box)
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width space, joiners, BOM
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, '') // Control characters
    .trim()
}

/**
 * Truncate address for display. Default 6+4 for mints.
 */
export function truncateAddress(
  addr: string | null | undefined,
  startChars = 6,
  endChars = 4
): string {
  if (!addr) return ''
  if (addr.length <= startChars + endChars) return addr
  return `${addr.slice(0, startChars)}...${addr.slice(-endChars)}`
}

/**
 * Format USDC amount for display (no currency symbol).
 */
export function formatUsdc(value: number): string {
  return parseFloat(value.toFixed(6)).toString()
}

/**
 * Round USDC catalogue-style amounts to cents (avoids float dust in UI).
 */
export function roundBillingUsdcCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Format USDC for billing/pricing widgets: cent precision, no long fractional tails.
 */
export function formatBillingUsdc(value: number): string {
  return formatUiAmount(roundBillingUsdcCents(value), 2)
}

/**
 * Whole USDC for admin pricing cards (no fractional cents in UI).
 */
export function formatBillingUsdcWhole(value: number): string {
  return formatUiAmount(roundBillingUsdcCents(value), 0)
}

/**
 * Format UI (human) amount for display. Strips trailing zeros.
 * Use for token amounts, balances, etc.
 * @param maxDecimals - Max decimal places; 0 for NFTs (floors to integer).
 */
export function formatUiAmount(amount: number | null | undefined, maxDecimals = 6): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '0'
  if (maxDecimals === 0) return String(Math.floor(amount))
  if (Number.isInteger(amount)) return String(amount)
  return amount.toFixed(maxDecimals).replace(/\.?0+$/, '')
}

/**
 * Format raw token amount (on-chain units) for UI display.
 * Always use this when displaying amounts from chain/API to avoid showing raw units.
 * Callers must pass decimals from catalog/mint_metadata or RPC fetch. No assumption.
 * @param rawAmount - Raw amount string (e.g. from holder_wallets, token account)
 * @param decimals - Token decimals from catalog or RPC; 0 for NFTs (count); null for SPL when unknown
 * @param kind - 'NFT' forces count display (decimals 0); 'SPL' uses decimals (requires decimals when not 0)
 */
export function formatRawTokenAmount(
  rawAmount: string | { toString: () => string } | null | undefined,
  decimals: number | null | undefined,
  kind?: 'SPL' | 'NFT'
): string {
  if (rawAmount === null || rawAmount === undefined) return '0'
  const str = typeof rawAmount === 'object' && 'toString' in rawAmount ? rawAmount.toString() : String(rawAmount)
  if (!str || str === '0') return '0'
  const dec = kind === 'NFT' ? 0 : decimals
  if (dec == null || !Number.isFinite(dec)) return '?'
  const human = fromRawUnits(str, dec)
  return formatUiAmount(human, dec === 0 ? 0 : 6)
}

/**
 * Format ISO date string for display (medium date style).
 */
export function formatDate(iso: string | Date): string {
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso
    if (Number.isNaN(d.getTime())) return String(iso)
    return d.toLocaleDateString(undefined, { dateStyle: 'medium' })
  } catch {
    return String(iso)
  }
}

/**
 * Format ISO date string with time for display.
 */
export function formatDateTime(value: string | Date | null): string {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString()
}

/**
 * Escrow price: program stores human-readable per-unit price (request tokens per 1 deposit unit).
 * Use as-is. Do not scale by decimals or any other factor.
 */
export function escrowPriceToHuman(price: number | string | null | undefined): number {
  const n = Number(price)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}
