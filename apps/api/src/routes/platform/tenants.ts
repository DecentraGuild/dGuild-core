import type { FastifyInstance } from 'fastify'
import type { TenantConfig } from '@decentraguild/core'
import { resolveTenant, getAllTenantSlugs } from '../../db/tenant.js'
import { getSubscription, listPayments } from '../../db/billing.js'
import { tenantBillingKey } from '../../billing/service.js'
import { requirePlatformAdmin } from './common.js'
import { apiError, ErrorCode } from '../../api-errors.js'

export async function registerPlatformTenantsRoutes(app: FastifyInstance) {
  app.get('/api/v1/platform/tenants', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply)
    if (!admin) return

    const ids = await getAllTenantSlugs()
    const tenants: TenantConfig[] = []
    for (const idOrSlug of ids) {
      const t = await resolveTenant(idOrSlug)
      if (t) tenants.push(t)
    }

    return {
      tenants: tenants.map((t) => ({
        id: t.id,
        slug: t.slug ?? null,
        name: t.name,
        description: t.description ?? null,
        modules: t.modules ?? {},
        admins: t.admins ?? [],
        treasury: t.treasury ?? null,
        createdAt: t.createdAt ?? null,
      })),
    }
  })

  app.get<{ Params: { slug: string } }>('/api/v1/platform/tenants/:slug', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply)
    if (!admin) return

    const slug = request.params.slug.trim()
    const tenant = await resolveTenant(slug)
    if (!tenant) {
      return reply.status(404).send(apiError('Tenant not found', ErrorCode.TENANT_NOT_FOUND))
    }

    const billingKey = tenantBillingKey({ id: tenant.id, slug: tenant.slug ?? null })
    const moduleIds = Object.keys(tenant.modules ?? {})

    const [subscriptionsByModule, payments] = await Promise.all([
      Promise.all(
        moduleIds.map(async (id) => {
          const sub = await getSubscription(billingKey, id)
          return [id, sub] as const
        }),
      ),
      listPayments(billingKey, { limit: 100, offset: 0 }),
    ])

    const subscriptions: Record<
      string,
      | {
          billingPeriod: string
          periodStart: string
          periodEnd: string
          recurringAmountUsdc: number
        }
      | null
    > = {}

    for (const [id, sub] of subscriptionsByModule) {
      if (!sub) {
        subscriptions[id] = null
      } else {
        subscriptions[id] = {
          billingPeriod: sub.billingPeriod,
          periodStart: sub.periodStart.toISOString(),
          periodEnd: sub.periodEnd.toISOString(),
          recurringAmountUsdc: sub.recurringAmountUsdc,
        }
      }
    }

    const stats = {
      activeModules: moduleIds.length,
      totalPayments: payments.length,
      lastPaymentAt: payments[0]?.confirmedAt?.toISOString() ?? null,
    }

    return {
      tenant,
      billing: {
        subscriptions,
        payments,
      },
      stats,
    }
  })
}

