import { hexToRgba } from './color-utils'

export type GlowIntensity = 'none' | 'subtle' | 'medium' | 'strong'

const SCALE: Record<GlowIntensity, number> = {
  none: 0,
  subtle: 1,
  medium: 1.6,
  strong: 2.5,
}

export function buildGlowShadows(primaryHex: string, intensity: GlowIntensity | undefined): { glow: string; glowHover: string } {
  const key = intensity ?? 'subtle'
  const scale = SCALE[key] ?? 1
  if (scale <= 0) {
    return { glow: 'none', glowHover: 'none' }
  }
  const blur = 20 * scale
  const blurHover = 40 * scale
  const a = Math.min(0.28 * (0.85 + scale * 0.05), 0.48)
  const aHover = Math.min(0.55 * (0.85 + scale * 0.05), 0.72)
  return {
    glow: `0 0 ${blur}px ${hexToRgba(primaryHex, a)}`,
    glowHover: `0 0 ${blurHover}px ${hexToRgba(primaryHex, aHover)}`,
  }
}
