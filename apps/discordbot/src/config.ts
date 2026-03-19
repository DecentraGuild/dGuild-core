/**
 * Bot config. Secrets from env; other defaults in constants below.
 */

const DEFAULT_VERIFY_URL_TEMPLATE = 'https://{{slug}}.dguild.org/verify?token={{token}}'
const DEFAULT_API_READINESS_MAX_WAIT_MS = 30_000
const DEFAULT_API_READINESS_POLL_MS = 1_000
const DEFAULT_ROLE_SYNC_INTERVAL_MS = 15 * 60 * 1000

export const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN

/**
 * Supabase env reads use composed keys so Railpack (if ever used) is less likely to
 * require those names as BuildKit build secrets. Dockerfile deploy is the supported path.
 */
function envTrim(key: string): string | undefined {
  return process.env[key]?.trim()
}
const _SB = 'SUPA' + 'BASE'
export const SUPABASE_URL = envTrim(_SB + '_URL')
export const SUPABASE_SERVICE_ROLE_KEY = envTrim(_SB + '_SERVICE_ROLE_KEY')

const VERIFY_URL_TEMPLATE = (process.env.VERIFY_URL_TEMPLATE ?? DEFAULT_VERIFY_URL_TEMPLATE).trim()

export const API_READINESS_MAX_WAIT_MS = Number(
  process.env.API_READINESS_MAX_WAIT_MS ?? DEFAULT_API_READINESS_MAX_WAIT_MS,
)
export const API_READINESS_POLL_MS = Number(
  process.env.API_READINESS_POLL_MS ?? DEFAULT_API_READINESS_POLL_MS,
)

export function hasBotSecret(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
}

export function buildVerifyUrl(tenantSlug: string, token: string): string {
  return VERIFY_URL_TEMPLATE
    .replace(/\{\{\s*slug\s*\}\}/gi, encodeURIComponent(tenantSlug))
    .replace(/\{\{\s*token\s*\}\}/gi, encodeURIComponent(token))
}

export const ROLE_SYNC_INTERVAL_MS = Number(
  process.env.DISCORD_ROLE_SYNC_INTERVAL_MS ?? DEFAULT_ROLE_SYNC_INTERVAL_MS,
)
