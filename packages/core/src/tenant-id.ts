const DEFAULT_LENGTH = 7

export function generateRandomNumericTenantId(length = DEFAULT_LENGTH): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += String(bytes[i]! % 10)
  }
  return out
}
