import { API_V1 } from '~/utils/apiBase'
import { getModuleState, isModuleVisibleInAdmin } from '@decentraguild/core'
import type { AddressBookEntry } from '~/types/mints'

/**
 * Fetch the Address Book for the current tenant.
 * Returns entries when Address Book module is enabled; empty array otherwise.
 * Use this in any mint input to offer address-book browsing.
 */
export function useAddressBook() {
  const tenantStore = useTenantStore()
  const apiBase = useApiBase()

  const entries = ref<AddressBookEntry[]>([])
  const loading = ref(false)

  const addressbookEnabled = computed(() => {
    const tenant = tenantStore.tenant
    if (!tenant?.modules) return false
    return isModuleVisibleInAdmin(getModuleState(tenant.modules.addressbook))
  })

  async function fetchAddressBook() {
    if (!addressbookEnabled.value) {
      entries.value = []
      return
    }
    loading.value = true
    try {
      const tenantId = tenantStore.tenantId
      const res = await fetch(
        `${apiBase.value}${API_V1}/tenant/${tenantId}/addressbook/address-book`,
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

  watch(addressbookEnabled, (enabled) => {
    if (enabled) fetchAddressBook()
    else entries.value = []
  }, { immediate: true })

  return { entries, loading, addressbookEnabled, fetchAddressBook }
}
