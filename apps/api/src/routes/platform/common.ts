import type { FastifyReply, FastifyRequest } from 'fastify'
import { verifyPlatformSessionToken, getPlatformCookieName } from '../../auth/platform-session.js'
import { apiError, ErrorCode } from '../../api-errors.js'

function getPlatformTokenFromCookie(request: FastifyRequest): string | null {
  const cookieName = getPlatformCookieName()
  const cookie = request.cookies[cookieName]
  return cookie ?? null
}

export async function requirePlatformAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ wallet: string } | null> {
  const token = getPlatformTokenFromCookie(request)
  if (!token) {
    await reply.status(401).send(apiError('Not authenticated for platform admin', ErrorCode.UNAUTHORIZED))
    return null
  }
  const payload = await verifyPlatformSessionToken(token)
  if (!payload) {
    await reply.status(401).send(apiError('Invalid or expired platform session', ErrorCode.UNAUTHORIZED))
    return null
  }
  return { wallet: payload.wallet }
}

