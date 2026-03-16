/**
 * Admin pricing adapter. Resolves registration (0/1), slug (0/1).
 * registration: 1 if tenant exists (we're resolving for an existing tenant), 0 for pending.
 * slug: 1 if tenant_config.slug is set, 0 otherwise.
 */
import type { PricingAdapter } from '../types.js'

export const adminAdapter: PricingAdapter = {
  productKey: 'admin',
  async resolveUsage({ tenantId, db }) {
    const { data: tenant } = await db
      .from('tenant_config')
      .select('slug')
      .eq('id', tenantId)
      .maybeSingle()
    const slug = tenant && (tenant as { slug: string | null }).slug ? 1 : 0
    const registration = tenant ? 1 : 0
    return {
      registration,
      slug,
    }
  },
  getMeterDefinitions() {
    return [
      { meterKey: 'registration' },
      { meterKey: 'slug' },
    ]
  },
}
