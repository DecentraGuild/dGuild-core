import * as jose from 'jose'
import { getSessionSecret, getCookieOptions as getBaseCookieOptions } from './session.js'

const PLATFORM_COOKIE_NAME = 'dg_platform_session'
const PLATFORM_SESSION_MAX_AGE_SEC = 12 * 60 * 60 // 12 hours

export interface PlatformSessionPayload {
  wallet: string
  scope: 'platform'
  exp: number
}

export function getPlatformCookieName(): string {
  return PLATFORM_COOKIE_NAME
}

export function getPlatformCookieOptions(secure: boolean): {
  httpOnly: boolean
  sameSite: 'lax' | 'strict' | 'none'
  secure: boolean
  path: string
} {
  return getBaseCookieOptions(secure)
}

export function createPlatformSessionToken(wallet: string, maxAgeSec = PLATFORM_SESSION_MAX_AGE_SEC): Promise<string> {
  const secret = getSessionSecret()
  const now = Math.floor(Date.now() / 1000)
  return new jose.SignJWT({ wallet, scope: 'platform' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(now + maxAgeSec)
    .setIssuedAt()
    .sign(secret)
}

export async function verifyPlatformSessionToken(token: string): Promise<PlatformSessionPayload | null> {
  try {
    const secret = getSessionSecret()
    const { payload } = await jose.jwtVerify(token, secret)
    const wallet = payload.wallet as string
    const scope = payload.scope as string
    if (!wallet || typeof wallet !== 'string') return null
    if (scope !== 'platform') return null
    return { wallet, scope: 'platform', exp: (payload.exp as number) ?? 0 }
  } catch {
    return null
  }
}

