/**
 * Nuxt `useRequestHeaders()` may be a Headers-like object or a plain record; `.get` is not always defined.
 */
export function pickRequestHeader(headers: unknown, name: string): string {
  if (headers && typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? ''
  }
  const r = headers as Record<string, string | string[] | undefined>
  const lower = name.toLowerCase()
  for (const key of Object.keys(r)) {
    if (key.toLowerCase() === lower) {
      const v = r[key]
      if (typeof v === 'string') return v
      if (Array.isArray(v) && v[0]) return v[0]
    }
  }
  return ''
}
