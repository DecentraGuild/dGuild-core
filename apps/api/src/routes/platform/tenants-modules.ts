import type { FastifyInstance } from 'fastify'
import type { ModuleState, TenantModulesMap } from '@decentraguild/core'
import { resolveTenant, updateTenant } from '../../db/tenant.js'
import { requirePlatformAdmin } from './common.js'
import { insertPlatformAuditLog } from '../../db/platform-audit.js'
import { apiError, ErrorCode } from '../../api-errors.js'

export async function registerPlatformTenantModulesRoutes(app: FastifyInstance) {
  app.patch<{
    Params: { slug: string }
    Body: { moduleId?: string; enabled?: boolean }
  }>('/api/v1/platform/tenants/:slug/modules', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply)
    if (!admin) return

    const slug = request.params.slug.trim()
    const tenant = await resolveTenant(slug)
    if (!tenant) {
      return reply.status(404).send(apiError('Tenant not found', ErrorCode.TENANT_NOT_FOUND))
    }

    const body = request.body ?? {}
    const moduleId = body.moduleId
    const enabled = body.enabled

    if (!moduleId || typeof moduleId !== 'string') {
      return reply.status(400).send(apiError('moduleId is required', ErrorCode.BAD_REQUEST))
    }
    if (typeof enabled !== 'boolean') {
      return reply.status(400).send(apiError('enabled must be a boolean', ErrorCode.BAD_REQUEST))
    }
    if (moduleId === 'admin' && enabled === false) {
      return reply.status(400).send(apiError('Admin module cannot be turned off', ErrorCode.BAD_REQUEST))
    }

    const modules: TenantModulesMap = { ...(tenant.modules ?? {}) }
    const prevEntry = modules[moduleId] ?? {}
    const prevState = (prevEntry.state ?? 'off') as ModuleState
    const nextState: ModuleState = enabled ? 'active' : 'off'

    modules[moduleId] = {
      ...prevEntry,
      state: nextState,
    }

    const updated = await updateTenant(tenant.id, { modules })
    if (!updated) {
      return reply.status(404).send(apiError('Tenant not found after update', ErrorCode.TENANT_NOT_FOUND))
    }

    await insertPlatformAuditLog({
      actorWallet: admin.wallet,
      action: 'tenant_module_toggle',
      targetType: 'tenant',
      targetId: updated.slug ?? updated.id,
      details: {
        moduleId,
        previousState: prevState,
        nextState,
      },
    })

    return {
      tenant: updated,
    }
  })
}

