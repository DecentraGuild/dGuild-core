import type { FastifyInstance } from 'fastify'
import type { BillingPayment, BillingSubscription } from '../../db/billing.js'
import { query } from '../../db/client.js'
import { getSubscription, listPayments, getPaymentById, confirmPayment as confirmPaymentRow } from '../../db/billing.js'
import { tenantBillingKey } from '../../billing/service.js'
import { resolveTenant } from '../../db/tenant.js'
import { requirePlatformAdmin } from './common.js'
import { insertPlatformAuditLog } from '../../db/platform-audit.js'
import { apiError, ErrorCode } from '../../api-errors.js'

interface BillingSummary {
  totalMrrUsdc: number
  activeSubscriptions: number
}

async function getBillingSummary(): Promise<BillingSummary> {
  const { rows } = await query<{ total_mrr: string | null; active_subscriptions: string | null }>(
    `SELECT
       COALESCE(SUM(recurring_amount_usdc), 0) AS total_mrr,
       COUNT(*) AS active_subscriptions
     FROM billing_subscriptions
     WHERE period_end > NOW()`,
  )
  const row = rows[0] ?? { total_mrr: '0', active_subscriptions: '0' }
  return {
    totalMrrUsdc: parseFloat(row.total_mrr ?? '0'),
    activeSubscriptions: Number(row.active_subscriptions ?? '0'),
  }
}

