/**
 * Injects tenant theme CSS variables into the document head during SSR.
 * Ensures first paint uses tenant branding instead of default, avoiding theme flash.
 */
import { useThemeStore, themeToCssVars } from '@decentraguild/ui'

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

  if (lines.length === 0) return

  useHead({
    style: [
      {
        textContent: `:root {\n${lines}\n}`,
        tagPriority: 'high',
      },
    ],
  })
})
