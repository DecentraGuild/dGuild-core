import 'dotenv/config'

const DEFAULT_VERIFY_URL_TEMPLATE = 'https://{{slug}}.dguild.org/verify?token={{token}}'
const DEFAULT_API_READINESS_MAX_WAIT_MS = 30_000
const DEFAULT_API_READINESS_POLL_MS = 1_000
const DEFAULT_ROLE_SYNC_INTERVAL_MS = 15 * 60 * 1000

function trimEnv(value: string | undefined): string | undefined {
  const t = value?.trim()
  return t === '' ? undefined : t
}

export function getDiscordBotToken(): string | undefined {
  return trimEnv(process.env.DISCORD_BOT_TOKEN)
}

export function getSupabaseUrl(): string | undefined {
  return trimEnv(process.env.SUPABASE_URL)
}

export function getSupabaseServiceRoleKey(): string | undefined {
  return trimEnv(process.env.SUPABASE_SERVICE_ROLE_KEY) ?? trimEnv(process.env.SUPABASE_SERVICE_KEY)
}

export function getDiscordApplicationId(): string | undefined {
  return trimEnv(process.env.DISCORD_APPLICATION_ID)
}

/** Same value as Supabase Edge secret `DISCORD_BOT_SECRET`. If set, Edge calls use `x-bot-secret` (avoids 401 when service_role strings differ between Railway and Edge). */
export function getDiscordBotEdgeSecret(): string | undefined {
  return trimEnv(process.env.DISCORD_BOT_SECRET)
}

function getVerifyUrlTemplate(): string {
  return (process.env.VERIFY_URL_TEMPLATE ?? DEFAULT_VERIFY_URL_TEMPLATE).trim()
}

export function getApiReadinessMaxWaitMs(): number {
  return Number(process.env.API_READINESS_MAX_WAIT_MS ?? DEFAULT_API_READINESS_MAX_WAIT_MS)
}

export function getApiReadinessPollMs(): number {
  return Number(process.env.API_READINESS_POLL_MS ?? DEFAULT_API_READINESS_POLL_MS)
}

export function getRoleSyncIntervalMsDefault(): number {
  return Number(process.env.DISCORD_ROLE_SYNC_INTERVAL_MS ?? DEFAULT_ROLE_SYNC_INTERVAL_MS)
}

export function getDiscordRoleSyncIntervalEnvRaw(): string | undefined {
  return process.env.DISCORD_ROLE_SYNC_INTERVAL_MS
}

export function hasBotSecret(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey())
}

/** Call once at startup. Bot does nothing useful without Supabase; exit instead of logging forever. */
export function assertSupabaseEnvOrExit(): void {
  if (hasBotSecret()) return
  const missing: string[] = []
  if (!getSupabaseUrl()) missing.push('SUPABASE_URL')
  if (!getSupabaseServiceRoleKey()) missing.push('SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)')
  console.error(
    `Discord bot: add these to Railway → service → Variables, save, redeploy: ${missing.join(', ')}.`,
  )
  process.exit(1)
}

export function buildVerifyUrl(tenantSlug: string, token: string): string {
  return getVerifyUrlTemplate()
    .replace(/\{\{\s*slug\s*\}\}/gi, encodeURIComponent(tenantSlug))
    .replace(/\{\{\s*token\s*\}\}/gi, encodeURIComponent(token))
}
