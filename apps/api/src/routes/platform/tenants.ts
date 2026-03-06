import type { FastifyInstance } from 'fastify'
import type { TenantConfig } from '@decentraguild/core'
import { getAddonModuleIds } from '@decentraguild/config'
import { getTenantById, getAllTenantIds, getTenantBySlug, updateTenant } from '../../db/tenant.js'
import { getSubscription, listPayments } from '../../db/billing.js'
import { tenantBillingKey } from '../../billing/service.js'
import { normalizeTenantSlug } from '../../validate-slug.js'
import { requirePlatformAdmin } from './common.js'
import { apiError, ErrorCode } from '../../api-errors.js'

export async function registerPlatformTenantsRoutes(app: FastifyInstance) {
  app.get('/api/v1/platform/tenants', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply)
    if (!admin) return

    const ids = await getAllTenantIds()
    const tenants: TenantConfig[] = []
    for (const id of ids) {
      const t = await getTenantById(id)
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

  app.get<{ Params: { tenantId: string } }>('/api/v1/platform/tenants/:tenantId', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply)
    if (!admin) return

    const tenantId = request.params.tenantId.trim()
    const tenant = await getTenantById(tenantId)
    if (!tenant) {
      return reply.status(404).send(apiError('Tenant not found', ErrorCode.TENANT_NOT_FOUND))
    }

    const billingKey = tenantBillingKey({ id: tenant.id, slug: tenant.slug ?? null })
    const tenantModuleIds = Object.keys(tenant.modules ?? {})
    const addonIds = getAddonModuleIds()
    const moduleIds = [...new Set([...tenantModuleIds, ...addonIds])]

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

    const activeModules = tenantModuleIds.filter(
      (id) => (tenant.modules?.[id] as { state?: string } | undefined)?.state === 'active',
    ).length
    const stats = {
      activeModules,
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

  app.get<{
    Params: { tenantId: string }
    Querystring: { slug?: string }
  }>('/api/v1/platform/tenants/:tenantId/slug/check', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply)
    if (!admin) return

    const tenantId = request.params.tenantId.trim()
    const tenant = await getTenantById(tenantId)
    if (!tenant) {
      return reply.status(404).send(apiError('Tenant not found', ErrorCode.TENANT_NOT_FOUND))
    }

    const desired = request.query.slug
    if (!desired || typeof desired !== 'string') {
      return reply.status(400).send(apiError('slug query parameter is required', ErrorCode.BAD_REQUEST))
    }
    const normalized = normalizeTenantSlug(desired.trim())
    if (!normalized) {
      return reply.status(400).send(apiError('Invalid slug: use only lowercase letters, numbers, and hyphens (1–64 chars)', ErrorCode.INVALID_SLUG))
    }
    if (tenant.slug === normalized) {
      return { available: true }
    }
    const existing = await getTenantBySlug(normalized)
    return { available: !existing || existing.id === tenantId }
  })

  app.patch<{
    Params: { tenantId: string }
    Body: { slug?: string }
  }>('/api/v1/platform/tenants/:tenantId/slug', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply)
    if (!admin) return

    const tenantId = request.params.tenantId.trim()
    const tenant = await getTenantById(tenantId)
    if (!tenant) {
      return reply.status(404).send(apiError('Tenant not found', ErrorCode.TENANT_NOT_FOUND))
    }

    const raw = request.body?.slug
    if (raw === undefined || raw === null) {
      return reply.status(400).send(apiError('slug is required', ErrorCode.BAD_REQUEST))
    }
    const normalized = typeof raw === 'string' ? normalizeTenantSlug(raw.trim()) : null
    if (!normalized) {
      return reply.status(400).send(apiError('Invalid slug: use only lowercase letters, numbers, and hyphens (1–64 chars)', ErrorCode.INVALID_SLUG))
    }

    const existing = await getTenantBySlug(normalized)
    if (existing && existing.id !== tenantId) {
      return reply.status(400).send(apiError('Slug is already in use by another tenant', ErrorCode.INVALID_SLUG))
    }

    const updated = await updateTenant(tenantId, { slug: normalized })
    if (!updated) {
      return reply.status(500).send(apiError('Failed to update tenant slug', ErrorCode.INTERNAL_ERROR))
    }
    return { tenant: updated }
  })
}

