/**
 * Module lifecycle cron Edge Function.
 * Called by pg_cron every 15 minutes.
 *
 * Transitions:
 *   active → deactivating  when deactivatedate ≤ now
 *   deactivating → off     when deactivatingUntil ≤ now
 *
 * Skips the 'admin' module (always active).
 */

import { jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'

const DEACTIVATING_MINUTES = Number(Deno.env.get('MODULE_LIFECYCLE_DEACTIVATING_MINUTES') ?? '1440')

type ModuleEntry = {
  state: 'off' | 'staging' | 'active' | 'deactivating'
  deactivatedate?: string | null
  deactivatingUntil?: string | null
  settingsjson?: Record<string, unknown>
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60 * 1000)
}

function applyLifecycleTransitions(
  modules: Record<string, ModuleEntry>,
  now: Date,
): { modules: Record<string, ModuleEntry>; changed: boolean } {
  const next: Record<string, ModuleEntry> = {}
  let changed = false

  for (const [id, entry] of Object.entries(modules)) {
    if (id === 'admin') {
      next[id] = entry
      continue
    }

    let upd: ModuleEntry = { ...entry }

    if (entry.state === 'active') {
      const deactivateAt = parseDate(entry.deactivatedate)
      if (deactivateAt && deactivateAt <= now) {
        upd = {
          ...entry,
          state: 'deactivating',
          deactivatingUntil: addMinutes(now, DEACTIVATING_MINUTES).toISOString(),
        }
        changed = true
      }
    }

    if (upd.state === 'deactivating') {
      const untilDate = parseDate(upd.deactivatingUntil)
      if (untilDate && untilDate <= now) {
        upd = {
          ...entry,
          state: 'off',
          deactivatedate: null,
          deactivatingUntil: null,
        }
        changed = true
      }
    }

    next[id] = upd
  }

  return { modules: next, changed }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  const db = getAdminClient()
  const now = new Date()

  const { data: tenants, error } = await db
    .from('tenant_config')
    .select('id, modules')

  if (error) return errorResponse(error.message, req, 500)
  if (!tenants?.length) return jsonResponse({ processed: 0 }, req)

  let processed = 0
  let changed = 0

  for (const tenant of tenants) {
    const modules = (tenant.modules as Record<string, ModuleEntry>) ?? {}
    const result = applyLifecycleTransitions(modules, now)
    if (result.changed) {
      await db
        .from('tenant_config')
        .update({ modules: result.modules, updated_at: now.toISOString() })
        .eq('id', tenant.id)
      changed++
    }
    processed++
  }

  return jsonResponse({ processed, changed }, req)
})
