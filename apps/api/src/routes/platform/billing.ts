import type { FastifyInstance } from 'fastify'
import type { BillingPeriod } from '@decentraguild/billing'
import type { BillingPayment, BillingSubscription } from '../../db/billing.js'
import { query } from '../../db/client.js'
import { getSubscription, listPayments, getPaymentById, confirmPayment as confirmPaymentRow, upsertSubscription } from '../../db/billing.js'
import { upsertModuleBillingState } from '../../db/module-billing-state.js'
import { tenantBillingKey } from '../../billing/service.js'
import { validatePeriodEnd } from '../../billing/validate-period-end.js'
import { minimalPriceSnapshot } from '../../billing/minimal-price-snapshot.js'
import { getTenantById, updateTenant } from '../../db/tenant.js'
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
    Params: { tenantId: string }
    Body: { moduleId: string; billingPeriod?: string; periodEnd?: string }
  }>('/api/v1/platform/tenants/:tenantId/billing/extend', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply)
    if (!admin) return

    const tenantId = request.params.tenantId.trim()
    const tenant = await getTenantById(tenantId)
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
      const validation = validatePeriodEnd(body.periodEnd, { existingPeriodEnd: currentEnd })
      if (!validation.ok) {
        return reply.status(400).send(apiError(validation.error, ErrorCode.BAD_REQUEST))
      }
      newEnd = validation.date
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

    await upsertModuleBillingState(billingKey, moduleId, { periodEnd: newEnd })
    const modules = { ...(tenant.modules ?? {}) }
    const prevEntry = modules[moduleId] ?? {}
    modules[moduleId] = {
      ...prevEntry,
      state: prevEntry.state ?? 'off',
      deactivatedate: newEnd.toISOString(),
      deactivatingUntil: prevEntry.deactivatingUntil ?? null,
      settingsjson: prevEntry.settingsjson ?? {},
    }
    await updateTenant(tenant.id, { modules })

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

  app.put<{
    Params: { tenantId: string }
    Body: { moduleId: string; periodEnd: string; billingPeriod?: string }
  }>('/api/v1/platform/tenants/:tenantId/billing/set-period-end', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply)
    if (!admin) return

    const tenantId = request.params.tenantId.trim()
    const tenant = await getTenantById(tenantId)
    if (!tenant) {
      return reply.status(404).send(apiError('Tenant not found', ErrorCode.TENANT_NOT_FOUND))
    }
    const billingKey = tenantBillingKey({ id: tenant.id, slug: tenant.slug ?? null })

    const body = request.body ?? ({} as Record<string, unknown>)
    const moduleId = body.moduleId
    const periodEndInput = body.periodEnd
    const billingPeriod = ((body.billingPeriod as BillingPeriod | undefined) ?? 'yearly') as BillingPeriod

    if (!moduleId || typeof moduleId !== 'string') {
      return reply.status(400).send(apiError('moduleId is required', ErrorCode.BAD_REQUEST))
    }
    if (!periodEndInput || typeof periodEndInput !== 'string') {
      return reply.status(400).send(apiError('periodEnd is required', ErrorCode.BAD_REQUEST))
    }

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

    const modules = { ...(tenant.modules ?? {}) }
    const prevEntry = modules[moduleId] ?? {}
    modules[moduleId] = {
      ...prevEntry,
      state: prevEntry.state ?? 'off',
      deactivatedate: periodEndDate.toISOString(),
      deactivatingUntil: prevEntry.deactivatingUntil ?? null,
      settingsjson: prevEntry.settingsjson ?? {},
    }
    await updateTenant(tenant.id, { modules })

    await insertPlatformAuditLog({
      actorWallet: admin.wallet,
      action: 'billing_set_period_end',
      targetType: 'tenant',
      targetId: tenant.slug ?? tenant.id,
      details: { moduleId, periodEnd: periodEndDate.toISOString() },
    })

    return {
      subscription: {
        billingPeriod: existingSub?.billingPeriod ?? billingPeriod,
        periodStart: (existingSub?.periodStart ?? now).toISOString(),
        periodEnd: periodEndDate.toISOString(),
        recurringAmountUsdc: existingSub?.recurringAmountUsdc ?? 0,
      },
    }
  })

  app.post<{
    Params: { tenantId: string; paymentId: string }
    Body: { txSignature?: string | null }
  }>('/api/v1/platform/tenants/:tenantId/billing/payments/:paymentId/confirm', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply)
    if (!admin) return

    const tenantId = request.params.tenantId.trim()
    const tenant = await getTenantById(tenantId)
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

