/**
 * Smoke-check tenant_web_manifest (local: run `supabase functions serve` or use deployed URL).
 * Usage: node scripts/verify-manifest.mjs
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY optional; defaults to localhost CLI ports.
 */
const base =
  process.env.SUPABASE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:65421'
const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const url = `${base}/functions/v1/tenant_web_manifest`

async function fetchManifest(host) {
  const res = await fetch(url, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'X-Forwarded-Host': host,
    },
  })
  const text = await res.text()
  return { status: res.status, text }
}

async function main() {
  if (!anon) {
    console.warn('No anon key in env; request may fail against local Supabase.')
  }
  for (const host of ['dapp.dguild.org', 'localhost:3002']) {
    const { status, text } = await fetchManifest(host)
    console.log(`Host ${host} -> HTTP ${status}`)
    try {
      const j = JSON.parse(text)
      console.log('  name:', j.name, 'start_url:', j.start_url)
    } catch {
      console.log('  body:', text.slice(0, 200))
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
