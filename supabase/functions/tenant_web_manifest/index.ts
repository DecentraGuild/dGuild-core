/**
 * Host-based Web App Manifest for static tenant deploys.
 * Deploy behind same-origin proxy (e.g. /manifest.webmanifest -> this function) so X-Forwarded-Host is set.
 */
import { handlePreflight, manifestResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'

const DGUILD_ORG = '.dguild.org'

function normalizeHost(h: string): string {
  return h.toLowerCase().replace(/:\d+$/, '')
}

function slugFromHost(host: string): string | null {
  const hostLower = normalizeHost(host)
  if (!hostLower.endsWith(DGUILD_ORG)) return null
  const sub = hostLower.slice(0, -DGUILD_ORG.length).replace(/\.$/, '')
  if (sub === 'www' || sub === '' || sub === 'api') return null
  return sub
}

function defaultThemeColor(branding: Record<string, unknown> | null | undefined): string {
  const theme = branding?.theme as Record<string, unknown> | undefined
  const colors = theme?.colors as Record<string, unknown> | undefined
  const primary = colors?.primary as Record<string, unknown> | undefined
  const main = primary?.main
  return typeof main === 'string' && main.startsWith('#') ? main : '#111827'
}

function iconEntries(
  origin: string,
  pwa: Record<string, unknown> | undefined,
  branding: Record<string, unknown> | undefined,
): Array<Record<string, string>> {
  const i192 = typeof pwa?.icon192 === 'string' ? pwa.icon192 : ''
  const i512 = typeof pwa?.icon512 === 'string' ? pwa.icon512 : ''
  const logo = typeof branding?.logo === 'string' ? branding.logo : ''
  const out: Array<Record<string, string>> = []
  if (i192) {
    out.push({ src: i192, sizes: '192x192', type: 'image/png', purpose: 'any maskable' })
  }
  if (i512) {
    out.push({ src: i512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' })
  }
  if (!i192 && !i512 && logo.startsWith('https://')) {
    out.push({ src: logo, sizes: '512x512', type: 'image/png', purpose: 'any' })
  }
  if (out.length === 0) {
    out.push({
      src: `${origin}/favicon.svg`,
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any',
    })
  }
  return out
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const singleHost = normalizeHost(Deno.env.get('TENANT_SINGLE_HOST') ?? 'dapp.dguild.org')

  // Do not trust ?host= (spoofable if this function is reached without a stripping reverse proxy).
  const rawHost =
    req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    req.headers.get('x-nf-client-host')?.trim() ||
    normalizeHost(req.headers.get('host') ?? '')

  const host = rawHost || singleHost

  if (normalizeHost(host) === singleHost) {
    const origin = `https://${singleHost}`
    const body = {
      id: `${origin}/`,
      name: 'DecentraGuild',
      short_name: 'dGuild',
      description: 'Multi-tenant Solana communities',
      start_url: `${origin}/`,
      scope: '/',
      display: 'standalone',
      orientation: 'portrait-primary',
      background_color: '#111827',
      theme_color: '#111827',
      icons: [
        {
          src: `${origin}/favicon.svg`,
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any',
        },
      ],
    }
    return manifestResponse(JSON.stringify(body), req)
  }

  const slug = slugFromHost(host)
  if (!slug) {
    return manifestResponse(
      JSON.stringify({
        id: 'https://dguild.org/',
        name: 'DecentraGuild',
        short_name: 'dGuild',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#111827',
        theme_color: '#111827',
        icons: [{ src: 'https://dguild.org/favicon.ico', sizes: '48x48', type: 'image/x-icon', purpose: 'any' }],
      }),
      req,
    )
  }

  let db
  try {
    db = getAdminClient()
  } catch {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: row, error } = await db
    .from('tenant_config')
    .select('id, slug, name, branding')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !row) {
    return new Response(JSON.stringify({ error: 'Tenant not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const origin = `https://${slug}${DGUILD_ORG}`
  const branding = (row.branding ?? {}) as Record<string, unknown>
  const pwa = branding.pwa as Record<string, unknown> | undefined
  const name =
    (typeof pwa?.displayName === 'string' && pwa.displayName.trim()) ||
    (typeof branding.name === 'string' && branding.name.trim()) ||
    (row.name as string) ||
    slug
  const short =
    (typeof pwa?.shortName === 'string' && pwa.shortName.trim()) ||
    (typeof branding.shortName === 'string' && branding.shortName.trim()) ||
    slug.slice(0, 12)
  const themeColor = defaultThemeColor(branding)

  const body = {
    id: `${origin}/`,
    name,
    short_name: short,
    start_url: `${origin}/`,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: themeColor,
    theme_color: themeColor,
    icons: iconEntries(origin, pwa, branding),
  }

  return manifestResponse(JSON.stringify(body), req)
})
