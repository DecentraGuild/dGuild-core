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
