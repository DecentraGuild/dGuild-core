/**
 * Tier quotes multiply DB `numeric` unit_price by duration multipliers in JS.
 * Quantized DB values (e.g. 6 fractional digits) plus IEEE floats produce dust
 * like 48.999996 for a 49 USDC/yr catalogue price. Catalogue amounts use cent precision.
 */
export function roundUsdcCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
