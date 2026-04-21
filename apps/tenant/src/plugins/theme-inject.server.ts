/**
 * Injects tenant theme CSS variables into the document head during SSR.
 * Ensures first paint uses tenant branding instead of default, avoiding theme flash.
 */
import { useThemeStore, themeToCssVars } from '@decentraguild/ui'
import { useTenantStore } from '~/stores/tenant'
import { resolveTenantFavicon } from '~/utils/tenantFavicon'

export default defineNuxtPlugin(() => {
  if (import.meta.client) return

  const themeStore = useThemeStore()
  const vars = themeToCssVars(themeStore.currentTheme)

  const patternSize = themeStore.currentTheme.effects?.patternSize ?? 24
  vars['--theme-effect-pattern-size'] = `${patternSize}px`

  const lines = Object.entries(vars)
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')

  const tenantStore = useTenantStore()
  const branding = tenantStore.tenant?.branding
  const { href: iconHref, type: iconType } = resolveTenantFavicon(branding)

  const head: Parameters<typeof useHead>[0] = {}

  if (lines.length > 0) {
    head.style = [
      {
        textContent: `:root {\n${lines}\n}`,
        tagPriority: 'high',
      },
    ]
  }

  if (tenantStore.tenant) {
    head.link = [
      { key: 'favicon', rel: 'icon', type: iconType, href: iconHref },
      { key: 'apple-touch-icon', rel: 'apple-touch-icon', href: iconHref },
    ]
  }

  if (Object.keys(head).length === 0) return

  useHead(head)
})
