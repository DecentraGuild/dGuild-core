/**
 * Admin form state and save logic for General, Theming, and Modules tabs.
 * Saves via PostgREST (tenant_config UPDATE, RLS enforces admin access).
 */

import type { ModuleState } from '@decentraguild/core'
import { useThemeStore, mergeTheme, DEFAULT_TENANT_THEME } from '@decentraguild/ui'
import { useAdminTenant } from '~/composables/admin/useAdminTenant'
import { useAdminSave } from '~/composables/admin/useAdminSave'
import { useSupabase } from '~/composables/core/useSupabase'
import { MODULE_NAV } from '~/config/modules'
import type { TenantConfig } from '@decentraguild/core'

export interface AdminForm {
  name: string
  description: string
  discordServerInviteLink: string
  defaultWhitelist: MarketplaceWhitelistSettings | null
  branding: {
    logo: string
    theme: ReturnType<typeof mergeTheme>
  }
  modulesById: Record<string, ModuleState>
}

function buildBrandingForm(
  tenant: { branding?: { logo?: string; theme?: unknown }; discordServerInviteLink?: string } | null
): AdminForm['branding'] {
  const theme = mergeTheme(
    DEFAULT_TENANT_THEME,
    (tenant?.branding?.theme ?? {}) as Parameters<typeof mergeTheme>[1],
  )
  return {
    logo: tenant?.branding?.logo ?? '',
    theme,
  }
}

export function useAdminForm(subscriptions: Record<string, { periodEnd?: string } | null>) {
  const { tenant, tenantId, slug, tenantStore } = useAdminTenant()
  const { saving, saveError, withSave } = useAdminSave()

  const moduleIds = computed(() => Object.keys(MODULE_NAV))

  const form = reactive<AdminForm>({
    name: '',
    description: '',
    discordServerInviteLink: '',
    defaultGate: null,
    branding: buildBrandingForm(null),
    modulesById: {},
  })

  const dirty = ref(false)
  const lastTenantId = ref<string | null>(null)
  let suppressDirty = 0

  function setFormFromTenant(t: TenantConfig | null) {
    suppressDirty++
    try {
      if (!t) {
        form.name = ''
        form.description = ''
        form.discordServerInviteLink = ''
        form.defaultGate = null
        form.modulesById = Object.fromEntries(moduleIds.value.map((id) => [id, 'off']))
        form.branding = buildBrandingForm(null)
        dirty.value = false
        lastTenantId.value = null
        return
      }

      form.name = t.name ?? ''
      form.description = t.description ?? ''
      form.discordServerInviteLink = t.discordServerInviteLink ?? ''
      form.defaultGate = t.defaultGate ?? null
      form.branding = buildBrandingForm(t)
      const mods = t.modules ?? {}
      form.modulesById = Object.fromEntries(
        moduleIds.value.map((id) => {
          const mod = mods[id]
          return [id, (mod?.state ?? 'off') as ModuleState]
        }),
      )
      dirty.value = false
      lastTenantId.value = t.id ?? null
    } finally {
      suppressDirty--
    }
  }

  watch(
    form,
    () => {
      if (suppressDirty > 0) return
      dirty.value = true
    },
    { deep: true },
  )

  watch(
    tenant,
    (t) => {
      if (!t) {
        setFormFromTenant(null)
        return
      }
      const tenantChanged = Boolean(lastTenantId.value && t.id && t.id !== lastTenantId.value)
      if (tenantChanged || !dirty.value) {
        setFormFromTenant(t)
      }
    },
    { immediate: true },
  )

  async function save() {
    const id = tenantId.value
    if (!id) return
    await withSave(async () => {
      const prevMods = tenant.value?.modules ?? {}
      const modules: Record<
        string,
        { state: ModuleState; deactivatedate: string | null; deactivatingUntil: string | null; settingsjson: Record<string, unknown> }
      > = {}
      for (const modId of moduleIds.value) {
        const prev = prevMods[modId] as
          | { state?: ModuleState; deactivatedate?: string | null; deactivatingUntil?: string | null; settingsjson?: Record<string, unknown> }
          | undefined
        const state = modId === 'admin' ? 'active' : (form.modulesById[modId] ?? 'off')
        let deactivatingUntil = prev?.deactivatingUntil ?? null
        if (state === 'deactivating' && prev?.state === 'active') {
          deactivatingUntil = subscriptions[modId]?.periodEnd ?? prev?.deactivatedate ?? null
        }
        if (state === 'active') deactivatingUntil = null
        modules[modId] = {
          state: state as ModuleState,
          deactivatedate: prev?.deactivatedate ?? null,
          deactivatingUntil,
          settingsjson: prev?.settingsjson ?? {},
        }
      }

      const supabase = useSupabase()
      const { data, error } = await supabase
        .from('tenant_config')
        .update({
          name: form.name,
          description: form.description || null,
          discord_server_invite_link: form.discordServerInviteLink || null,
          default_gate: form.defaultGate ?? null,
          branding: { logo: form.branding.logo, theme: form.branding.theme },
          modules,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) throw new Error('Update failed. Ensure you are an admin for this organisation.')

      const updated = data as Record<string, unknown>
      const tenantData: TenantConfig = {
        id: updated.id as string,
        slug: updated.slug as string | undefined,
        name: updated.name as string,
        description: updated.description as string | undefined,
        discordServerInviteLink: updated.discord_server_invite_link as string | undefined,
        defaultGate: updated.default_gate as TenantConfig['defaultGate'],
        branding: updated.branding as TenantConfig['branding'],
        modules: updated.modules as TenantConfig['modules'],
        admins: updated.admins as string[],
        treasury: updated.treasury as string | undefined,
      }
      tenantStore.setTenant(tenantData)
      useThemeStore().loadTheme(tenantData.branding?.theme ?? {}, tenantData.branding)
    }, 'Failed to save')
  }

  return {
    form,
    tenant,
    slug,
    moduleIds,
    saving,
    saveError,
    save,
    buildBrandingForm,
  }
}
