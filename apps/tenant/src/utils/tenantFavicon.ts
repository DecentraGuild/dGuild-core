import type { TenantBranding } from '@decentraguild/core'

function mimeFromUrl(href: string): string {
  const path = href.split('?')[0]?.toLowerCase() ?? ''
  if (path.endsWith('.svg')) return 'image/svg+xml'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.ico')) return 'image/x-icon'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  return 'image/png'
}

/** Same resolution order as `tenant_web_manifest` iconEntries (PWA icons → HTTPS logo → site default). */
export function resolveTenantFavicon(branding: TenantBranding | null | undefined): { href: string; type: string } {
  const pwa = branding?.pwa
  const icon192 = typeof pwa?.icon192 === 'string' ? pwa.icon192.trim() : ''
  const icon512 = typeof pwa?.icon512 === 'string' ? pwa.icon512.trim() : ''
  const logo = typeof branding?.logo === 'string' ? branding.logo.trim() : ''

  const href = icon192 || icon512 || (logo.startsWith('https://') ? logo : '') || '/favicon.svg'
  const type = href === '/favicon.svg' ? 'image/svg+xml' : mimeFromUrl(href)
  return { href, type }
}
