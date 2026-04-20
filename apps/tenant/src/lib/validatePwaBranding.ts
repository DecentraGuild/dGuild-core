import type { TenantBrandingPwa } from '@decentraguild/core'

export interface PwaFormInput {
  displayName: string
  shortName: string
  icon192: string
  icon512: string
}

export function hasPwaContent(p: PwaFormInput): boolean {
  return [p.displayName, p.shortName, p.icon192, p.icon512].some((x) => x.trim().length > 0)
}

function isHttpsUrl(s: string): boolean {
  try {
    const u = new URL(s.trim())
    return u.protocol === 'https:'
  } catch {
    return false
  }
}

function isLocalHttpIconUrl(s: string): boolean {
  try {
    const u = new URL(s.trim())
    if (u.protocol !== 'http:') return false
    const h = u.hostname.toLowerCase()
    return h === 'localhost' || h === '127.0.0.1'
  } catch {
    return false
  }
}

function isValidPwaIconUrl(s: string): boolean {
  return isHttpsUrl(s) || isLocalHttpIconUrl(s)
}

export function validatePwaForm(p: PwaFormInput, slug: string | null | undefined): { valid: boolean; error?: string } {
  if (!hasPwaContent(p)) return { valid: true }
  if (!slug?.trim()) {
    return { valid: false, error: 'Claim a slug before configuring install app branding.' }
  }
  if (p.displayName.trim().length > 120) {
    return { valid: false, error: 'PWA display name is too long (max 120).' }
  }
  if (p.shortName.trim().length > 12) {
    return { valid: false, error: 'PWA short name must be at most 12 characters.' }
  }
  for (const [label, url] of [
    ['Icon 192', p.icon192],
    ['Icon 512', p.icon512],
  ] as const) {
    if (!url.trim()) continue
    if (!isValidPwaIconUrl(url)) {
      return {
        valid: false,
        error: `${label} URL must use https (http is only allowed for localhost / 127.0.0.1 in local dev).`,
      }
    }
  }
  return { valid: true }
}

export function buildPwaPayload(p: PwaFormInput): TenantBrandingPwa | undefined {
  if (!hasPwaContent(p)) return undefined
  const out: TenantBrandingPwa = {}
  if (p.displayName.trim()) out.displayName = p.displayName.trim()
  if (p.shortName.trim()) out.shortName = p.shortName.trim()
  if (p.icon192.trim()) out.icon192 = p.icon192.trim()
  if (p.icon512.trim()) out.icon512 = p.icon512.trim()
  return Object.keys(out).length ? out : undefined
}
