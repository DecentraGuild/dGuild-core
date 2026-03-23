import type { Ref } from 'vue'
import type { TenantConfig } from '@decentraguild/core'
import { useSupabase, invokeEdgeFunction } from '@decentraguild/nuxt-composables'

export function useOpsTenantAdmins(
  tenant: Ref<TenantConfig | null>,
) {
  const walletInput = ref('')
  const adding = ref(false)
  const addError = ref<string | null>(null)
  const copiedAddress = ref<string | null>(null)

  async function addAdmin() {
    const wallet = walletInput.value.trim()
    if (!wallet || !tenant.value) return
    addError.value = null
    adding.value = true
    try {
      const supabase = useSupabase()
      const data = await invokeEdgeFunction<{ admins?: string[] }>(supabase, 'platform', {
        action: 'tenant-add-admin',
        tenantId: tenant.value.id,
        wallet,
      })
      walletInput.value = ''
      const admins = data.admins
      if (admins && tenant.value) {
        tenant.value = { ...tenant.value, admins }
      }
    } catch (e) {
      addError.value = e instanceof Error ? e.message : 'Failed to add admin'
    } finally {
      adding.value = false
    }
  }

  function copyAdmin(address: string) {
    navigator.clipboard.writeText(address).then(() => {
      copiedAddress.value = address
      setTimeout(() => { copiedAddress.value = null }, 2000)
    })
  }

  return {
    walletInput,
    adding,
    addError,
    copiedAddress,
    addAdmin,
    copyAdmin,
  }
}
