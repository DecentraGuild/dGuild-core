/**
 * Single source of truth for tenant theme CSS variables (names + purpose).
 * Keep in sync with themeToCssVars in ../stores/theme.ts.
 */

export type ThemeTokenGroup = 'brand' | 'surface' | 'text' | 'border' | 'semantic' | 'trade' | 'typography' | 'layout' | 'effect'

export interface ThemeTokenMeta {
  name: string
  group: ThemeTokenGroup
  description: string
}

export const THEME_CSS_TOKENS: ThemeTokenMeta[] = [
  { name: '--theme-primary', group: 'brand', description: 'Main actions, links, primary glow source' },
  { name: '--theme-primary-hover', group: 'brand', description: 'Primary hover state' },
  { name: '--theme-primary-light', group: 'brand', description: 'Primary tint (focus rings)' },
  { name: '--theme-primary-dark', group: 'brand', description: 'Primary shade' },
  { name: '--theme-primary-inverse', group: 'brand', description: 'Text/icon on primary background' },
  { name: '--theme-secondary', group: 'brand', description: 'Second brand colour; outline buttons, gradient mid' },
  { name: '--theme-secondary-hover', group: 'brand', description: 'Brand secondary hover' },
  { name: '--theme-secondary-light', group: 'brand', description: 'Brand secondary tint' },
  { name: '--theme-secondary-dark', group: 'brand', description: 'Brand secondary shade' },
  { name: '--theme-secondary-inverse', group: 'brand', description: 'Text on brand secondary fill' },
  { name: '--brand', group: 'brand', description: 'Tailwind/shadcn HSL pair for bg-brand (same hue as --theme-secondary)' },
  { name: '--brand-foreground', group: 'brand', description: 'Foreground on bg-brand' },
  { name: '--theme-bg-primary', group: 'surface', description: 'Page background' },
  { name: '--theme-bg-secondary', group: 'surface', description: 'Elevated panels (Shadcn --secondary/--accent surfaces map here)' },
  { name: '--theme-bg-card', group: 'surface', description: 'Cards, modals' },
  { name: '--theme-bg-muted', group: 'surface', description: 'Muted strips, editors' },
  { name: '--theme-backdrop', group: 'surface', description: 'Modal overlay' },
  { name: '--theme-text-primary', group: 'text', description: 'Main body text' },
  { name: '--theme-text-secondary', group: 'text', description: 'Secondary text' },
  { name: '--theme-text-muted', group: 'text', description: 'Captions, hints' },
  { name: '--theme-border', group: 'border', description: 'Default borders' },
  { name: '--theme-border-light', group: 'border', description: 'Softer borders' },
  { name: '--theme-success', group: 'semantic', description: 'Positive / success' },
  { name: '--theme-error', group: 'semantic', description: 'Errors, negative marketplace side' },
  { name: '--theme-warning', group: 'semantic', description: 'Warnings' },
  { name: '--theme-destructive', group: 'semantic', description: 'Destructive actions' },
  { name: '--theme-trade-buy', group: 'trade', description: 'Buy side colour (marketplace)' },
  { name: '--theme-trade-sell', group: 'trade', description: 'Sell side colour' },
  { name: '--theme-trade-trade', group: 'trade', description: 'Neutral trade accent' },
  { name: '--theme-font-sans', group: 'typography', description: 'Body font stack' },
  { name: '--theme-font-mono', group: 'typography', description: 'Monospace stack' },
  { name: '--theme-font-xs', group: 'typography', description: 'Size scale xs–5xl' },
  { name: '--theme-space-xs', group: 'layout', description: 'Spacing scale' },
  { name: '--theme-radius-sm', group: 'layout', description: 'Radius scale' },
  { name: '--theme-border-thin', group: 'layout', description: 'Border width scale' },
  { name: '--theme-shadow-glow', group: 'effect', description: 'Primary-coloured glow (intensity from theme.effects)' },
  { name: '--theme-gradient-primary', group: 'effect', description: 'Brand gradient: primary → secondary → primary dark' },
  { name: '--theme-effect-pattern-size', group: 'effect', description: 'Background pattern tile size' },
]
