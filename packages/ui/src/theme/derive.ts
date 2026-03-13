/**
 * Theme derivation engine.
 *
 * Accepts a minimal set of inputs from the admin and produces a complete
 * TenantTheme. This centralises all derivation logic so it applies
 * consistently whether the theme is built in the admin editor or loaded
 * from a stored config.
 *
 * Rules:
 *   - If a full theme is stored (all keys present), it is used as-is after
 *     merging with defaults via mergeTheme().
 *   - deriveTheme() is called when only the simple inputs are available,
 *     producing a full theme that can then be stored or overridden.
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

export interface ThemeInputs {
  /** Primary brand color (buttons, links, accents). */
  primary: string
  /** Page background color. */
  background: string
  /** Primary text/foreground color. */
  foreground: string
  /** Muted text color; derived when omitted. */
  mutedForeground?: string
  /** Card/popover surface color; derived from background when omitted. */
  card?: string
  /** Secondary surface (buttons, ghost hover); derived when omitted. */
  secondary?: string
  /** Accent highlight color; derived from primary when omitted. */
  accent?: string
  /** Destructive/danger actions; defaults to error when omitted. */
  destructive?: string
  /** Override border color; auto-derived when omitted. */
  border?: string
  status?: {
    success?: string
    error?: string
    warning?: string
    info?: string
  }
  trade?: {
    buy?: string
    sell?: string
    trade?: string
  }
  /** 0 (sharp) – 4 (fully round). Default: 3. */
  radiusLevel?: number
  /** 0 (tight, ~0.5rem base) – 10 (loose, ~2rem base). Default: 5. */
  spacingLevel?: number
  /** Border width in pixels (1–10). Default: 1. */
  borderWidthPx?: number
  /** Font family stack for body text. */
  fontPrimary?: string[]
  /** Font family stack for monospace. */
  fontMono?: string[]
}

function fontMd(spacingLevel: number): number {
  return 0.5 + (spacingLevel / 10) * 1.5
}

/**
 * Derive a complete TenantTheme from minimal inputs.
 * All fields are computed; callers can override individual fields
 * by merging with DEFAULT_TENANT_THEME afterwards.
 */
