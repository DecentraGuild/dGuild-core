/**
 * Shared color math utilities for theme derivation.
 * Pure functions; no side-effects or external dependencies.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export function parseHex(hex: string): Rgb | null {
  const s = String(hex).trim().replace(/^#/, '')
  if (s.length === 6 && /^[0-9a-fA-F]{6}$/.test(s)) {
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
    }
  }
  if (s.length === 3 && /^[0-9a-fA-F]{3}$/.test(s)) {
    return {
      r: parseInt(s[0] + s[0], 16),
      g: parseInt(s[1] + s[1], 16),
      b: parseInt(s[2] + s[2], 16),
    }
  }
  return null
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.round(Math.max(0, Math.min(255, n)))
  return '#' + [r, g, b].map(clamp).map((n) => n.toString(16).padStart(2, '0')).join('')
}

/** Lighten a hex color by an amount 0–1 (towards white). */
export function lightenHex(hex: string, amount: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const { r, g, b } = rgb
  return toHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  )
}

/** Darken a hex color by an amount 0–1 (towards black). */
export function darkenHex(hex: string, amount: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const { r, g, b } = rgb
  return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount))
}

/** Mix two hex colors. amount 0 = a, 1 = b. */
export function mixHex(a: string, b: string, amount: number): string {
  const ra = parseHex(a)
  const rb = parseHex(b)
  if (!ra || !rb) return amount >= 0.5 ? b : a
  return toHex(
    ra.r + (rb.r - ra.r) * amount,
    ra.g + (rb.g - ra.g) * amount,
    ra.b + (rb.b - ra.b) * amount,
  )
}

/** Relative luminance per WCAG 2.1. */
function luminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return 0
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

/**
 * Returns '#ffffff' or '#000000' whichever has the higher contrast
 * ratio against the given background color.
 */
export function contrastColor(bg: string): string {
  const lum = luminance(bg)
  const contrastWhite = (lum + 0.05) > 0 ? (1.05) / (lum + 0.05) : 21
  return contrastWhite >= 4.5 ? '#ffffff' : '#000000'
}

/**
 * Convert hex to HSL values for shadcn/Tailwind.
 * Returns "H S% L%" (no hsl() wrapper) for use with hsl(var(--name)).
 */
export function hexToHsl(hex: string): string {
  const rgb = parseHex(hex)
  if (!rgb) return ''
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  const hDeg = Math.round(h * 360)
  const sPct = Math.round(s * 100)
  const lPct = Math.round(l * 100)
  return `${hDeg} ${sPct}% ${lPct}%`
}

/** Build an rgba string from a hex color and an alpha. */
export function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return `rgba(0, 0, 0, ${alpha})`
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

/**
 * True if the color is perceived as "dark" (luminance < 0.18).
 * Useful for deciding whether to lighten or darken derived tones.
 */
export function isDark(hex: string): boolean {
  return luminance(hex) < 0.18
}

/** Border radius presets: index 0 = sharp, 4 = fully round. */
export const BORDER_RADIUS_PRESETS: Array<Record<string, string>> = [
  { sm: '0', md: '0', lg: '0', xl: '0', full: '0' },
  { sm: '0.2rem', md: '0.3rem', lg: '0.4rem', xl: '0.5rem', full: '9999px' },
  { sm: '0.375rem', md: '0.5rem', lg: '0.75rem', xl: '1rem', full: '9999px' },
  { sm: '0.5rem', md: '0.75rem', lg: '1rem', xl: '1.25rem', full: '9999px' },
  { sm: '0.75rem', md: '1rem', lg: '1.25rem', xl: '1.5rem', full: '9999px' },
]

export function getRadiusLevelFromTheme(theme: { borderRadius?: Record<string, string> }): number {
  const md = theme.borderRadius?.md ?? ''
  for (let i = 0; i < BORDER_RADIUS_PRESETS.length; i++) {
    if (BORDER_RADIUS_PRESETS[i].md === md) return i
  }
  return 2
}

/** Parse a rem string to a number (e.g. "1.25rem" -> 1.25). */
export function parseRem(value: string): number {
  const s = String(value).trim()
  const m = s.match(/^([\d.]+)\s*rem$/)
  if (m) return Number(m[1])
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 1
}