export async function registerPlatformBillingRoutes(app: FastifyInstance) {
  app.get('/api/v1/platform/billing', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply)
    if (!admin) return

    const [summary, recentPayments] = await Promise.all([
      getBillingSummary(),
      (async () => {
        const { rows } = await query<{
          id: string
          tenant_slug: string
          module_id: string
          payment_type: string
          amount_usdc: string
          billing_period: string
          period_start: Date
          period_end: Date
          tx_signature: string | null
          status: string
          memo: string
          payer_wallet: string
          created_at: Date
          confirmed_at: Date | null
        }>(
          `SELECT id, tenant_slug, module_id, payment_type, amount_usdc, billing_period,
                  period_start, period_end, tx_signature, status, memo, payer_wallet,
                  created_at, confirmed_at
           FROM billing_payments
           WHERE status = 'confirmed'
           ORDER BY confirmed_at DESC
           LIMIT 100`,
        )
        return rows.map((r) => ({
          id: r.id,
          tenantSlug: r.tenant_slug,
          moduleId: r.module_id,
          paymentType: r.payment_type,
          amountUsdc: parseFloat(r.amount_usdc),
          billingPeriod: r.billing_period,
          periodStart: r.period_start,
          periodEnd: r.period_end,
          txSignature: r.tx_signature,
          status: r.status,
          memo: r.memo,
          payerWallet: r.payer_wallet,
          createdAt: r.created_at,
          confirmedAt: r.confirmed_at,
        })) as BillingPayment[]
      })(),
    ])

    return {
      summary,
      recentPayments,
    }
  })

  app.post<{
    Params: { slug: string }
    Body: { moduleId: string; billingPeriod?: string; periodEnd?: string }
  }>('/api/v1/platform/tenants/:slug/billing/extend', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply)
    if (!admin) return

    const slug = request.params.slug.trim()
    const tenant = await resolveTenant(slug)
    if (!tenant) {
      return reply.status(404).send(apiError('Tenant not found', ErrorCode.TENANT_NOT_FOUND))
    }
    const billingKey = tenantBillingKey({ id: tenant.id, slug: tenant.slug ?? null })

    const body = request.body ?? ({} as Record<string, unknown>)
    const moduleId = body.moduleId
    if (!moduleId || typeof moduleId !== 'string') {
      return reply.status(400).send(apiError('moduleId is required', ErrorCode.BAD_REQUEST))
    }

    const sub: BillingSubscription | null = await getSubscription(billingKey, moduleId)
    if (!sub) {
      return reply
        .status(400)
        .send(apiError('No active subscription to extend for this module', ErrorCode.BAD_REQUEST))
    }

    const currentEnd = sub.periodEnd

    let newEnd: Date
    if (body.periodEnd && typeof body.periodEnd === 'string') {
      const parsed = new Date(body.periodEnd)
      if (Number.isNaN(parsed.getTime())) {
        return reply.status(400).send(apiError('Invalid periodEnd', ErrorCode.BAD_REQUEST))
      }
      if (parsed <= currentEnd) {
        return reply
          .status(400)
          .send(apiError('periodEnd must be after current period end', ErrorCode.BAD_REQUEST))
      }
      newEnd = parsed
    } else {
      const period = sub.billingPeriod
      newEnd = new Date(currentEnd)
      if (period === 'yearly') {
        newEnd.setFullYear(newEnd.getFullYear() + 1)
      } else {
        newEnd.setMonth(newEnd.getMonth() + 1)
      }
    }

    const { rows } = await query<{
      id: string
      tenant_slug: string
      module_id: string
      billing_period: string
      recurring_amount_usdc: string
      period_start: Date
      period_end: Date
      conditions_snapshot: unknown
      price_snapshot: unknown
      created_at: Date
      updated_at: Date
    }>(
      `UPDATE billing_subscriptions
       SET period_end = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [newEnd, sub.id],
    )
    const updatedSubRow = rows[0]
    const updatedSub: BillingSubscription = {
      id: updatedSubRow.id,
      tenantSlug: updatedSubRow.tenant_slug,
      moduleId: updatedSubRow.module_id,
      billingPeriod: updatedSubRow.billing_period as BillingSubscription['billingPeriod'],
      recurringAmountUsdc: parseFloat(updatedSubRow.recurring_amount_usdc),
      periodStart: updatedSubRow.period_start,
      periodEnd: updatedSubRow.period_end,
      conditionsSnapshot: updatedSubRow.conditions_snapshot as never,
      priceSnapshot: updatedSubRow.price_snapshot as never,
      createdAt: updatedSubRow.created_at,
      updatedAt: updatedSubRow.updated_at,
    }

    await insertPlatformAuditLog({
      actorWallet: admin.wallet,
      action: 'billing_extend_subscription',
      targetType: 'tenant',
      targetId: tenant.slug ?? tenant.id,
      details: {
        moduleId,
        previousPeriodEnd: currentEnd.toISOString(),
        newPeriodEnd: newEnd.toISOString(),
      },
    })

    return {
      subscription: {
        billingPeriod: updatedSub.billingPeriod,
        periodStart: updatedSub.periodStart.toISOString(),
        periodEnd: updatedSub.periodEnd.toISOString(),
        recurringAmountUsdc: updatedSub.recurringAmountUsdc,
      },
    }
  })

  app.post<{
    Params: { slug: string; paymentId: string }
    Body: { txSignature?: string | null }
  }>('/api/v1/platform/tenants/:slug/billing/payments/:paymentId/confirm', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply)
    if (!admin) return

    const slug = request.params.slug.trim()
    const tenant = await resolveTenant(slug)
    if (!tenant) {
      return reply.status(404).send(apiError('Tenant not found', ErrorCode.TENANT_NOT_FOUND))
    }
    const billingKey = tenantBillingKey({ id: tenant.id, slug: tenant.slug ?? null })

    const paymentId = request.params.paymentId
    const body = request.body ?? ({} as Record<string, unknown>)
    const txSignature = (body.txSignature as string | null | undefined) ?? null

    const payment = await getPaymentById(paymentId)
    if (!payment) {
      return reply.status(404).send(apiError('Payment not found', ErrorCode.NOT_FOUND))
    }
    if (payment.tenantSlug !== billingKey) {
      return reply.status(403).send(apiError('Payment does not belong to this tenant', ErrorCode.FORBIDDEN))
    }

    if (payment.status === 'confirmed') {
      return { payment, alreadyConfirmed: true }
    }

    if (payment.status !== 'pending') {
      return reply.status(400).send(apiError(`Payment is ${payment.status}`, ErrorCode.BAD_REQUEST))
    }

    const signatureToStore = txSignature ?? 'platform-confirmed'
    const confirmed = await confirmPaymentRow(paymentId, signatureToStore)

    await insertPlatformAuditLog({
      actorWallet: admin.wallet,
      action: 'billing_confirm_payment_manual',
      targetType: 'tenant',
      targetId: tenant.slug ?? tenant.id,
      details: {
        paymentId,
        txSignature: txSignature ?? null,
      },
    })

    return { payment: confirmed, alreadyConfirmed: false }
  })
}

