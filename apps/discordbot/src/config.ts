/**
 * Bot config. Secrets from env; other defaults in constants below.
 */

const DEFAULT_VERIFY_URL_TEMPLATE = 'https://{{slug}}.dguild.org/verify?token={{token}}'
const DEFAULT_API_READINESS_MAX_WAIT_MS = 30_000
const DEFAULT_API_READINESS_POLL_MS = 1_000
const DEFAULT_ROLE_SYNC_INTERVAL_MS = 15 * 60 * 1000

export const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN

/** Legacy: kept for signature compatibility but no longer used (Supabase replaces Fastify API). */
export const API_BASE_URL = ''
export const DISCORD_BOT_API_SECRET = process.env.DISCORD_BOT_API_SECRET

const VERIFY_URL_TEMPLATE = process.env.VERIFY_URL_TEMPLATE ?? DEFAULT_VERIFY_URL_TEMPLATE

export const API_READINESS_MAX_WAIT_MS = Number(
  process.env.API_READINESS_MAX_WAIT_MS ?? DEFAULT_API_READINESS_MAX_WAIT_MS,
)
export const API_READINESS_POLL_MS = Number(
  process.env.API_READINESS_POLL_MS ?? DEFAULT_API_READINESS_POLL_MS,
)

export function hasBotSecret(): boolean {
  // With Supabase, service_role key is always required; treat as "has secret".
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export function buildVerifyUrl(tenantSlug: string, token: string): string {
  return VERIFY_URL_TEMPLATE
    .replace(/\{\{\s*slug\s*\}\}/gi, encodeURIComponent(tenantSlug))
    .replace(/\{\{\s*token\s*\}\}/gi, encodeURIComponent(token))
}

export const ROLE_SYNC_INTERVAL_MS = Number(
  process.env.DISCORD_ROLE_SYNC_INTERVAL_MS ?? DEFAULT_ROLE_SYNC_INTERVAL_MS,
)
