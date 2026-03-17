import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { TenantConfig, MarketplaceSettings, MarketplaceGateSettings } from '@decentraguild/core'
import { useThemeStore } from '@decentraguild/ui'
import { getBrowserClient } from '@decentraguild/auth'

export type { MarketplaceSettings } from '@decentraguild/core'

export interface RaffleSettings {
  defaultGate?: MarketplaceGateSettings | 'use-default' | 'admin-only' | null
}

export const useTenantStore = defineStore('tenant', () => {
  const tenant = ref<TenantConfig | null>(null)
  const marketplaceSettings = ref<MarketplaceSettings | null>(null)
  const raffleSettings = ref<RaffleSettings | null>(null)
  /** Subdomain/URL param for routing only (display). Never use for API or billing — use tenantId. */
  const slug = ref<string | null>(null)
  /** Permanent tenant id (tenant_config.id). Use this for all API calls, billing, and DB. */
  const tenantId = computed(() => tenant.value?.id ?? null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  function getSupabase() {
    const config = useRuntimeConfig()
    return getBrowserClient(
      config.public.supabaseUrl as string,
      config.public.supabaseAnonKey as string,
    )
  }

  async function fetchTenantContext(slugParam: string) {
    loading.value = true
    error.value = null
    slug.value = slugParam
    marketplaceSettings.value = null
    raffleSettings.value = null

    try {
      const supabase = getSupabase()

      // Use the tenant_context_view which joins tenant_config, marketplace_settings, raffle_settings.
      // The view uses tenant_id as FK; resolve by id or slug.
      const { data, error: dbError } = await supabase
        .from('tenant_context_view')
        .select('*')
        .or(`id.eq.${slugParam},slug.eq.${slugParam}`)
        .maybeSingle()

      if (dbError) throw new Error(dbError.message)
      if (!data) throw new Error(`Tenant not found: ${slugParam}`)

      const tenantData: TenantConfig = {
        id: data.id as string,
        slug: data.slug as string | undefined,
        name: data.name as string,
        description: data.description as string | undefined,
        discordServerInviteLink: data.discord_server_invite_link as string | undefined,
        homepage: data.homepage as string | undefined,
        xLink: data.x_link as string | undefined,
        telegramLink: data.telegram_link as string | undefined,
        defaultGate: data.default_gate as MarketplaceGateSettings | undefined,
        branding: data.branding as TenantConfig['branding'],
        modules: data.modules as TenantConfig['modules'],
        admins: data.admins as string[],
        treasury: data.treasury as string | undefined,
      }

      const rawSettings = data.marketplace_settings as MarketplaceSettings | null
      const currencyMintsFromTable = (data.currency_mints as string[] | null) ?? []
      const marketplaceSettings: MarketplaceSettings | null = rawSettings
        ? {
            ...rawSettings,
            currencyMints: currencyMintsFromTable.map((mint) => ({ mint })),
          }
        : null

      applyTenantContext(slugParam, {
        tenant: tenantData,
        marketplaceSettings,
        raffleSettings: data.raffle_settings
          ? (data.raffle_settings as RaffleSettings)
          : null,
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load tenant'
      tenant.value = null
      marketplaceSettings.value = null
      raffleSettings.value = null
    } finally {
      loading.value = false
    }
  }

  async function refetchTenantContext() {
    const currentSlug = slug.value
    if (!currentSlug) return
    await fetchTenantContext(currentSlug)
  }

  function clearTenant() {
    tenant.value = null
    marketplaceSettings.value = null
    raffleSettings.value = null
    slug.value = null
    error.value = null
  }

  function setTenant(config: TenantConfig | null) {
    tenant.value = config
  }

  function setMarketplaceSettings(settings: MarketplaceSettings | null) {
    marketplaceSettings.value = settings
  }

  function setRaffleSettings(settings: RaffleSettings | null) {
    raffleSettings.value = settings
  }

  function setSlug(slugParam: string | null) {
    slug.value = slugParam
  }

  function applyTenantContext(
    slugParam: string,
    data: {
      tenant: TenantConfig
      marketplaceSettings?: MarketplaceSettings | null
      raffleSettings?: RaffleSettings | null
    },
  ) {
    slug.value = slugParam
    tenant.value = data.tenant
    marketplaceSettings.value = data.marketplaceSettings ?? null
    raffleSettings.value = data.raffleSettings ?? null
    error.value = null
    const themeStore = useThemeStore()
    themeStore.loadTheme(data.tenant.branding?.theme ?? {}, {
      logo: data.tenant.branding?.logo,
      name: data.tenant.branding?.name,
      shortName: data.tenant.branding?.shortName,
    })
  }

  return {
    tenant,
    tenantId,
    marketplaceSettings,
    raffleSettings,
    slug,
    loading,
    error,
    fetchTenantContext,
    refetchTenantContext,
    applyTenantContext,
    clearTenant,
    setTenant,
    setMarketplaceSettings,
    setRaffleSettings,
    setSlug,
  }
})
