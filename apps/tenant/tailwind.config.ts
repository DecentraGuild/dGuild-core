import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'
import plugin from 'tailwindcss/plugin'

const themeTokens = plugin(({ addUtilities }) => {
  addUtilities({
    '.bg-theme-primary': { 'background-color': 'var(--theme-bg-primary)' },
    '.bg-theme-secondary': { 'background-color': 'var(--theme-bg-secondary)' },
    '.bg-theme-card': { 'background-color': 'var(--theme-bg-card)' },
    '.bg-theme-muted': { 'background-color': 'var(--theme-bg-muted)' },
    '.text-theme-primary': { 'color': 'var(--theme-text-primary)' },
    '.text-theme-secondary': { 'color': 'var(--theme-text-secondary)' },
    '.text-theme-muted': { 'color': 'var(--theme-text-muted)' },
    '.text-theme-brand': { 'color': 'var(--theme-primary)' },
    '.text-theme-brand-secondary': { 'color': 'var(--theme-secondary)' },
    '.border-theme': { 'border-color': 'var(--theme-border)' },
    '.border-theme-light': { 'border-color': 'var(--theme-border-light)' },
    '.border-theme-brand': { 'border-color': 'var(--theme-primary)' },
    '.rounded-theme-sm': { 'border-radius': 'var(--theme-radius-sm)' },
    '.rounded-theme-md': { 'border-radius': 'var(--theme-radius-md)' },
    '.rounded-theme-lg': { 'border-radius': 'var(--theme-radius-lg)' },
    '.shadow-theme-glow': { 'box-shadow': 'var(--theme-shadow-glow)' },
    '.shadow-theme-card': { 'box-shadow': 'var(--theme-shadow-card)' },
    '.gradient-brand': { 'background': 'var(--theme-gradient-primary)' },
    '.text-gradient-brand': {
      'background': 'var(--theme-gradient-primary)',
      '-webkit-background-clip': 'text',
      'background-clip': 'text',
      '-webkit-text-fill-color': 'transparent',
      'color': 'var(--theme-primary)',
    },
  })
})

export default {
  content: [
    './src/components/**/*.{vue,js,ts}',
    './src/layouts/**/*.vue',
    './src/pages/**/*.vue',
    './src/plugins/**/*.{js,ts}',
    './src/app.vue',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        brand: { DEFAULT: 'hsl(var(--brand))', foreground: 'hsl(var(--brand-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
    },
  },
  plugins: [tailwindcssAnimate, themeTokens],
} satisfies Config
