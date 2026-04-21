import { computed } from 'vue'
import { useTenantStore } from '~/stores/tenant'

function primaryHex(branding: { theme?: { colors?: { primary?: { main?: string } } } } | undefined): string {
  const m = branding?.theme?.colors?.primary?.main
  return typeof m === 'string' && m.startsWith('#') ? m : '#111827'
}

export default defineNuxtPlugin(() => {
  const tenantStore = useTenantStore()
  const config = useRuntimeConfig()

  const manifestHref = computed(() => {
    if (import.meta.dev) return '/manifest.webmanifest'
    const supabaseUrl = String(config.public.supabaseUrl ?? '').replace(/\/$/, '')
    if (!supabaseUrl) return '/manifest.webmanifest'
    const host = typeof window !== 'undefined' ? window.location.host : ''
    if (!host) return '/manifest.webmanifest'
    const q = new URLSearchParams({ host })
    return `${supabaseUrl}/functions/v1/tenant_web_manifest?${q.toString()}`
  })

  useHead(() => {
    const b = tenantStore.tenant?.branding
    const themeColor = primaryHex(b)
    const shortTitle = (b?.pwa?.shortName ?? b?.shortName ?? tenantStore.tenant?.name ?? 'dGuild').slice(0, 64)
    return {
      meta: [
        { name: 'theme-color', content: themeColor },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: shortTitle },
      ],
      link: [
        { rel: 'apple-touch-icon', href: '/favicon.svg' },
        { rel: 'manifest', href: manifestHref.value },
      ],
    }
  })
})
