/**
 * Shared platform audit log helper.
 * Centralizes audit log inserts across Edge Functions.
 */

export async function insertPlatformAuditLog(
  db: { from: (table: string) => { insert: (data: Record<string, unknown>) => Promise<unknown> } },
  params: {
    actorWallet: string
    action: string
    targetType: string
    targetId: string
    details?: Record<string, unknown>
  },
): Promise<void> {
  await db.from('platform_audit_log').insert({
    actor_wallet: params.actorWallet,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    details: params.details ?? {},
  })
}
