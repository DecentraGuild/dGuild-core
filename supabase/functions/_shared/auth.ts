/**
 * Shared auth helpers for Edge Functions.
 * Mirrors auth_wallet() from 20260307000005_auth_wallet_web3_jwt.sql.
 * Use this everywhere instead of ad-hoc getUser().user_metadata.wallet_address.
 */
import { getUserClient } from './supabase-admin.ts'

export function normalizeWallet(v: string | undefined): string {
  if (!v || typeof v !== 'string') return ''
  return v.trim().replace(/^["']|["']$/g, '')
}

/** Decode JWT payload (no verify; used to read claims). Returns null on parse error. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1]
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(base64)
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Extract wallet from JWT. Same COALESCE order as auth_wallet():
 * 1. claims.wallet_address  2. top-level wallet_address
 * 3. user_metadata.wallet_address  4. user_metadata.custom_claims.address
 */
function getWalletFromToken(token: string): string | null {
  const payload = decodeJwtPayload(token)
  if (!payload) return null
  const claims = payload.claims as Record<string, unknown> | undefined
  const userMeta = payload.user_metadata as Record<string, unknown> | undefined
  const customClaims = userMeta?.custom_claims as Record<string, unknown> | undefined
  const raw = (payload.wallet_address ??
    claims?.wallet_address ??
    userMeta?.wallet_address ??
    customClaims?.address) as string | undefined
  return raw ? normalizeWallet(raw) || null : null
}

/**
 * Get wallet from Authorization header. Same source for all Edge Functions.
 * When JWT has no wallet, calls Auth API (getUser) to read user_metadata.
 */
/**
 * True when the request uses the project's service role JWT (same value as pg_cron → invoke_edge_function).
 * Use to gate cron-only Edge paths; never accept the anon key here.
 */
export function isServiceRoleAuthorization(req: Request): boolean {
  const key = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
  if (!key) return false
  const auth = (req.headers.get('Authorization') ?? '').trim()
  return auth === `Bearer ${key}`
}

/** Case-insensitive wallet membership in tenant_config.admins (normalized trim). */
export function walletMatchesTenantAdmins(wallet: string, admins: unknown): boolean {
  const w = normalizeWallet(wallet).toLowerCase()
  if (!w) return false
  const list = Array.isArray(admins) ? (admins as string[]) : []
  return list.some((a) => normalizeWallet(String(a)).toLowerCase() === w)
}

export async function getWalletFromAuthHeader(authHeader: string | null): Promise<string | null> {
  const bearer = authHeader?.trim()
  if (!bearer || !bearer.toLowerCase().startsWith('bearer ')) return null

  const token = bearer.slice(7)
  let wallet = getWalletFromToken(token)

  if (!wallet) {
    const { data: { user }, error } = await getUserClient(authHeader).auth.getUser()
    if (error) return null
    const meta = user?.user_metadata as Record<string, unknown> | undefined
    const customClaims = meta?.custom_claims as Record<string, unknown> | undefined
    const raw = (meta?.wallet_address ?? customClaims?.address) as string | undefined
    wallet = raw ? normalizeWallet(raw) || null : null
  }

  return wallet
}

type AdminCheckOk = { ok: true; wallet: string }
type AdminCheckFail = { ok: false; response: Response }
type AdminCheckResult = AdminCheckOk | AdminCheckFail

export async function requireTenantAdmin(
  authHeader: string | null,
  tenantId: string,
  db: ReturnType<typeof import('./supabase-admin.ts').getAdminClient>,
  req?: Request,
): Promise<AdminCheckResult> {
  const wallet = await getWalletFromAuthHeader(authHeader)
  if (!wallet) {
    const body = JSON.stringify({ error: 'Not signed in. Connect your wallet and sign in first.' })
    return { ok: false, response: new Response(body, { status: 401, headers: { 'Content-Type': 'application/json' } }) }
  }

  const { data: tenant } = await db
    .from('tenant_config')
    .select('admins')
    .eq('id', tenantId)
    .maybeSingle()

  if (!tenant) {
    const body = JSON.stringify({ error: 'Tenant not found' })
    return { ok: false, response: new Response(body, { status: 404, headers: { 'Content-Type': 'application/json' } }) }
  }

  const isAdmin = walletMatchesTenantAdmins(wallet, tenant.admins)
  if (!isAdmin) {
    const body = JSON.stringify({ error: 'Tenant admin only' })
    return { ok: false, response: new Response(body, { status: 403, headers: { 'Content-Type': 'application/json' } }) }
  }

  return { ok: true, wallet }
}

export async function requirePlatformAdmin(
  authHeader: string | null,
  req: Request,
): Promise<AdminCheckResult> {
  const bearer = authHeader?.trim()
  if (!bearer || !bearer.toLowerCase().startsWith('bearer ')) {
    const body = JSON.stringify({ error: 'Not signed in. Connect your wallet and sign in first.' })
    return { ok: false, response: new Response(body, { status: 401, headers: { 'Content-Type': 'application/json' } }) }
  }

  const userClient = getUserClient(authHeader)
  const { data: wallet, error } = await userClient.rpc('check_platform_admin')
  if (error) {
    const body = JSON.stringify({ error: `Auth error: ${error.message}` })
    return { ok: false, response: new Response(body, { status: 401, headers: { 'Content-Type': 'application/json' } }) }
  }
  if (!wallet) {
    const body = JSON.stringify({ error: 'Platform admin only. Your wallet is not authorised.' })
    return { ok: false, response: new Response(body, { status: 403, headers: { 'Content-Type': 'application/json' } }) }
  }
  return { ok: true, wallet: wallet as string }
}
