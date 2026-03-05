import type { FastifyInstance } from 'fastify'
import type { ModuleState, TenantModulesMap } from '@decentraguild/core'
import type { BillingPeriod } from '@decentraguild/billing'
import { getTenantById, updateTenant } from '../../db/tenant.js'
import { getSubscription, upsertSubscription } from '../../db/billing.js'
import { upsertModuleBillingState } from '../../db/module-billing-state.js'
import { tenantBillingKey } from '../../billing/service.js'
import { validatePeriodEnd } from '../../billing/validate-period-end.js'
import { minimalPriceSnapshot } from '../../billing/minimal-price-snapshot.js'
import { requirePlatformAdmin } from './common.js'
import { insertPlatformAuditLog } from '../../db/platform-audit.js'
import { apiError, ErrorCode } from '../../api-errors.js'

export async function registerPlatformTenantModulesRoutes(app: FastifyInstance) {
  app.patch<{
    Params: { tenantId: string }
    Body: { moduleId?: string; enabled?: boolean; periodEnd?: string; billingPeriod?: string }
  }>('/api/v1/platform/tenants/:tenantId/modules', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply)
    if (!admin) return

    const tenantId = request.params.tenantId.trim()
    const tenant = await getTenantById(tenantId)
    if (!tenant) {
      return reply.status(404).send(apiError('Tenant not found', ErrorCode.TENANT_NOT_FOUND))
    }

    const body = request.body ?? {}
    const moduleId = body.moduleId
    const enabled = body.enabled
    const periodEndInput = body.periodEnd as string | undefined
    const billingPeriod = (body.billingPeriod as BillingPeriod | undefined) ?? 'yearly'

    if (!moduleId || typeof moduleId !== 'string') {
      return reply.status(400).send(apiError('moduleId is required', ErrorCode.BAD_REQUEST))
    }
    if (typeof enabled !== 'boolean') {
      return reply.status(400).send(apiError('enabled must be a boolean', ErrorCode.BAD_REQUEST))
    }
    if (moduleId === 'admin' && enabled === false) {
      return reply.status(400).send(apiError('Admin module cannot be turned off', ErrorCode.BAD_REQUEST))
    }

    const billingKey = tenantBillingKey({ id: tenant.id, slug: tenant.slug ?? null })
    const modules: TenantModulesMap = { ...(tenant.modules ?? {}) }
    const prevEntry = modules[moduleId] ?? {}
    const prevState = (prevEntry.state ?? 'off') as ModuleState
    const nextState: ModuleState = enabled ? 'active' : 'off'

    if (enabled && periodEndInput) {
      const existingSub = await getSubscription(billingKey, moduleId)
      const validation = validatePeriodEnd(periodEndInput, {
        forNewSubscription: !existingSub,
        existingPeriodEnd: existingSub?.periodEnd,
      })
      if (!validation.ok) {
        return reply.status(400).send(apiError(validation.error, ErrorCode.BAD_REQUEST))
      }
      const periodEndDate = validation.date
      const now = new Date()
      if (existingSub) {
        await upsertSubscription({
          tenantSlug: billingKey,
          moduleId,
          billingPeriod: existingSub.billingPeriod,
          recurringAmountUsdc: existingSub.recurringAmountUsdc,
          periodStart: existingSub.periodStart,
          periodEnd: periodEndDate,
          conditionsSnapshot: existingSub.conditionsSnapshot,
          priceSnapshot: existingSub.priceSnapshot,
        })
      } else {
        await upsertSubscription({
          tenantSlug: billingKey,
          moduleId,
          billingPeriod,
          recurringAmountUsdc: 0,
          periodStart: now,
          periodEnd: periodEndDate,
          conditionsSnapshot: {},
          priceSnapshot: minimalPriceSnapshot(moduleId),
        })
      }
      await upsertModuleBillingState(billingKey, moduleId, { periodEnd: periodEndDate })
      modules[moduleId] = {
        ...prevEntry,
        state: nextState,
        deactivatedate: periodEndDate.toISOString(),
        deactivatingUntil: prevEntry.deactivatingUntil ?? null,
        settingsjson: prevEntry.settingsjson ?? {},
      }
    } else {
      modules[moduleId] = {
        ...prevEntry,
        state: nextState,
      }
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
        ...(enabled && periodEndInput ? { periodEnd: periodEndInput } : {}),
      },
    })

    return {
      tenant: updated,
    }
  })
}

