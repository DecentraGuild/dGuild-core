/**
 * Bot config. Secrets from env; other defaults in constants below.
 */

const DEFAULT_VERIFY_URL_TEMPLATE = 'https://{{slug}}.dguild.org/verify?token={{token}}'
const DEFAULT_API_READINESS_MAX_WAIT_MS = 30_000
const DEFAULT_API_READINESS_POLL_MS = 1_000
const DEFAULT_ROLE_SYNC_INTERVAL_MS = 15 * 60 * 1000

export const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN

/** Trimmed; undefined if unset. Railpack (Railway) needs these at image build and runtime. */
export const SUPABASE_URL = process.env.SUPABASE_URL?.trim()
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

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
