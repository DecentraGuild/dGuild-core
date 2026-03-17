/**
 * Resolves tenant slug from request host during SSR and fetches tenant context
 * so first paint has full branding/nav. Avoids client waterfall and hydration mismatch.
 * Uses Supabase PostgREST (tenant_context_view) instead of the old Fastify API.
 */
import type { TenantConfig, MarketplaceSettings } from '@decentraguild/core'
import { getTenantSlugFromHost } from '@decentraguild/core'
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import { useTenantStore } from '~/stores/tenant'

export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig()
  const devDefaultSlug = (config.public.devTenantSlug as string)?.trim() || ''
  const supabaseUrl = config.public.supabaseUrl as string
  const supabaseAnonKey = config.public.supabaseAnonKey as string

  const event = useRequestEvent()
  const req = event?.node?.req
  if (!req?.headers?.host) return

  const host = (req.headers.host as string).toLowerCase()
  const url = req.url ?? ''
  const parsed = new URL(url.startsWith('/') ? `http://${host}${url}` : url)
  const searchParams = parsed.searchParams
  const singleHost = ((config.public as { tenantSingleHost?: string }).tenantSingleHost ?? 'dapp.dguild.org').toLowerCase()
  const isSingleHost = singleHost && host === singleHost
  const hasTenantInQuery = Boolean(searchParams.get('tenant')?.trim())

  if (isSingleHost && !hasTenantInQuery) return

  let slug = getTenantSlugFromHost(host, searchParams)
  if (!slug && (host.includes('localhost') || host.includes('127.0.0.1')) && devDefaultSlug) {
    slug = devDefaultSlug
  }
  if (!slug) return

  const tenantStore = useTenantStore()
  tenantStore.setSlug(slug)

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return parseCookieHeader(req?.headers?.cookie ?? '')
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            event?.node?.res?.appendHeader(
              'Set-Cookie',
              serializeCookieHeader(name, value, options),
            )
          }
        },
      },
    })

    const { data, error } = await supabase
      .from('tenant_context_view')
      .select('*')
      .or(`id.eq.${slug},slug.eq.${slug}`)
      .maybeSingle()

    if (error || !data) {
      tenantStore.error = error?.message ?? 'Failed to load tenant'
      return
    }

    const tenantData: TenantConfig = {
      id: data.id as string,
      slug: data.slug as string | undefined,
      name: data.name as string,
      description: data.description as string | undefined,
      discordServerInviteLink: data.discord_server_invite_link as string | undefined,
      homepage: data.homepage as string | undefined,
      xLink: data.x_link as string | undefined,
      telegramLink: data.telegram_link as string | undefined,
      defaultGate: data.default_gate as TenantConfig['defaultGate'],
      branding: data.branding as TenantConfig['branding'],
      modules: data.modules as TenantConfig['modules'],
      admins: data.admins as string[],
      treasury: data.treasury as string | undefined,
    }

    const rawSettings = data.marketplace_settings as MarketplaceSettings | null
    const currencyMintsFromTable = (data.currency_mints as string[] | null) ?? []
    let marketplaceSettings: MarketplaceSettings | null = rawSettings
      ? {
          ...rawSettings,
          currencyMints: currencyMintsFromTable.map((mint) => ({ mint })),
        }
      : null
    if (marketplaceSettings) {
      const mints = [
        ...marketplaceSettings.currencyMints.map((c) => c.mint),
        ...(marketplaceSettings.splAssetMints ?? []).map((c) => (typeof c === 'string' ? c : c.mint)),
        ...(marketplaceSettings.collectionMints ?? []).map((c) => (typeof c === 'string' ? c : c.mint)),
      ].filter(Boolean)
      const uniqueMints = [...new Set(mints)]
      if (uniqueMints.length > 0) {
        const { data: metaRows } = await supabase
          .from('mint_metadata')
          .select('mint, name, symbol, image')
          .in('mint', uniqueMints)
        const metaByMint = new Map((metaRows ?? []).map((m) => [(m.mint as string), m]))
        const enrich = (arr: Array<{ mint: string; name?: string; symbol?: string; image?: string }> | undefined) =>
          (arr ?? []).map((item) => {
            const m = typeof item === 'string' ? { mint: item } : item
            const meta = metaByMint.get(m.mint)
            return {
              ...m,
              name: m.name ?? meta?.name ?? null,
              symbol: m.symbol ?? meta?.symbol ?? null,
              image: m.image ?? meta?.image ?? null,
            }
          })
        marketplaceSettings = {
          ...marketplaceSettings,
          currencyMints: enrich(marketplaceSettings.currencyMints),
          splAssetMints: enrich(marketplaceSettings.splAssetMints as Array<{ mint: string; name?: string; symbol?: string; image?: string }>),
          collectionMints: enrich(marketplaceSettings.collectionMints as Array<{ mint: string; name?: string; image?: string }>),
        }
      }
    }

    tenantStore.applyTenantContext(slug, {
      tenant: tenantData,
      marketplaceSettings,
    })
  } catch {
    tenantStore.error = 'Failed to load tenant'
  }
})
