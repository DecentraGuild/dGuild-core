/**
 * Theme derivation engine.
 *
 * Accepts a minimal set of inputs from the admin and produces a complete
 * TenantTheme. This centralises all derivation logic so it applies
 * consistently whether the theme is built in the admin editor or loaded
 * from a stored config.
 */

import type { TenantTheme, TenantThemeColors } from '@decentraguild/core'
import {
  lightenHex,
  darkenHex,
  mixHex,
  hexToRgba,
  isDark,
  BORDER_RADIUS_PRESETS,
  getRadiusLevelFromTheme,
} from './color-utils'
import { buildGlowShadows, type GlowIntensity } from './glow'

export interface ThemeInputs {
  primary: string
  /** Second brand colour (gradients, secondary actions). */
  brandSecondary: string
  background: string
  foreground: string
  mutedForeground?: string
  card?: string
  /** Elevated / panel surface (maps to background.secondary). Not brand secondary. */
  elevatedSurface?: string
  destructive?: string
  border?: string
  status?: {
    success?: string
    error?: string
    warning?: string
  }
  trade?: {
    buy?: string
    sell?: string
    trade?: string
  }
  radiusLevel?: number
  borderWidthPx?: number
  glowIntensity?: GlowIntensity
  fontPrimary?: string[]
  fontMono?: string[]
}

export function deriveTheme(inputs: ThemeInputs): TenantTheme {
  const {
    primary,
    brandSecondary: brandSec,
    background: bg,
    foreground: fg,
    mutedForeground: rawMuted,
    card: cardOverride,
    elevatedSurface: elevatedOverride,
    destructive: destructiveOverride,
    border: borderOverride,
    status = {},
    trade = {},
    radiusLevel = 3,
    borderWidthPx = 1,
    glowIntensity,
    fontPrimary = ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
    fontMono = ['JetBrains Mono', 'Fira Code', 'monospace'],
  } = inputs

  const textMuted = rawMuted ?? (isDark(fg) ? lightenHex(fg, 0.55) : darkenHex(fg, 0.45))
  const textSecondary = mixHex(fg, textMuted, 0.5)

  const bgSecondaryDerived = isDark(bg) ? lightenHex(bg, 0.04) : darkenHex(bg, 0.04)
  const bgCardDerived = isDark(bg) ? lightenHex(bg, 0.07) : darkenHex(bg, 0.07)
  const bgMuted = isDark(bg) ? lightenHex(bg, 0.12) : darkenHex(bg, 0.12)
  const backdrop = hexToRgba(bg, 0.78)
  const bgSecondary = elevatedOverride ?? bgSecondaryDerived
  const bgCard = cardOverride ?? bgCardDerived

  const borderDefault = borderOverride ?? (isDark(bg) ? lightenHex(bg, 0.15) : darkenHex(bg, 0.15))
  const borderLight = isDark(bg) ? lightenHex(borderDefault, 0.08) : darkenHex(borderDefault, 0.08)

  const primaryHover = darkenHex(primary, 0.08)
  const primaryLight = lightenHex(primary, 0.2)
  const primaryDark = darkenHex(primary, 0.15)

  const secondaryHover = darkenHex(brandSec, 0.08)
  const secondaryLight = lightenHex(brandSec, 0.2)
  const secondaryDark = darkenHex(brandSec, 0.15)

  const success = status.success ?? '#22c55e'
  const error = status.error ?? '#ef4444'
  const warning = status.warning ?? '#f59e0b'
  const destructive = destructiveOverride ?? error

  const buy = trade.buy ?? error
  const sell = trade.sell ?? success
  const tradeTrade = trade.trade ?? warning

  const { glow, glowHover } = buildGlowShadows(primary, glowIntensity)

  const primaryDarkForGradient = primaryDark
  const gradientPrimary = `linear-gradient(135deg, ${primary} 0%, ${brandSec} 50%, ${primaryDarkForGradient} 100%)`

  const radiusPreset = BORDER_RADIUS_PRESETS[Math.max(0, Math.min(4, radiusLevel))]

  const px = Math.max(1, Math.min(10, borderWidthPx))

  const colors: TenantThemeColors = {
    primary: { main: primary, hover: primaryHover, light: primaryLight, dark: primaryDark },
    secondary: { main: brandSec, hover: secondaryHover, light: secondaryLight, dark: secondaryDark },
    background: { primary: bg, secondary: bgSecondary, card: bgCard, muted: bgMuted, backdrop },
    text: { primary: fg, secondary: textSecondary, muted: textMuted },
    border: { default: borderDefault, light: borderLight },
    status: { success, error, warning, destructive },
    trade: {
      buy,
      buyHover: darkenHex(buy, 0.1),
      buyLight: lightenHex(buy, 0.15),
      sell,
      sellHover: darkenHex(sell, 0.1),
      sellLight: lightenHex(sell, 0.15),
      trade: tradeTrade,
      tradeHover: darkenHex(tradeTrade, 0.1),
      tradeLight: lightenHex(tradeTrade, 0.15),
    },
  }

  return {
    colors,
    shadows: {
      glow,
      glowHover,
      card: '0 8px 32px rgba(0, 0, 0, 0.4)',
    },
    gradients: {
      primary: gradientPrimary,
    },
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
      '4xl': '2.25rem',
      '5xl': '3rem',
    },
    borderRadius: {
      sm: radiusPreset.sm,
      md: radiusPreset.md,
      lg: radiusPreset.lg,
      xl: radiusPreset.xl,
      full: radiusPreset.full,
    },
    borderWidth: {
      thin: `${px}px`,
      medium: `${Math.min(10, px * 2)}px`,
      thick: `${Math.min(10, px * 4)}px`,
    },
    fonts: {
      primary: fontPrimary,
      mono: fontMono,
    },
    effects: {
      pattern: 'none',
      glowIntensity: glowIntensity ?? 'subtle',
    },
  }
}

export function themeToInputs(theme: TenantTheme): ThemeInputs {
  const c = theme.colors ?? {}
  const borderWidth = theme.borderWidth ?? {}

  const bwMatch = (borderWidth.thin ?? '1px').match(/^(\d+)px$/)
  const borderWidthPx = bwMatch ? Math.min(10, Math.max(1, parseInt(bwMatch[1], 10))) : 1

  const radiusLevel = getRadiusLevelFromTheme(theme)

  const primary = c.primary?.main ?? '#dc2626'
  const brandSecondary = c.secondary?.main ?? '#ea580c'

  return {
    primary,
    brandSecondary,
    background: c.background?.primary ?? '#0c0a0a',
    foreground: c.text?.primary ?? '#fafafa',
    mutedForeground: c.text?.muted,
    card: c.background?.card,
    elevatedSurface: c.background?.secondary,
    destructive: c.status?.destructive,
    border: c.border?.default,
    status: c.status,
    trade: c.trade,
    radiusLevel,
    borderWidthPx,
    glowIntensity: theme.effects?.glowIntensity,
    fontPrimary: theme.fonts?.primary,
    fontMono: theme.fonts?.mono,
  }
}
