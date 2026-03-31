export const METAPLEX_TOKEN_SYMBOL_MAX_LEN = 9

const SYMBOL_CHARS_RE = /^[A-Za-z0-9_-]+$/

export function metaplexTokenSymbolValidationError(value: string): string | null {
  const s = value.trim()
  if (!s) return 'Symbol is required'
  if (s.length > METAPLEX_TOKEN_SYMBOL_MAX_LEN) {
    return `Symbol must be at most ${METAPLEX_TOKEN_SYMBOL_MAX_LEN} characters`
  }
  if (!SYMBOL_CHARS_RE.test(s)) {
    return 'Symbol may only use letters, numbers, hyphen (-), and underscore (_)'
  }
  return null
}
