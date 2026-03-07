import { query, getPool } from './client.js'

export type AddressbookAccessLevel = 'public' | 'whitelist' | 'admin_only'

export interface AddressbookSettings {
  access: AddressbookAccessLevel
  whitelist: { programId: string; account: string } | null
}

const DEFAULT_SETTINGS: AddressbookSettings = {
  access: 'admin_only',
  whitelist: null,
}

function parseSettings(raw: unknown): AddressbookSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const r = raw as Record<string, unknown>
  const access = (r.access as AddressbookAccessLevel | undefined) ?? 'admin_only'
  const validAccess: AddressbookAccessLevel[] = ['public', 'whitelist', 'admin_only']
  const wl = r.whitelist
  return {
    access: validAccess.includes(access) ? access : 'admin_only',
    whitelist:
      wl && typeof wl === 'object' && typeof (wl as Record<string, string>).account === 'string'
        ? (wl as AddressbookSettings['whitelist'])
        : null,
  }
}

export async function getAddressbookSettings(tenantId: string): Promise<AddressbookSettings | null> {
  const pool = getPool()
  if (!pool) return null
  const { rows } = await query<Record<string, unknown>>(
    `SELECT settings FROM addressbook_settings WHERE tenant_id = $1`,
    [tenantId],
  )
  if (rows.length === 0) return null
  const raw = rows[0].settings
  if (typeof raw === 'string') {
    try {
      return parseSettings(JSON.parse(raw))
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }
  return parseSettings(raw)
}

export async function upsertAddressbookSettings(
  tenantId: string,
  settings: AddressbookSettings,
): Promise<void> {
  await query(
    `INSERT INTO addressbook_settings (tenant_id, settings, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET
       settings = EXCLUDED.settings,
       updated_at = NOW()`,
    [tenantId, JSON.stringify(settings)],
  )
}
