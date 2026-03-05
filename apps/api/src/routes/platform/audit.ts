import type { FastifyInstance } from 'fastify'
import { requirePlatformAdmin } from './common.js'
import { listPlatformAuditLog } from '../../db/platform-audit.js'

export async function registerPlatformAuditRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { limit?: string; offset?: string }
  }>('/api/v1/platform/audit', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply)
    if (!admin) return

    const limitNum = Number(request.query.limit)
    const offsetNum = Number(request.query.offset)
    const limit = Number.isFinite(limitNum) && limitNum > 0 ? limitNum : 50
    const offset = Number.isFinite(offsetNum) && offsetNum >= 0 ? offsetNum : 0

    const entries = await listPlatformAuditLog({ limit, offset })
    return { entries }
  })
}

