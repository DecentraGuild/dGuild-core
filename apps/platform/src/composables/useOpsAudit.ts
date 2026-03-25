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
      auditEntries.value = (data.entries ?? []).map((e) => {
        const row = e as unknown as Record<string, unknown>
        return {
          id: row.id as string,
          actorWallet: row.actor_wallet as string,
          action: row.action as string,
          targetType: row.target_type as string | null,
          targetId: row.target_id as string | null,
          details: row.details as Record<string, unknown> | null,
          createdAt: row.created_at as string,
        }
      })
    } catch (e) {
      auditError.value = e instanceof Error ? e.message : 'Failed to load audit log'
    } finally { auditLoading.value = false }
  }

  return { auditEntries, auditLoading, auditError, loadAudit }
}
