import { useSupabase, invokeEdgeFunction } from '@decentraguild/nuxt-composables'

export interface AuditEntry {
  id: string
  actorWallet: string
  action: string
  targetType: string | null
  targetId: string | null
  details: Record<string, unknown> | null
  createdAt: string
}

export function useOpsAudit() {
  const auditEntries = ref<AuditEntry[]>([])
  const auditLoading = ref(true)
  const auditError = ref<string | null>(null)

  async function loadAudit() {
    auditLoading.value = true
    auditError.value = null
    try {
      const supabase = useSupabase()
      const data = await invokeEdgeFunction<{ entries?: AuditEntry[] }>(supabase, 'platform', { action: 'audit-log', limit: 50 })
      auditEntries.value = (data.entries ?? []).map((e) => ({
        id: (e as Record<string, unknown>).id as string,
        actorWallet: (e as Record<string, unknown>).actor_wallet as string,
        action: (e as Record<string, unknown>).action as string,
        targetType: (e as Record<string, unknown>).target_type as string | null,
        targetId: (e as Record<string, unknown>).target_id as string | null,
        details: (e as Record<string, unknown>).details as Record<string, unknown> | null,
        createdAt: (e as Record<string, unknown>).created_at as string,
      }))
    } catch (e) {
      auditError.value = e instanceof Error ? e.message : 'Failed to load audit log'
    } finally { auditLoading.value = false }
  }

  return { auditEntries, auditLoading, auditError, loadAudit }
}
