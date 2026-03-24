/**
 * Theme store - applies tenant theme to document via CSS variables.
 * Plain Pinia, no Nuxt dependency.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TenantTheme, TenantBranding } from '@decentraguild/core'
import { DEFAULT_TENANT_THEME } from '../theme/defaults'
import { hexToHsl, lightenHex, darkenHex, contrastColor } from '../theme/color-utils'
import { buildGlowShadows } from '../theme/glow'

export function mergeTheme(base: TenantTheme, override: Partial<TenantTheme>): TenantTheme {
  const colors: NonNullable<TenantTheme['colors']> = {
    primary: { ...base.colors?.primary, ...override.colors?.primary, main: (override.colors?.primary?.main ?? base.colors?.primary?.main ?? '#dc2626') as string },
    secondary: { ...base.colors?.secondary, ...override.colors?.secondary, main: (override.colors?.secondary?.main ?? base.colors?.secondary?.main ?? '#ea580c') as string },
    background: { ...base.colors?.background, ...override.colors?.background },
    text: { ...base.colors?.text, ...override.colors?.text },
    border: { ...base.colors?.border, ...override.colors?.border },
    status: { ...base.colors?.status, ...override.colors?.status },
    trade: { ...base.colors?.trade, ...override.colors?.trade },
  }
  return {
    ...base,
    ...override,
    colors,
    fontSize: { ...base.fontSize, ...override.fontSize },
    borderRadius: { ...base.borderRadius, ...override.borderRadius },
    borderWidth: { ...base.borderWidth, ...override.borderWidth },
    shadows: { ...base.shadows, ...override.shadows },
    gradients: { ...base.gradients, ...override.gradients },
    fonts: { ...base.fonts, ...override.fonts },
    effects: { ...base.effects, ...override.effects },
  }
}

function fontStackCss(stack: string[] | undefined): string {
  if (!stack?.length) return ''
  return stack.map((f) => (f.includes(' ') ? `"${f.replace(/"/g, '\\"')}"` : f)).join(', ')
}

export function themeToCssVars(theme: TenantTheme): Record<string, string> {
  const colors = theme.colors ?? {}
  const fontSize = theme.fontSize ?? {}
  const borderRadius = theme.borderRadius ?? {}
  const borderWidth = theme.borderWidth ?? {}
  const shadows = theme.shadows ?? {}
  const gradients = theme.gradients ?? {}
  const fonts = theme.fonts ?? {}

  const primaryMain = colors.primary?.main ?? ''
  const primaryHover = colors.primary?.hover ?? (primaryMain ? darkenHex(primaryMain, 0.08) : '')
  const primaryLight = colors.primary?.light ?? (primaryMain ? lightenHex(primaryMain, 0.2) : '')
  const primaryDark = colors.primary?.dark ?? (primaryMain ? darkenHex(primaryMain, 0.15) : '')
  const sans = fontStackCss(fonts.primary)
  const mono = fontStackCss(fonts.mono)

  return {
    '--theme-primary': primaryMain,
    '--theme-primary-hover': primaryHover,
    '--theme-primary-light': primaryLight,
    '--theme-primary-dark': primaryDark,
    '--theme-primary-inverse': primaryMain ? contrastColor(primaryMain) : '',
    '--theme-secondary': colors.secondary?.main ?? '',
    '--theme-secondary-hover': colors.secondary?.hover ?? '',
    '--theme-secondary-light': colors.secondary?.light ?? '',
    '--theme-secondary-dark': colors.secondary?.dark ?? '',
    '--theme-secondary-inverse': colors.secondary?.main ? contrastColor(colors.secondary.main) : '',
    '--theme-bg-primary': colors.background?.primary ?? '',
    '--theme-bg-secondary': colors.background?.secondary ?? '',
    '--theme-bg-card': colors.background?.card ?? '',
    '--theme-bg-muted': colors.background?.muted ?? '',
    '--theme-backdrop': colors.background?.backdrop ?? '',
    '--theme-text-primary': colors.text?.primary ?? '',
    '--theme-text-secondary': colors.text?.secondary ?? '',
    '--theme-text-muted': colors.text?.muted ?? '',
    '--theme-border': colors.border?.default ?? '',
    '--theme-border-light': colors.border?.light ?? '',
    '--theme-success': colors.status?.success ?? '',
    '--theme-error': colors.status?.error ?? '',
    '--theme-text-error': colors.status?.error ?? '',
    '--theme-warning': colors.status?.warning ?? '',
    '--theme-status-success': colors.status?.success ?? '',
    '--theme-status-error': colors.status?.error ?? '',
    '--theme-status-warning': colors.status?.warning ?? '',
    '--theme-destructive': (colors.status?.destructive ?? colors.status?.error) ?? '',
    '--theme-trade-buy': colors.trade?.buy ?? colors.status?.error ?? '',
    '--theme-trade-buy-hover': colors.trade?.buyHover ?? '',
    '--theme-trade-buy-light': colors.trade?.buyLight ?? '',
    '--theme-trade-sell': colors.trade?.sell ?? colors.status?.success ?? '',
    '--theme-trade-sell-hover': colors.trade?.sellHover ?? '',
    '--theme-trade-sell-light': colors.trade?.sellLight ?? '',
    '--theme-trade-trade': colors.trade?.trade ?? colors.status?.warning ?? '',
    '--theme-trade-trade-hover': colors.trade?.tradeHover ?? '',
    '--theme-trade-trade-light': colors.trade?.tradeLight ?? '',
    ...(sans ? { '--theme-font-sans': sans } : {}),
    ...(mono ? { '--theme-font-mono': mono } : {}),
    '--theme-font-xs': fontSize.xs ?? '',
    '--theme-font-sm': fontSize.sm ?? '',
    '--theme-font-base': fontSize.base ?? '',
    '--theme-font-lg': fontSize.lg ?? '',
    '--theme-font-xl': fontSize.xl ?? '',
    '--theme-font-2xl': fontSize['2xl'] ?? '',
    '--theme-font-3xl': fontSize['3xl'] ?? '',
    '--theme-font-4xl': fontSize['4xl'] ?? '',
    '--theme-font-5xl': fontSize['5xl'] ?? '',
    '--theme-radius-sm': borderRadius.sm ?? '',
    '--theme-radius-md': borderRadius.md ?? '',
    '--theme-radius-lg': borderRadius.lg ?? '',
    '--theme-radius-xl': borderRadius.xl ?? '',
    '--theme-radius-full': borderRadius.full ?? '',
    '--theme-border-thin': borderWidth.thin ?? '',
    '--theme-border-medium': borderWidth.medium ?? '',
    '--theme-border-thick': borderWidth.thick ?? '',
    '--theme-shadow-glow': shadows.glow ?? '',
    '--theme-shadow-glow-hover': shadows.glowHover ?? '',
    '--theme-shadow-card': shadows.card ?? '',
    '--theme-gradient-primary': gradients.primary ?? '',

    // Shadcn/Tailwind (HSL). --secondary / --accent are surfaces (elevated/muted), not brand secondary.
    ...(colors.background?.primary ? { '--background': hexToHsl(colors.background.primary) } : {}),
    ...(colors.text?.primary ? { '--foreground': hexToHsl(colors.text.primary) } : {}),
    ...(colors.background?.card ? { '--card': hexToHsl(colors.background.card) } : {}),
    ...(colors.text?.primary ? { '--card-foreground': hexToHsl(colors.text.primary) } : {}),
    ...(colors.background?.card ? { '--popover': hexToHsl(colors.background.card) } : {}),
    ...(colors.text?.primary ? { '--popover-foreground': hexToHsl(colors.text.primary) } : {}),
    ...(primaryMain ? { '--primary': hexToHsl(primaryMain) } : {}),
    ...(primaryMain ? { '--primary-foreground': hexToHsl(contrastColor(primaryMain)) } : {}),
    ...(colors.secondary?.main
      ? {
          '--brand': hexToHsl(colors.secondary.main),
          '--brand-foreground': hexToHsl(contrastColor(colors.secondary.main)),
        }
      : {}),
    ...(colors.background?.secondary ? { '--secondary': hexToHsl(colors.background.secondary) } : {}),
    ...(colors.text?.primary ? { '--secondary-foreground': hexToHsl(colors.text.primary) } : {}),
    ...(colors.background?.muted ? { '--muted': hexToHsl(colors.background.muted) } : {}),
    ...(colors.text?.muted ? { '--muted-foreground': hexToHsl(colors.text.muted) } : {}),
    ...(colors.background?.secondary ? { '--accent': hexToHsl(colors.background.secondary) } : {}),
    ...(colors.text?.primary ? { '--accent-foreground': hexToHsl(colors.text.primary) } : {}),
    ...((colors.status?.destructive ?? colors.status?.error)
      ? { '--destructive': hexToHsl(colors.status.destructive ?? colors.status.error!) } : {}),
    ...((colors.status?.destructive ?? colors.status?.error)
      ? { '--destructive-foreground': hexToHsl(contrastColor(colors.status.destructive ?? colors.status.error!)) } : {}),
    ...(colors.border?.default ? { '--border': hexToHsl(colors.border.default) } : {}),
    ...(colors.background?.muted ? { '--input': hexToHsl(colors.background.muted) } : {}),
    ...(colors.primary?.main ? { '--ring': hexToHsl(colors.primary.main) } : {}),
    ...(borderRadius.md ? { '--radius': borderRadius.md } : {}),
  }
}

export const useThemeStore = defineStore('theme', () => {
  const currentTheme = ref<TenantTheme>(DEFAULT_TENANT_THEME)
  const branding = ref<{ logo?: string; name?: string; shortName?: string }>({})

  const cssVars = computed(() => themeToCssVars(currentTheme.value))

  function loadTheme(theme: Partial<TenantTheme>, brandingOverride?: Partial<TenantBranding>) {
    const merged = mergeTheme(DEFAULT_TENANT_THEME, theme ?? {})
    delete merged.spacing

    // Always recompute glow/gradient from the resolved primary so they stay
    // in sync with the tenant's brand color rather than the hardcoded default.
    const primary = merged.colors?.primary?.main
    const brandSecondary = merged.colors?.secondary?.main
    const intensity = merged.effects?.glowIntensity
    if (primary) {
      const primaryDark = merged.colors?.primary?.dark ?? darkenHex(primary, 0.15)
      const brandMid = brandSecondary ?? '#ea580c'
      const { glow, glowHover } = buildGlowShadows(primary, intensity)

      merged.shadows = {
        ...merged.shadows,
        glow,
        glowHover,
        card: merged.shadows?.card ?? '0 8px 32px rgba(0, 0, 0, 0.4)',
      }
      merged.gradients = {
        primary: `linear-gradient(135deg, ${primary} 0%, ${brandMid} 50%, ${primaryDark} 100%)`,
      }
    }

    currentTheme.value = merged
    if (brandingOverride) {
      branding.value = {
        logo: brandingOverride.logo,
        name: brandingOverride.name,
        shortName: brandingOverride.shortName,
      }
    }
    applyThemeToDocument()
  }

  function applyThemeToDocument() {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const vars = themeToCssVars(currentTheme.value)
    for (const [prop, value] of Object.entries(vars)) {
      if (value) root.style.setProperty(prop, value)
    }
    const patternSize = currentTheme.value.effects?.patternSize ?? 24
    root.style.setProperty('--theme-effect-pattern-size', `${patternSize}px`)
  }

  return {
    currentTheme,
    branding,
    cssVars,
    loadTheme,
    applyThemeToDocument,
  }
})
