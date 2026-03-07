import { API_V1 } from '~/utils/apiBase'
import { getModuleState, isModuleVisibleInAdmin } from '@decentraguild/core'
import type { AddressBookEntry } from '~/types/mints'

/**
 * Fetch the Tracker address book for the current tenant.
 * Returns entries when Tracker is enabled; empty array otherwise.
 * Use this in any mint input to offer address-book browsing.
 */
export function useTrackerAddressBook() {
  const tenantStore = useTenantStore()
  const apiBase = useApiBase()

  const entries = ref<AddressBookEntry[]>([])
  const loading = ref(false)

  const trackerEnabled = computed(() => {
    const tenant = tenantStore.tenant
    if (!tenant?.modules) return false
    return isModuleVisibleInAdmin(getModuleState(tenant.modules.tracker))
  })

  async function fetchAddressBook() {
    if (!trackerEnabled.value) {
      entries.value = []
      return
    }
    loading.value = true
    try {
      const tenantId = tenantStore.tenantId
      const res = await fetch(
        `${apiBase.value}${API_V1}/tenant/${tenantId}/tracker/address-book`,
        { credentials: 'include' },
      )
      if (!res.ok) {
        entries.value = []
        return
      }
      const data = (await res.json()) as { entries: AddressBookEntry[] }
      entries.value = data.entries
    } catch {
      entries.value = []
    } finally {
      loading.value = false
    }
  }

  watch(trackerEnabled, (enabled) => {
    if (enabled) fetchAddressBook()
    else entries.value = []
  }, { immediate: true })

  return { entries, loading, trackerEnabled, fetchAddressBook }
}
