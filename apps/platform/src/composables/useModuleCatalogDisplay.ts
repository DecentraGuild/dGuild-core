import { formatUsdc } from '@decentraguild/display'
import type { ModuleCatalogEntry } from '@decentraguild/catalog'

export function useModuleCatalogDisplay() {
  const config = useRuntimeConfig()
  const platformDocsBase = (config.public.platformDocsUrl as string) ?? 'https://dguild.org/docs'

  function docsUrl(entry: ModuleCatalogEntry) {
    return `${platformDocsBase.replace(/\/$/, '')}/modules/${entry.id}`
  }

  function getFromPrice(entry: ModuleCatalogEntry): string | null {
    const p = entry.pricing
    if (!p) return null
    if (p.modelType === 'tiered_addons' && p.tiers?.length) {
      const minPrice = Math.min(...p.tiers.map((t) => t.recurringPrice))
      return `${formatUsdc(minPrice)} USDC/mo`
    }
    if (p.modelType === 'tiered_with_one_time_per_unit' && p.tiers?.length) {
      const baseTier = p.tiers[0]
      if (!baseTier) return null
      const unitLabel = (p.oneTimeUnitName ?? 'unit').toLowerCase()
      if (baseTier.oneTimePerUnit) {
        return `${formatUsdc(baseTier.oneTimePerUnit)} USDC ${unitLabel}`
      }
      if (baseTier.recurringPrice) {
        return `${formatUsdc(baseTier.recurringPrice)} USDC/mo`
      }
      return null
    }
    return null
  }

  return { platformDocsBase, docsUrl, getFromPrice }
}
