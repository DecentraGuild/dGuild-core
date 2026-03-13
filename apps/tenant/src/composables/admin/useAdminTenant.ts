/**
 * Shared tenant context for admin composables.
 * Extracted from useAdminSubscriptions, useAdminForm, useAdminBilling.
 */
import { useTenantStore } from '~/stores/tenant'

export function useAdminTenant() {
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId)
  const slug = computed(() => tenantStore.slug)
  const tenant = computed(() => tenantStore.tenant)
  return { tenantId, slug, tenant, tenantStore }
}
