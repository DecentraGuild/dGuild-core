/**
 * Tenant-level default gate (dGuild-wide): list or admin-only.
 * When active, member content and module nav require a connected wallet that passes the check.
 * Public tenants (no tenant-level gate) rely on per-module gate logic in useNavModules.
 */
import { computed } from 'vue'
import { useAuth } from '@decentraguild/auth'
import { useTenantStore } from '~/stores/tenant'
import { useWalletOnList } from '~/composables/gates/useWalletOnList'

let shared: ReturnType<typeof buildTenantGateAccess> | null = null

export function useTenantGateAccess() {
  if (shared) return shared
  shared = buildTenantGateAccess()
  return shared
}

function buildTenantGateAccess() {
  const tenantStore = useTenantStore()
  const auth = useAuth()
  const tenant = computed(() => tenantStore.tenant)

  const tenantDefaultListAddress = computed(() => {
    const g = tenant.value?.defaultGate
    if (g === 'admin-only') return null
    const acc = g && typeof g === 'object' && 'account' in g ? g.account : undefined
    return (acc && acc.trim()) || null
  })

  const tenantDefaultIsAdminOnly = computed(() => tenant.value?.defaultGate === 'admin-only')

  const tenantGateConfigured = computed(() => {
    if (tenantDefaultIsAdminOnly.value) return true
    return Boolean(tenantDefaultListAddress.value)
  })

  const { isListed: isOnTenantDefaultList, loading: tenantDefaultListLoading } =
    useWalletOnList(tenantDefaultListAddress)

  const hasWallet = computed(() => Boolean(auth.wallet.value?.trim()))

  const isAdmin = computed(() => {
    const w = auth.wallet.value
    const admins = tenant.value?.admins ?? []
    return !!(w && admins.includes(w))
  })

  const tenantAccessOk = computed(() => {
    if (!tenantGateConfigured.value) return true
    if (!hasWallet.value) return false
    if (isAdmin.value) return true
    if (tenantDefaultIsAdminOnly.value) return false
    if (!tenantDefaultListAddress.value) return true
    if (tenantDefaultListLoading.value) return false
    return isOnTenantDefaultList.value === true
  })

  const tenantGateDenied = computed(
    () =>
      tenantGateConfigured.value &&
      hasWallet.value &&
      !tenantDefaultListLoading.value &&
      !tenantAccessOk.value,
  )

  return {
    tenantGateConfigured,
    tenantAccessOk,
    tenantGateDenied,
    tenantDefaultIsAdminOnly,
    tenantDefaultListLoading,
    hasWallet,
  }
}