export function deriveTheme(inputs: ThemeInputs): TenantTheme {
  const {
    primary,
    background: bg,
    foreground: fg,
    mutedForeground: rawMuted,
    card: cardOverride,
    secondary: secondaryOverride,
    accent: accentOverride,
    destructive: destructiveOverride,
    border: borderOverride,
    status = {},
    trade = {},
    radiusLevel = 3,
    spacingLevel = 5,
    borderWidthPx = 1,
    fontPrimary = ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
    fontMono = ['JetBrains Mono', 'Fira Code', 'monospace'],
  } = inputs

  const textMuted = rawMuted ?? (isDark(fg) ? lightenHex(fg, 0.55) : darkenHex(fg, 0.45))
  const textSecondary = mixHex(fg, textMuted, 0.5)

  // Derive background scale
  const bgSecondaryDerived = isDark(bg) ? lightenHex(bg, 0.04) : darkenHex(bg, 0.04)
  const bgCardDerived = isDark(bg) ? lightenHex(bg, 0.07) : darkenHex(bg, 0.07)
  const bgMuted = isDark(bg) ? lightenHex(bg, 0.12) : darkenHex(bg, 0.12)
  const backdrop = hexToRgba(bg, 0.78)
  const bgSecondary = secondaryOverride ?? bgSecondaryDerived
  const bgCard = cardOverride ?? bgCardDerived

  // Border – derived from background unless explicitly provided
  const borderDefault = borderOverride ?? (isDark(bg) ? lightenHex(bg, 0.15) : darkenHex(bg, 0.15))
  const borderLight = isDark(bg) ? lightenHex(borderDefault, 0.08) : darkenHex(borderDefault, 0.08)

  // Primary scale
  const primaryHover = darkenHex(primary, 0.08)
  const primaryLight = lightenHex(primary, 0.2)
  const primaryDark = darkenHex(primary, 0.15)

  // Secondary (brand) = darkened primary
  const secondary = darkenHex(primary, 0.25)
  const secondaryHover = darkenHex(secondary, 0.08)
  const secondaryLight = lightenHex(secondary, 0.2)
  const secondaryDark = darkenHex(secondary, 0.15)

  // Accent = override or primary
  const accent = accentOverride ?? primary
  const accentHover = darkenHex(accent, 0.1)

  // Status
  const success = status.success ?? '#00951a'
  const error = status.error ?? '#cf0000'
  const warning = status.warning ?? '#ff6b35'
  const info = status.info ?? '#00d4ff'
  const destructive = destructiveOverride ?? error

  // Trade derives from status: Sell=Positive, Buy=Negative, Trade=Warning
  const buy = trade.buy ?? error
  const sell = trade.sell ?? success
  const tradeTrade = trade.trade ?? warning

  // Shadows – glow derives from primary color
  const glowRgba = hexToRgba(primary, 0.28)
  const glowHoverRgba = hexToRgba(primary, 0.55)

  // Gradients – derive from primary scale
  const gradientPrimary = `linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%)`
  const gradientSecondary = `linear-gradient(135deg, ${warning} 0%, ${lightenHex(warning, 0.2)} 100%)`
  const gradientAccent = `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`

  // Spacing scale
  const base = fontMd(spacingLevel)
  const r = (m: number) => `${(base * m).toFixed(3).replace(/\.?0+$/, '')}rem`

  // Border radius
  const radiusPreset = BORDER_RADIUS_PRESETS[Math.max(0, Math.min(4, radiusLevel))]

  // Border width
  const px = Math.max(1, Math.min(10, borderWidthPx))

  const colors: TenantThemeColors = {
    primary: { main: primary, hover: primaryHover, light: primaryLight, dark: primaryDark },
    secondary: { main: secondary, hover: secondaryHover, light: secondaryLight, dark: secondaryDark },
    accent: { main: accent, hover: accentHover },
    background: { primary: bg, secondary: bgSecondary, card: bgCard, muted: bgMuted, backdrop },
    text: { primary: fg, secondary: textSecondary, muted: textMuted },
    border: { default: borderDefault, light: borderLight },
    status: { success, error, warning, info, destructive },
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
      swap: accent,
      swapHover: accentHover,
      swapLight: lightenHex(accent, 0.2),
    },
    window: {
      background: bgCard,
      border: borderDefault,
      header: bgSecondary,
    },
  }

  return {
    colors,
    shadows: {
      glow: `0 0 20px ${glowRgba}`,
      glowHover: `0 0 40px ${glowHoverRgba}`,
      card: '0 8px 32px rgba(0, 0, 0, 0.4)',
    },
    gradients: {
      primary: gradientPrimary,
      secondary: gradientSecondary,
      accent: gradientAccent,
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
    spacing: {
      xs: r(0.5),
      sm: r(0.75),
      md: r(1),
      lg: r(1.5),
      xl: r(2),
      '2xl': r(3),
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
      glowIntensity: 'subtle',
    },
  }
}

/**
 * Extract ThemeInputs from an existing TenantTheme.
 * Used to populate the admin editor from a stored theme.
 */
export function themeToInputs(theme: TenantTheme): ThemeInputs {
  const c = theme.colors ?? {}
  const spacing = theme.spacing ?? {}
  const borderWidth = theme.borderWidth ?? {}

  const mdRem = parseFloat(spacing.md ?? '1')
  const spacingLevel = Math.round(Math.max(0, Math.min(10, ((mdRem - 0.5) / 1.5) * 10)))

  const bwMatch = (borderWidth.thin ?? '1px').match(/^(\d+)px$/)
  const borderWidthPx = bwMatch ? Math.min(10, Math.max(1, parseInt(bwMatch[1], 10))) : 1

  const radiusLevel = getRadiusLevelFromTheme(theme)

  return {
    primary: c.primary?.main ?? '#00951a',
    background: c.background?.primary ?? '#0a0a0f',
    foreground: c.text?.primary ?? '#ffffff',
    mutedForeground: c.text?.muted,
    card: c.background?.card,
    secondary: c.background?.secondary,
    accent: c.accent?.main,
    destructive: c.status?.destructive,
    border: c.border?.default,
    status: c.status,
    radiusLevel,
    spacingLevel,
    borderWidthPx,
    fontPrimary: theme.fonts?.primary,
    fontMono: theme.fonts?.mono,
  }
}
