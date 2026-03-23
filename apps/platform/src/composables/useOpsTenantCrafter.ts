import { useSupabase, invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import type { TenantConfig } from '@decentraguild/core'

export function useOpsTenantCrafter(
  tenant: Ref<TenantConfig | null>,
  loadTenant: () => Promise<void>,
) {
  const crafterTokens = ref<Array<{ mint: string; name: string | null; symbol: string | null; decimals: number | null; authority: string; created_at: string }>>([])
  const crafterImportMint = ref('')
  const crafterImportName = ref('')
  const crafterImportSymbol = ref('')
  const crafterImportLoading = ref(false)
  const crafterImportError = ref<string | null>(null)
  const crafterRemoveLoading = ref<string | null>(null)

  async function importCrafterToken() {
    const mint = crafterImportMint.value.trim()
    if (!tenant.value || !mint) return
    crafterImportError.value = null; crafterImportLoading.value = true
    try {
      const supabase = useSupabase()
      await invokeEdgeFunction(supabase, 'platform', {
        action: 'crafter-import-token',
        tenantId: tenant.value.id,
        mint,
        name: crafterImportName.value.trim() || undefined,
        symbol: crafterImportSymbol.value.trim() || undefined,
      })
      crafterImportMint.value = ''; crafterImportName.value = ''; crafterImportSymbol.value = ''
      await loadTenant()
    } catch (e) {
      crafterImportError.value = e instanceof Error ? e.message : 'Failed to import'
    } finally { crafterImportLoading.value = false }
  }

  async function removeCrafterToken(mint: string) {
    if (!tenant.value) return
    crafterImportError.value = null; crafterRemoveLoading.value = mint
    try {
      const supabase = useSupabase()
      await invokeEdgeFunction(supabase, 'platform', { action: 'crafter-remove-token', tenantId: tenant.value.id, mint })
      crafterTokens.value = crafterTokens.value.filter((t) => t.mint !== mint)
    } catch (e) {
      crafterImportError.value = e instanceof Error ? e.message : 'Failed to remove'
    } finally { crafterRemoveLoading.value = null }
  }

  return { crafterTokens, crafterImportMint, crafterImportName, crafterImportSymbol, crafterImportLoading, crafterImportError, crafterRemoveLoading, importCrafterToken, removeCrafterToken }
}
