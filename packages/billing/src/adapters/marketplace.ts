/**
 * Marketplace pricing adapter. Resolves mints_count, custom_currencies, monetize_storefront.
 */
import type { PricingAdapter } from '../types.js'

export const marketplaceAdapter: PricingAdapter = {
  productKey: 'marketplace',
  async resolveUsage({ tenantId, db }) {
    const [{ data: scopeRows }, { data: settingsRow }] = await Promise.all([
      db.from('marketplace_mint_scope').select('mint').eq('tenant_id', tenantId),
      db.from('marketplace_settings').select('settings').eq('tenant_id', tenantId).maybeSingle(),
    ])
    const mintsCount = (scopeRows ?? []).length
    const settings = (settingsRow as { settings?: Record<string, unknown> } | null)?.settings ?? {}
    const customCurrencies = Number(settings.customCurrenciesCount ?? settings.custom_currencies_count ?? 0)
    const monetizeStorefront = settings.monetizeStorefront ?? settings.monetize_storefront ? 1 : 0
    return {
      mints_count: mintsCount,
      base_currencies_count: 4,
      custom_currencies: customCurrencies,
      monetize_storefront: monetizeStorefront,
    }
  },
  getMeterDefinitions() {
    return [
      { meterKey: 'mints_count', unit: 'mints' },
      { meterKey: 'custom_currencies', unit: 'currencies' },
      { meterKey: 'monetize_storefront' },
    ]
  },
}
