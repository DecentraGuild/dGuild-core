function isLocalDevHost(host: string): boolean {
  const h = host.split(':')[0].toLowerCase()
  return h === 'localhost' || h === '127.0.0.1'
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const host = getRequestHeader(event, 'host') ?? 'localhost:3002'

  if (isLocalDevHost(host)) {
    const proto = getRequestHeader(event, 'x-forwarded-proto') ?? 'http'
    const origin = `${proto}://${host}`
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
          sizes: '192x192',
          type: 'image/svg+xml',
          purpose: 'any maskable',
        },
        {
          src: `${origin}/favicon.svg`,
          sizes: '512x512',
          type: 'image/svg+xml',
          purpose: 'any maskable',
        },
      ],
    }
    setResponseHeaders(event, {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'no-store',
    })
    return JSON.stringify(body)
  }

  const supabaseUrl = String(config.public.supabaseUrl ?? '').replace(/\/$/, '')
  const anon = String(config.public.supabaseAnonKey ?? '')
  if (!supabaseUrl || !anon) {
    throw createError({ statusCode: 503, statusMessage: 'Manifest unavailable' })
  }
  const fnUrl = `${supabaseUrl}/functions/v1/tenant_web_manifest`
  const res = await fetch(fnUrl, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'X-Forwarded-Host': host,
    },
  })
  const text = await res.text()
  setResponseHeaders(event, {
    'content-type': 'application/manifest+json; charset=utf-8',
    'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
    vary: 'Host',
  })
  setResponseStatus(event, res.status)
  return text
})
