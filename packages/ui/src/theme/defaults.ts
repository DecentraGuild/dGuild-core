/**
 * Default tenant theme (dark, red primary, orange brand secondary).
 * Merged with stored tenant branding.theme from the database.
 */

import type { TenantTheme } from '@decentraguild/core'

export const DEFAULT_TENANT_THEME: TenantTheme = {
  colors: {
    primary: {
      main: '#dc2626',
      hover: '#b91c1c',
      light: '#f87171',
      dark: '#991b1b',
    },
    secondary: {
      main: '#ea580c',
      hover: '#c2410c',
      light: '#fb923c',
      dark: '#9a3412',
    },
    background: {
      primary: '#0c0a0a',
      secondary: '#18181b',
      card: '#1c1917',
      muted: '#27272a',
      backdrop: 'rgba(12, 10, 10, 0.78)',
    },
    text: {
      primary: '#fafafa',
      secondary: '#a1a1aa',
      muted: '#71717a',
    },
    border: {
      default: '#3f3f46',
      light: '#52525b',
    },
    status: {
      success: '#22c55e',
      error: '#ef4444',
      warning: '#f59e0b',
      destructive: '#ef4444',
    },
    trade: {
      buy: '#ef4444',
      buyHover: '#dc2626',
      buyLight: '#f87171',
      sell: '#22c55e',
      sellHover: '#16a34a',
      sellLight: '#4ade80',
      trade: '#f59e0b',
      tradeHover: '#d97706',
      tradeLight: '#fbbf24',
    },
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
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.25rem',
    full: '9999px',
  },
  borderWidth: {
    thin: '1px',
    medium: '2px',
    thick: '4px',
  },
  shadows: {
    glow: '0 0 20px rgba(220, 38, 38, 0.28)',
    glowHover: '0 0 40px rgba(220, 38, 38, 0.55)',
    card: '0 8px 32px rgba(0, 0, 0, 0.4)',
  },
  gradients: {
    primary: 'linear-gradient(135deg, #dc2626 0%, #ea580c 50%, #991b1b 100%)',
  },
  fonts: {
    primary: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
    mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
  },
  effects: {
    pattern: 'none',
    patternSize: 24,
    glowIntensity: 'subtle',
  },
}
