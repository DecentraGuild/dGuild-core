import 'dotenv/config'

/**
 * Bot config. Secrets from env; other defaults in constants below.
 *
 * dotenv/config must run in this module before any env read so a bundled entry that
 * imports ./config before index.ts’s side effects still sees .env (and production
 * keeps Railway-provided process.env; dotenv does not override existing vars).
 */

const DEFAULT_VERIFY_URL_TEMPLATE = 'https://{{slug}}.dguild.org/verify?token={{token}}'
const DEFAULT_API_READINESS_MAX_WAIT_MS = 30_000
const DEFAULT_API_READINESS_POLL_MS = 1_000
const DEFAULT_ROLE_SYNC_INTERVAL_MS = 15 * 60 * 1000

export const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN

function envTrim(key: string): string | undefined {
  return process.env[key]?.trim()
}
const _SB = 'SUPA' + 'BASE'

/** Read at use time so runtime env (e.g. Railway) is visible even if load order varies. */
export function getSupabaseUrl(): string | undefined {
  return envTrim(`${_SB}_URL`)
}

export function getSupabaseServiceRoleKey(): string | undefined {
  return envTrim(`${_SB}_SERVICE_ROLE_KEY`)
}

const VERIFY_URL_TEMPLATE = (process.env.VERIFY_URL_TEMPLATE ?? DEFAULT_VERIFY_URL_TEMPLATE).trim()

export const API_READINESS_MAX_WAIT_MS = Number(
  process.env.API_READINESS_MAX_WAIT_MS ?? DEFAULT_API_READINESS_MAX_WAIT_MS,
)
export const API_READINESS_POLL_MS = Number(
  process.env.API_READINESS_POLL_MS ?? DEFAULT_API_READINESS_POLL_MS,
)

export function hasBotSecret(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey())
}

export function logMissingSupabaseEnv(): void {
  const url = getSupabaseUrl()
  const key = getSupabaseServiceRoleKey()
  const rawUrl = process.env[`${_SB}_URL`]
  const rawKey = process.env[`${_SB}_SERVICE_ROLE_KEY`]
  const parts: string[] = []
  if (!url) {
    parts.push(
      rawUrl !== undefined && String(rawUrl).trim() === ''
        ? `${_SB}_URL is set but empty or whitespace`
        : `${_SB}_URL is unset`,
    )
  }
  if (!key) {
    parts.push(
      rawKey !== undefined && String(rawKey).trim() === ''
        ? `${_SB}_SERVICE_ROLE_KEY is set but empty or whitespace`
        : `${_SB}_SERVICE_ROLE_KEY is unset`,
    )
  }
  if (parts.length > 0) {
    const supaKeys = Object.keys(process.env)
      .filter((k) => /supa/i.test(k))
      .sort()
    console.warn(
      `[discordbot] Supabase env missing (${parts.join('; ')}) — /verify and role sync disabled. ` +
        `process.env names matching "supa" (values not logged): ${supaKeys.length ? supaKeys.join(', ') : '(none)'}. ` +
        'If you use Railway: ensure this service builds with Railpack (no root Dockerfile); see apps/discordbot/README.md.',
    )
  }
}

export function buildVerifyUrl(tenantSlug: string, token: string): string {
  return VERIFY_URL_TEMPLATE
    .replace(/\{\{\s*slug\s*\}\}/gi, encodeURIComponent(tenantSlug))
    .replace(/\{\{\s*token\s*\}\}/gi, encodeURIComponent(token))
}

export const ROLE_SYNC_INTERVAL_MS = Number(
  process.env.DISCORD_ROLE_SYNC_INTERVAL_MS ?? DEFAULT_ROLE_SYNC_INTERVAL_MS,
)
