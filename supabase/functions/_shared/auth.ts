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
 * True when the request uses the project's service role credential.
 * Accepts two formats to handle Supabase legacy JWT keys and new sb_secret_* keys:
 *   1. Exact match against SUPABASE_SERVICE_ROLE_KEY (new sb_secret_* format or any injected value).
 *   2. Legacy JWT fallback: decodes the Bearer token and checks role === "service_role" +
 *      iss === "supabase" + ref matches this project. Used when the Vault holds the legacy
 *      JWT-format key but SUPABASE_SERVICE_ROLE_KEY is the new-format secret key.
 *      The JWT is HS256-signed with the project JWT secret, so a forged token without
 *      that secret would fail Supabase's own gateway before reaching here, making
 *      the unsigned decode safe for this additional check.
 */
export function isServiceRoleAuthorization(req: Request): boolean {
  const auth = (req.headers.get('Authorization') ?? '').trim()
  if (!auth.startsWith('Bearer ')) return false
  const token = auth.slice(7).trim()
  if (!token) return false

  // Primary: exact match against injected service role key (works for both key formats).
  const envKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
  if (envKey && token === envKey) return true

  // Fallback: accept legacy JWT-format service role key by decoding claims.
  // Covers the case where SUPABASE_SERVICE_ROLE_KEY is the new sb_secret_* format
  // but the Vault still holds the legacy HS256 JWT.
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '==='.slice((b64.length + 3) % 4 === 0 ? 4 : (b64.length + 3) % 4)
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>
    if (payload?.role !== 'service_role' || payload?.iss !== 'supabase') return false
    // Verify the project ref so a service_role JWT from another project is rejected.
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim()
    const ref = supabaseUrl.match(/https?:\/\/([^.]+)/)?.[1] ?? ''
    return !ref || payload?.ref === ref
  } catch {
    return false
  }
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
