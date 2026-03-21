/**
 * Supabase client for the Discord bot.
 *
 * The bot talks to the backend via Supabase: PostgREST (service role) and Edge Functions
 * (discord-bot, discord-verify). Auth: Bearer service role key.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getDiscordBotEdgeSecret, getSupabaseServiceRoleKey, getSupabaseUrl } from './config.js'

let _supabase: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (_supabase) return _supabase
  const url = getSupabaseUrl()
  const serviceKey = getSupabaseServiceRoleKey()
  if (!url || !serviceKey) {
    throw new Error('Supabase URL and service role key must be set on the bot host')
  }
  _supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
  return _supabase
}

function getFunctionsUrl(): string {
  return `${getSupabaseUrl() ?? ''}/functions/v1`
}

function getServiceKey(): string {
  return getSupabaseServiceRoleKey() ?? ''
}

function edgeInvokeHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const botSecret = getDiscordBotEdgeSecret()
  if (botSecret) headers['x-bot-secret'] = botSecret
  const serviceKey = getServiceKey()
  if (serviceKey) headers['Authorization'] = `Bearer ${serviceKey}`
  return headers
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
      headers: edgeInvokeHeaders(),
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

/** Poll until Supabase responds or timeout (used on bot ready). */
export async function waitForSupabaseReady(options?: {
  intervalMs?: number
  timeoutMs?: number
}): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 30_000
  const intervalMs = options?.intervalMs ?? 1_000
  const deadline = Date.now() + timeoutMs
  let lastErr: Error | undefined
  while (Date.now() < deadline) {
    try {
      const client = getClient()
      const { error } = await client.from('tenant_config').select('id').limit(1)
      if (!error) return
      lastErr = new ApiError(`Supabase not reachable: ${error.message}`, 503)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw lastErr ?? new ApiError('Supabase not reachable: timeout', 503)
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

export async function getBotContext(discordGuildId: string): Promise<BotContextResponse> {
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

export async function syncHoldersForGuild(discordGuildId: string): Promise<void> {
  await invokeEdgeFunction('discord-bot', { action: 'sync-holders', guildId: discordGuildId })
}

export async function getEligible(
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
  discordGuildId: string,
): Promise<{ removals: Array<{ discord_user_id: string; discord_role_id: string }> }> {
  return invokeEdgeFunction<{ removals: Array<{ discord_user_id: string; discord_role_id: string }> }>(
    'discord-bot',
    { action: 'pending-removals', guildId: discordGuildId },
  )
}

const DISCORD_ROLE_SYNC_TIMER_KEY = 'discord_role_sync'

export async function fetchDiscordRoleSyncIntervalMs(fallbackMs: number): Promise<number> {
  const client = getClient()
  const { data, error } = await client
    .from('interval_timers')
    .select('interval_minutes')
    .eq('timer_key', DISCORD_ROLE_SYNC_TIMER_KEY)
    .maybeSingle()
  if (error || data == null) return fallbackMs
  const min = data.interval_minutes as number
  if (typeof min !== 'number' || !Number.isFinite(min) || min <= 0) return fallbackMs
  return Math.floor(min * 60 * 1000)
}
