import type { FastifyInstance } from 'fastify'
import type { ConditionSet, BillingPeriod } from '@decentraguild/billing'
import { getModuleCatalogEntry, VALID_BILLING_PERIODS } from '@decentraguild/config'
import { requireTenantAdmin } from './tenant-settings.js'
import { apiError, ErrorCode } from '../api-errors.js'
import { previewPrice } from '../billing/service.js'

export async function registerBillingRoutes(app: FastifyInstance) {
  app.get<{
    Params: { tenantId: string }
    Querystring: { moduleId?: string; billingPeriod?: string }
  }>('/api/v1/tenant/:tenantId/billing/price-preview', async (request, reply) => {
    const result = await requireTenantAdmin(request, reply, request.params.tenantId)
    if (!result) return

    const moduleId = request.query.moduleId
    if (!moduleId) {
      return reply.status(400).send(apiError('moduleId query parameter is required', ErrorCode.BAD_REQUEST))
    }

    const catalogEntry = getModuleCatalogEntry(moduleId)
    if (!catalogEntry) {
      return reply.status(404).send(apiError('Module not found in catalog', ErrorCode.NOT_FOUND))
    }

    const billingPeriod = request.query.billingPeriod
    if (billingPeriod && !VALID_BILLING_PERIODS.has(billingPeriod)) {
      return reply.status(400).send(apiError('billingPeriod must be "monthly" or "yearly"', ErrorCode.BAD_REQUEST))
    }

    try {
      const { conditions, price } = await previewPrice({
        tenantId: result.tenant.id,
        moduleId,
        billingPeriod: (billingPeriod as BillingPeriod) ?? 'monthly',
      })
      return { conditions, price }
    } catch {
      return reply.status(400).send(apiError('Module not found or not billable', ErrorCode.BAD_REQUEST))
    }
  })

  app.post<{
    Params: { tenantId: string }
    Body: { moduleId: string; conditions?: ConditionSet; billingPeriod?: BillingPeriod }
  }>('/api/v1/tenant/:tenantId/billing/price-preview', async (request, reply) => {
    const result = await requireTenantAdmin(request, reply, request.params.tenantId)
    if (!result) return

    const body = request.body ?? ({} as Record<string, unknown>)
    const moduleId = body.moduleId
    if (!moduleId || typeof moduleId !== 'string') {
      return reply.status(400).send(apiError('moduleId is required', ErrorCode.BAD_REQUEST))
    }

    const catalogEntry = getModuleCatalogEntry(moduleId)
    if (!catalogEntry) {
      return reply.status(404).send(apiError('Module not found in catalog', ErrorCode.NOT_FOUND))
    }

    const billingPeriod = body.billingPeriod
    if (billingPeriod && !VALID_BILLING_PERIODS.has(billingPeriod)) {
      return reply.status(400).send(apiError('billingPeriod must be "monthly" or "yearly"', ErrorCode.BAD_REQUEST))
    }

    try {
      const { conditions, price } = await previewPrice({
        tenantId: result.tenant.id,
        moduleId,
        billingPeriod: billingPeriod ?? 'monthly',
        conditions: body.conditions && typeof body.conditions === 'object' ? body.conditions : undefined,
      })
      return { conditions, price }
    } catch {
      return reply.status(400).send(apiError('Module not found or not billable', ErrorCode.BAD_REQUEST))
    }
  })
}
