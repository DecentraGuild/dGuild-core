import type { FastifyInstance } from 'fastify'
import { getWalletFromRequest } from '../auth.js'
import {
  createPlatformSessionToken,
  getPlatformCookieName,
  getPlatformCookieOptions,
  verifyPlatformSessionToken,
} from '../../auth/platform-session.js'
import { apiError, ErrorCode } from '../../api-errors.js'

function getOwnerWallet(): string | null {
  const v = process.env.PLATFORM_OWNER_WALLET
  if (!v || typeof v !== 'string') return null
  return v.trim()
}

export async function registerPlatformAuthRoutes(app: FastifyInstance) {
  app.post('/api/v1/platform/auth/elevate', async (request, reply) => {
    const wallet = await getWalletFromRequest(request)
    if (!wallet) {
      return reply.status(401).send(apiError('Wallet session required', ErrorCode.UNAUTHORIZED))
    }
    const owner = getOwnerWallet()
    if (!owner) {
      return reply.status(500).send(apiError('PLATFORM_OWNER_WALLET is not configured', ErrorCode.INTERNAL_ERROR))
    }
    if (wallet !== owner) {
      return reply.status(403).send(apiError('Not authorised for platform admin', ErrorCode.FORBIDDEN))
    }

    const token = await createPlatformSessionToken(wallet)
    const secure = request.headers['x-forwarded-proto'] === 'https'
    const cookieOptions = getPlatformCookieOptions(secure)
    return reply.setCookie(getPlatformCookieName(), token, cookieOptions).send({ ok: true })
  })

  app.get('/api/v1/platform/auth/me', async (request, reply) => {
    const cookieName = getPlatformCookieName()
    const token = request.cookies[cookieName]
    if (!token) {
      return reply.status(401).send(apiError('Not authenticated for platform admin', ErrorCode.UNAUTHORIZED))
    }
    const payload = await verifyPlatformSessionToken(token)
    if (!payload) {
      return reply.status(401).send(apiError('Invalid or expired platform session', ErrorCode.UNAUTHORIZED))
    }
    return { wallet: payload.wallet }
  })

  app.post('/api/v1/platform/auth/logout', async (request, reply) => {
    const cookieName = getPlatformCookieName()
    const secure = request.headers['x-forwarded-proto'] === 'https'
    const opts = { path: '/', sameSite: (secure ? 'none' : 'lax') as 'lax' | 'none', secure }
    return reply.clearCookie(cookieName, opts).send({ ok: true })
  })
}

