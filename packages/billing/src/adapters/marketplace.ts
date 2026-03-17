/**
 * Marketplace pricing adapter. Resolves mints_count, base_currencies_count, custom_currencies, monetize_storefront.
 * Keep two separate meters (base + custom) for billing extend; do not merge.
 */
import type { PricingAdapter } from '../types.js'

const BASE_CURRENCY_MINTS = new Set([
  'So11111111111111111111111111111111111111112',
  '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
])

export const marketplaceAdapter: PricingAdapter = {
  productKey: 'marketplace',
  async resolveUsage({ tenantId, db }) {
    const [{ data: scopeRows }, { data: currencyRows }, { data: settingsRow }] = await Promise.all([
      db.from('marketplace_mint_scope').select('mint').eq('tenant_id', tenantId),
      db.from('marketplace_currencies').select('mint').eq('tenant_id', tenantId),
      db.from('marketplace_settings').select('settings').eq('tenant_id', tenantId).maybeSingle(),
    ])
    const mintsCount = (scopeRows ?? []).length
    const settings = (settingsRow as { settings?: Record<string, unknown> } | null)?.settings ?? {}
    const monetizeStorefront = settings.monetizeStorefront ?? settings.monetize_storefront ? 1 : 0

    const currencyMints = (currencyRows ?? []).map((r: { mint: string }) => r.mint as string)
    const baseCurrenciesCount = currencyMints.filter((m: string) => BASE_CURRENCY_MINTS.has(m)).length
    const customCurrencies = currencyMints.length - baseCurrenciesCount

    return {
      mints_count: mintsCount,
      base_currencies_count: baseCurrenciesCount,
      custom_currencies: customCurrencies,
      monetize_storefront: monetizeStorefront,
    }
  },
  getMeterDefinitions() {
    return [
      { meterKey: 'mints_count', unit: 'mints' },
      { meterKey: 'base_currencies_count', unit: 'currencies' },
      { meterKey: 'custom_currencies', unit: 'currencies' },
      { meterKey: 'monetize_storefront' },
    ]
  },
}
