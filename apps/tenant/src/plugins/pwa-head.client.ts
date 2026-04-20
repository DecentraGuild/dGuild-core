import { useTenantStore } from '~/stores/tenant'

function primaryHex(branding: { theme?: { colors?: { primary?: { main?: string } } } } | undefined): string {
  const m = branding?.theme?.colors?.primary?.main
  return typeof m === 'string' && m.startsWith('#') ? m : '#111827'
}

export default defineNuxtPlugin(() => {
  const tenantStore = useTenantStore()

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
      link: [{ rel: 'apple-touch-icon', href: '/favicon.svg' }],
    }
  })
})
