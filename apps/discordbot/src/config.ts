import 'dotenv/config'

/**
 * Secrets and tunables use bracket `process.env[key]` with keys built at runtime.
 * Dotted access with fixed names is avoided so Railpack does not infer BuildKit secrets.
 */

const DEFAULT_VERIFY_URL_TEMPLATE = 'https://{{slug}}.dguild.org/verify?token={{token}}'
const DEFAULT_API_READINESS_MAX_WAIT_MS = 30_000
const DEFAULT_API_READINESS_POLL_MS = 1_000
const DEFAULT_ROLE_SYNC_INTERVAL_MS = 15 * 60 * 1000

function envKey(...segments: string[]): string {
  return segments.join('_')
}

function envTrim(key: string): string | undefined {
  return process.env[key]?.trim()
}

const _SB = 'SUPA' + 'BASE'

export function getDiscordBotToken(): string | undefined {
  return envTrim(envKey('DISCORD', 'BOT', 'TOKEN'))
}

export function getSupabaseUrl(): string | undefined {
  return envTrim(`${_SB}_URL`)
}

export function getSupabaseServiceRoleKey(): string | undefined {
  return envTrim(`${_SB}_SERVICE_ROLE_KEY`)
}

export function getDiscordApplicationId(): string | undefined {
  return envTrim(envKey('DISCORD', 'APPLICATION', 'ID'))
}

function getVerifyUrlTemplate(): string {
  const k = envKey('VERIFY', 'URL', 'TEMPLATE')
  return (process.env[k] ?? DEFAULT_VERIFY_URL_TEMPLATE).trim()
}

export function getApiReadinessMaxWaitMs(): number {
  const k = envKey('API', 'READINESS', 'MAX', 'WAIT', 'MS')
  return Number(process.env[k] ?? DEFAULT_API_READINESS_MAX_WAIT_MS)
}

export function getApiReadinessPollMs(): number {
  const k = envKey('API', 'READINESS', 'POLL', 'MS')
  return Number(process.env[k] ?? DEFAULT_API_READINESS_POLL_MS)
}

export function getRoleSyncIntervalMsDefault(): number {
  const k = envKey('DISCORD', 'ROLE', 'SYNC', 'INTERVAL', 'MS')
  return Number(process.env[k] ?? DEFAULT_ROLE_SYNC_INTERVAL_MS)
}

export function getDiscordRoleSyncIntervalEnvRaw(): string | undefined {
  return process.env[envKey('DISCORD', 'ROLE', 'SYNC', 'INTERVAL', 'MS')]
}

export function hasBotSecret(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey())
}

export function logMissingSupabaseEnv(): void {
  const url = getSupabaseUrl()
  const key = getSupabaseServiceRoleKey()
  const urlKey = `${_SB}_URL`
  const keyKey = `${_SB}_SERVICE_ROLE_KEY`
  const rawUrl = process.env[urlKey]
  const rawKey = process.env[keyKey]
  const parts: string[] = []
  if (!url) {
    parts.push(
      rawUrl !== undefined && String(rawUrl).trim() === ''
        ? `${urlKey} is set but empty or whitespace`
        : `${urlKey} is unset`,
    )
  }
  if (!key) {
    parts.push(
      rawKey !== undefined && String(rawKey).trim() === ''
        ? `${keyKey} is set but empty or whitespace`
        : `${keyKey} is unset`,
    )
  }
  if (parts.length > 0) {
    const supaKeys = Object.keys(process.env)
      .filter((k) => /supa/i.test(k))
      .sort()
    console.warn(
      `[discordbot] Supabase env missing (${parts.join('; ')}) — /verify and role sync disabled. ` +
        `process.env names matching "supa" (values not logged): ${supaKeys.length ? supaKeys.join(', ') : '(none)'}. ` +
        'Railway: see apps/discordbot/README.md and .cursor/memory/railway-railpack-secrets.md.',
    )
  }
}

export function buildVerifyUrl(tenantSlug: string, token: string): string {
  return getVerifyUrlTemplate()
    .replace(/\{\{\s*slug\s*\}\}/gi, encodeURIComponent(tenantSlug))
    .replace(/\{\{\s*token\s*\}\}/gi, encodeURIComponent(token))
}
