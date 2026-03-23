import type { Ref } from 'vue'
import { useSupabase, invokeEdgeFunction } from '@decentraguild/nuxt-composables'

export function useOpsTenantSlug(tenantId: Ref<string | null>, reload: () => Promise<void>) {
  const slugInput = ref('')
  const checkStatus = ref<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const slugError = ref<string | null>(null)
  const saving = ref(false)

  async function check() {
    const s = slugInput.value.trim().toLowerCase()
    if (!s || !tenantId.value) return
    slugError.value = null
    checkStatus.value = 'checking'
    try {
      const supabase = useSupabase()
      const data = await invokeEdgeFunction<{ available?: boolean }>(supabase, 'platform', { action: 'tenant-slug-check', slug: s })
      checkStatus.value = data.available ? 'available' : 'taken'
    } catch (e) {
      checkStatus.value = 'idle'
      slugError.value = e instanceof Error ? e.message : 'Check failed'
    }
  }

  async function set() {
    const s = slugInput.value.trim().toLowerCase()
    if (!s || !tenantId.value || checkStatus.value !== 'available') return
    slugError.value = null
    saving.value = true
    try {
      const supabase = useSupabase()
      await invokeEdgeFunction(supabase, 'platform', { action: 'tenant-slug-set', tenantId: tenantId.value, slug: s })
      slugInput.value = ''
      checkStatus.value = 'idle'
      await reload()
    } catch {
      slugError.value = 'Failed to set slug'
    } finally {
      saving.value = false
    }
  }

  return {
    slugInput,
    checkStatus,
    slugError,
    saving,
    check,
    set,
  }
}
