import { query } from './client.js'

export interface PlatformAuditLogEntry {
  id: string
  actorWallet: string
  action: string
  targetType: string | null
  targetId: string | null
  details: Record<string, unknown> | null
  createdAt: Date
}

interface Row {
  id: string
  actor_wallet: string
  action: string
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown> | null
  created_at: Date
}

function mapRow(row: Row): PlatformAuditLogEntry {
  return {
    id: row.id,
    actorWallet: row.actor_wallet,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    details: (row.details ?? null) as Record<string, unknown> | null,
    createdAt: row.created_at,
  }
}

export async function insertPlatformAuditLog(params: {
  actorWallet: string
  action: string
  targetType?: string | null
  targetId?: string | null
  details?: Record<string, unknown> | null
}): Promise<void> {
  const { actorWallet, action, targetType = null, targetId = null, details = null } = params
  await query(
    `INSERT INTO platform_audit_log (actor_wallet, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, COALESCE($5::jsonb, '{}'::jsonb))`,
    [actorWallet, action, targetType, targetId, details ? JSON.stringify(details) : null],
  )
}

export async function listPlatformAuditLog(opts?: {
  limit?: number
  offset?: number
}): Promise<PlatformAuditLogEntry[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200)
  const offset = Math.max(opts?.offset ?? 0, 0)
  const { rows } = await query<Row>(
    `SELECT id, actor_wallet, action, target_type, target_id, details, created_at
     FROM platform_audit_log
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
  return rows.map(mapRow)
}

