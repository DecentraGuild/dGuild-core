/**
 * Supabase client for the Discord bot.
 *
 * The bot communicates with the DecentraGuild backend via Supabase:
 *   - Simple reads/writes go directly via PostgREST (service_role key bypasses RLS).
 *   - Complex operations (eligible, sync-holders, verify sessions) call Edge Functions.
 *
 * Auth: SUPABASE_SERVICE_ROLE_KEY in Authorization header.
 *
 * Migration from: server-to-server Fastify API calls with x-bot-secret + x-discord-guild-id.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (_supabase) return _supabase
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }
  _supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
  return _supabase
}

function getFunctionsUrl(): string {
  const url = process.env.SUPABASE_URL ?? ''
  return `${url}/functions/v1`
}

function getServiceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
}

const REQUEST_TIMEOUT_MS = 30_000

async function invokeEdgeFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `${getFunctionsUrl()}/${functionName}`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getServiceKey()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!res.ok) {
      const text = await res.text()
      let msg: string = text
      let code: string | undefined
      try {
        const parsed = JSON.parse(text) as { error?: string; code?: string }
        msg = parsed.error ?? text
        code = parsed.code
      } catch { /* use raw text */ }
      throw new ApiError(msg, res.status, code)
    }
    return (await res.json()) as T
  } catch (e) {
    clearTimeout(timeoutId)
    if (e instanceof ApiError) throw e
    throw e instanceof Error ? e : new Error(String(e))
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Legacy: wait for API readiness. With Supabase, always resolves immediately. */
export async function waitForApi(
  _baseUrl: string,
  _options?: { intervalMs?: number; timeoutMs?: number },
): Promise<void> {
  const client = getClient()
  const { error } = await client.from('tenant_config').select('id').limit(1)
  if (error) throw new ApiError(`Supabase not reachable: ${error.message}`, 503)
}

export interface VerifySessionResponse {
  tenant_slug: string
  verify_token: string
  expires_at: string
}

export interface BotContextResponse {
  tenantSlug: string
  discordGuildId: string
  discordModuleState?: string | null
}

export async function getBotContext(
  _baseUrl: string,
  _botSecret: string,
  discordGuildId: string,
): Promise<BotContextResponse> {
  const result = await invokeEdgeFunction<{ server?: Record<string, unknown>; tenant?: Record<string, unknown> }>(
    'discord-bot',
    { action: 'context', guildId: discordGuildId },
  )
  const modules = result.tenant?.modules as Record<string, { state?: string }> | undefined
  const discordModuleState = modules?.discord?.state ?? null
  return {
    tenantSlug: (result.tenant?.slug as string) ?? '',
    discordGuildId,
    discordModuleState,
  }
}

export async function createVerifySession(
  _baseUrl: string,
  _botSecret: string,
  discordGuildId: string,
  discordUserId: string,
): Promise<VerifySessionResponse> {
  return invokeEdgeFunction<VerifySessionResponse>('discord-verify', {
    action: 'session-create',
    discordUserId,
    discordGuildId,
  })
}

export interface SyncRolePayload {
  id: string
  name: string
  position: number
  color?: number | null
  icon?: string | null
  unicode_emoji?: string | null
}

export async function syncGuildRoles(
  _baseUrl: string,
  _botSecret: string,
  discordGuildId: string,
  roles: SyncRolePayload[],
  botRolePosition?: number,
): Promise<void> {
  await invokeEdgeFunction('discord-bot', {
    action: 'roles-upsert',
    guildId: discordGuildId,
    roles: roles.map((r) => ({
      role_id: r.id,
      name: r.name,
      position: r.position,
      color: r.color ?? null,
      icon: r.icon ?? null,
      unicode_emoji: r.unicode_emoji ?? null,
    })),
    botRolePosition,
  })

  if (typeof botRolePosition === 'number') {
    const client = getClient()
    await client
      .from('discord_servers')
      .update({ bot_role_position: botRolePosition, updated_at: new Date().toISOString() })
      .eq('discord_guild_id', discordGuildId)
  }
}

export interface EligibleRoleItem {
  discord_role_id: string
  eligible_discord_user_ids: string[]
}

export async function syncHoldersForGuild(
  _baseUrl: string,
  _botSecret: string,
  discordGuildId: string,
): Promise<{ ok: boolean; results?: Array<{ assetId: string; holderCount: number }> }> {
  await invokeEdgeFunction('discord-bot', { action: 'sync-holders', guildId: discordGuildId })
  return { ok: true }
}

export async function getEligible(
  _baseUrl: string,
  _botSecret: string,
  discordGuildId: string,
  memberRoles?: Record<string, string[]>,
): Promise<{ eligible: EligibleRoleItem[] }> {
  return invokeEdgeFunction<{ eligible: EligibleRoleItem[] }>('discord-bot', {
    action: 'eligible',
    guildId: discordGuildId,
    memberRoles,
  })
}

export async function scheduleRemovals(
  _baseUrl: string,
  _botSecret: string,
  discordGuildId: string,
  removals: Array<{ discord_user_id: string; discord_role_id: string }>,
): Promise<{ ok: boolean; scheduled: number }> {
  const now = new Date()
  const scheduled = removals.map((r) => ({
    ...r,
    scheduled_remove_at: now.toISOString(),
  }))
  return invokeEdgeFunction<{ ok: boolean; scheduled: number }>('discord-bot', {
    action: 'schedule-removals',
    guildId: discordGuildId,
    removals: scheduled,
  })
}

export async function getPendingRemovals(
  _baseUrl: string,
  _botSecret: string,
  discordGuildId: string,
): Promise<{ removals: Array<{ discord_user_id: string; discord_role_id: string }> }> {
  return invokeEdgeFunction<{ removals: Array<{ discord_user_id: string; discord_role_id: string }> }>(
    'discord-bot',
    { action: 'pending-removals', guildId: discordGuildId },
  )
}
