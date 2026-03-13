/**
 * Billing Edge Function.
 *
 * ID-BASED LOGIC: All tenant identity is by tenant_id (tenant_config.id). Never use slug
 * for lookups, FKs, or payment records. Slug is used only for the "slug" add-on (custom
 * subdomain display); when that module is paid we write tenant_config.slug for routing.
 *
 * Actions:
 *   preview          – Return live conditions and computed price for a module.
 *   intent           – Create a payment intent (initial, upgrade, add_unit, slug claim).
 *   confirm          – Verify on-chain USDC transfer and update DB (subscription + tenant).
 *   extend-intent    – Create an extend payment intent.
 *   expire-stale     – (cron) Mark stale pending payments as expired.
 *   raffle-intent    – Create a per-raffle payment intent.
 *   register-intent  – Create a registration (tenant creation) payment intent.
 *   register-confirm – Confirm registration payment and create tenant.
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getWalletFromAuthHeader } from '../_shared/auth.ts'

// ---------------------------------------------------------------------------
// Billing engine and catalog (pure TypeScript — no Node APIs)
// ---------------------------------------------------------------------------

import { computePrice, getOneTimePerUnitForTier } from '@decentraguild/billing'
import type { BillingPeriod, ConditionSet, PriceResult } from '@decentraguild/billing'

// ---------------------------------------------------------------------------
// Solana (USDC verification)
// ---------------------------------------------------------------------------

import { Connection, PublicKey } from 'npm:@solana/web3.js@1'
import { TOKEN_PROGRAM_ID } from 'npm:@solana/spl-token@0.4'

const BILLING_WALLET = new PublicKey('4CJYmVAcBrgYL6iX4gUKSMeJxTm4hK3eNAzuzaYBZMCv')
const BILLING_WALLET_ATA = new PublicKey('FoxSYPF93hPnpNoZ3eUjEAii3p6fdEESNZJe6fHbRUxr')
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
const USDC_DECIMALS = 6
const PAYMENT_INTENT_TTL_MINUTES = 30

// ---------------------------------------------------------------------------
// Module catalog (imported from config package — Deno compatible)
// ---------------------------------------------------------------------------

import { getModuleCatalogEntry } from '@decentraguild/config'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSolanaConnection(): Connection {
  const rpcUrl =
    Deno.env.get('HELIUS_RPC_URL') ??
    Deno.env.get('SOLANA_RPC_URL') ??
    'https://api.mainnet-beta.solana.com'
  return new Connection(rpcUrl, 'confirmed')
}

function generateMemo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return `dg:${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

const MS_PER_DAY = 86_400_000

function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

function periodEndFromStart(start: Date, period: BillingPeriod): Date {
  return addMonths(start, period === 'yearly' ? 12 : 1)
}

function roundUsdc(value: number): number {
  return Math.round(value * 10 ** USDC_DECIMALS) / 10 ** USDC_DECIMALS
}

function periodAmount(price: PriceResult, period: BillingPeriod): number {
  if (price.oneTimeTotal > 0) return price.oneTimeTotal
  return period === 'yearly' ? price.recurringYearly : price.recurringMonthly
}

const WATCHTOWER_SCOPE_KEYS = ['holders_current', 'mintsSnapshot', 'mintsTransactions'] as const

function getModuleScopeKeys(moduleId: string): readonly string[] {
  if (moduleId === 'watchtower') return WATCHTOWER_SCOPE_KEYS
  return []
}

interface SubscriptionRow {
  scope_key: string
  recurring_amount_usdc: number
  period_start: string
  period_end: string
  price_snapshot: Record<string, unknown>
  conditions_snapshot?: Record<string, unknown>
}

async function getExistingSubscriptionRows(
  db: ReturnType<typeof getAdminClient>,
  tenantId: string,
  moduleId: string,
): Promise<SubscriptionRow[]> {
  const scopeKeys = getModuleScopeKeys(moduleId)
  const selectCols = 'scope_key, recurring_amount_usdc, period_start, period_end, price_snapshot, conditions_snapshot'
  if (scopeKeys.length === 0) {
    const { data } = await db
      .from('billing_subscriptions')
      .select(selectCols)
      .eq('tenant_id', tenantId)
      .eq('module_id', moduleId)
      .eq('scope_key', '')
      .maybeSingle()
    if (!data) return []
    const row = data as unknown as SubscriptionRow
    return [{ ...row, scope_key: (row.scope_key as string) ?? '' }]
  }
  const { data: rows } = await db
    .from('billing_subscriptions')
    .select(selectCols)
    .eq('tenant_id', tenantId)
    .eq('module_id', moduleId)
  return (rows ?? []) as unknown as SubscriptionRow[]
}

async function upsertSubscriptionsForModule(
  db: ReturnType<typeof getAdminClient>,
  tenantId: string,
  moduleId: string,
  conditions: ConditionSet,
  periodStart: Date,
  periodEnd: Date,
  period: BillingPeriod,
  price: PriceResult,
): Promise<void> {
  const scopeKeys = getModuleScopeKeys(moduleId)
  const recurringAmount = period === 'yearly' ? (price.recurringYearly ?? 0) : (price.recurringMonthly ?? 0)
  if (scopeKeys.length === 0) {
    await db.from('billing_subscriptions').upsert(
      {
        tenant_id: tenantId,
        module_id: moduleId,
        scope_key: '',
        billing_period: period,
        recurring_amount_usdc: recurringAmount,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        conditions_snapshot: conditions,
        price_snapshot: price,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,module_id,scope_key' },
    )
    return
  }
  const catalogEntry = getModuleCatalogEntry(moduleId)
  const pricing = catalogEntry?.pricing as { addons: Array<{ conditionKey: string; recurringPricePerUnit: number }>; yearlyDiscountPercent?: number } | null
  const yearlyDiscount = pricing?.yearlyDiscountPercent ?? 0
  const discountMultiplier = 1 - yearlyDiscount / 100
  const cond = conditions as Record<string, number>
  for (const key of scopeKeys) {
    const count = Number(cond[key]) || 0
    if (count <= 0) continue
    if (!pricing?.addons) continue
    const addon = pricing.addons.find((a) => a.conditionKey === key)
    const unitPrice = addon?.recurringPricePerUnit ?? 0
    const scopeRecurring =
      period === 'yearly' ? unitPrice * count * 12 * discountMultiplier : unitPrice * count
    await db.from('billing_subscriptions').upsert(
      {
        tenant_id: tenantId,
        module_id: moduleId,
        scope_key: key,
        billing_period: period,
        recurring_amount_usdc: scopeRecurring,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        conditions_snapshot: { [key]: count },
        price_snapshot: price,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,module_id,scope_key' },
    )
  }
}

// ---------------------------------------------------------------------------
// Condition extractors (using Supabase admin client)
// ---------------------------------------------------------------------------

async function getConditions(moduleId: string, tenantId: string): Promise<ConditionSet> {
  const db = getAdminClient()
  if (moduleId === 'slug') return {}

  if (moduleId === 'marketplace') {
    const { data: ms } = await db
      .from('marketplace_settings')
      .select('settings')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (!ms?.settings) return { mintsCount: 0, baseCurrenciesCount: 0, customCurrenciesCount: 0, monetizeStorefront: false }
    const s = ms.settings as Record<string, unknown>
    const colls = (s.collectionMints as unknown[]) ?? []
    const spls = (s.splAssetMints as unknown[]) ?? []
    const currencies = (s.currencyMints as Array<{ mint: string }>) ?? []
    const BASE_MINTS = new Set([
      'So11111111111111111111111111111111111111112',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    ])
    const baseCurrenciesCount = currencies.filter((c) => BASE_MINTS.has(c.mint)).length
    const customCurrenciesCount = currencies.length - baseCurrenciesCount
    const fee = (s.shopFee ?? {}) as Record<string, number>
    const monetizeStorefront =
      (fee.makerFlatFee ?? 0) > 0 ||
      (fee.takerFlatFee ?? 0) > 0 ||
      (fee.makerPercentFee ?? 0) > 0 ||
      (fee.takerPercentFee ?? 0) > 0
    return { mintsCount: colls.length + spls.length, baseCurrenciesCount, customCurrenciesCount, monetizeStorefront }
  }

  if (moduleId === 'discord') {
    return {}
  }

  if (moduleId === 'gates') {
    const { count } = await db
      .from('gate_lists')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
    return { listsCount: count ?? 0 }
  }

  if (moduleId === 'raffles') {
    const { count } = await db
      .from('tenant_raffles')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('closed_at', null)
    return { raffleSlotsUsed: count ?? 0 }
  }

  if (moduleId === 'watchtower') {
    const { data: rows } = await db
      .from('watchtower_watches')
      .select('track_discord, track_snapshot, track_transactions')
      .eq('tenant_id', tenantId)
    const watches = rows ?? []
    const holders_current = watches.filter((r) => r.track_discord === true).length
    const mintsSnapshot = watches.filter((r) => r.track_snapshot === true).length
    const mintsTransactions = watches.filter((r) => r.track_transactions === true).length
    return { holders_current, mintsSnapshot, mintsTransactions }
  }

  if (moduleId === 'shipment') {
    return { recipientsCount: 0 }
  }

  if (moduleId === 'crafter') {
    const { count } = await db
      .from('crafter_tokens')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
    return { tokensCount: count ?? 0 }
  }

  return {}
}

// ---------------------------------------------------------------------------
// On-chain USDC verification
// ---------------------------------------------------------------------------

async function verifyBillingPayment(params: {
  txSignature: string
  expectedAmountUsdc: number
  expectedMemo: string
}): Promise<{ valid: boolean; error?: string }> {
  const { txSignature, expectedAmountUsdc, expectedMemo } = params
  try {
    const connection = getSolanaConnection()
    const tx = await connection.getParsedTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })
    if (!tx) return { valid: false, error: 'Transaction not found or not yet confirmed' }
    if (tx.meta?.err) return { valid: false, error: `Transaction failed on-chain` }

    const expectedBaseUnits = BigInt(Math.round(expectedAmountUsdc * 10 ** USDC_DECIMALS))
    const expectedAta = BILLING_WALLET_ATA.toBase58()
    let transferFound = false
    let memoFound = false

    function scanInstructions(instructions: unknown[]) {
      for (const ix of instructions) {
        const i = ix as Record<string, unknown>
        if ('parsed' in i && (i.programId as PublicKey)?.equals?.(TOKEN_PROGRAM_ID)) {
          const parsed = i.parsed as { type?: string; info?: { amount?: string; destination?: string; tokenAmount?: { amount?: string } } }
          if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
            const dest = parsed.info?.destination
            const amount = parsed.info?.tokenAmount?.amount ?? parsed.info?.amount
            if (dest === expectedAta && amount != null && BigInt(amount) >= expectedBaseUnits) {
              transferFound = true
            }
          }
        }
        if ('parsed' in i && (i.programId as PublicKey)?.equals?.(MEMO_PROGRAM_ID)) {
          const memoData = typeof i.parsed === 'string' ? i.parsed : ''
          if (memoData === expectedMemo) memoFound = true
        }
        if (!('parsed' in i) && (i.programId as PublicKey)?.equals?.(MEMO_PROGRAM_ID)) {
          try {
            const raw = (i as { data?: string }).data ?? ''
            const decoded = new TextDecoder().decode(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)))
            if (decoded === expectedMemo) memoFound = true
          } catch { /* ignore */ }
        }
      }
    }

    scanInstructions(tx.transaction.message.instructions as unknown[])
    for (const inner of tx.meta?.innerInstructions ?? []) {
      scanInstructions(inner.instructions as unknown[])
    }

    if (!transferFound) return { valid: false, error: `USDC transfer not found in transaction` }
    if (!memoFound) return { valid: false, error: 'Payment memo not found in transaction' }
    return { valid: true }
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : 'Verification failed' }
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  const authHeader = req.headers.get('Authorization')

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', req)
  }

  const action = body.action as string
  const db = getAdminClient()

  // ---------------------------------------------------------------------------
  // preview – price preview (admin only)
  // ---------------------------------------------------------------------------
  if (action === 'preview') {
    const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : ''
    const moduleId = body.moduleId as string
    const billingPeriod = (body.billingPeriod as BillingPeriod) ?? 'monthly'
    const overrideConditions = body.conditions as ConditionSet | undefined

    if (!tenantId || !moduleId) return errorResponse('tenantId and moduleId required', req)

    const catalogEntry = getModuleCatalogEntry(moduleId)
    if (!catalogEntry?.pricing) return errorResponse('Module not found or not billable', req, 404)

    const conditions: ConditionSet =
      overrideConditions ?? (await getConditions(moduleId, tenantId))
    const price = computePrice(moduleId, conditions, catalogEntry.pricing, { billingPeriod })
    return jsonResponse({ conditions, price }, req)
  }

  // ---------------------------------------------------------------------------
  // intent – create payment intent (tenantId = tenant_config.id only)
  // ---------------------------------------------------------------------------
  if (action === 'intent') {
    const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : ''
    const moduleId = body.moduleId as string
    const billingPeriod: BillingPeriod = (body.billingPeriod as BillingPeriod) ?? 'monthly'
    const payerWalletRaw = body.payerWallet as string
    const slugToClaim = body.slug as string | undefined
    const overrideConditions = body.conditions as ConditionSet | undefined

    if (!tenantId || !moduleId) return errorResponse('tenantId and moduleId required', req)
    let resolvedPayerWallet = typeof payerWalletRaw === 'string' ? payerWalletRaw.trim() || null : null
    if (!resolvedPayerWallet) {
      resolvedPayerWallet = (await getWalletFromAuthHeader(authHeader)) ?? ''
      if (!resolvedPayerWallet) return errorResponse('Unauthenticated', req, 401)
    }

    const catalogEntry = getModuleCatalogEntry(moduleId)
    if (!catalogEntry?.pricing) return errorResponse('Module not found or not billable', req, 404)

    const { data: tenant } = await db.from('tenant_config').select('id, slug').eq('id', tenantId).maybeSingle()
    if (!tenant) return errorResponse('Tenant not found', req, 404)

    if (moduleId === 'slug') {
      if (!slugToClaim) return errorResponse('slug required for slug claim', req)
      if (tenant.slug) return errorResponse('Tenant already has a custom slug', req, 409)
      const { data: existing } = await db.from('tenant_config').select('id').eq('slug', slugToClaim).maybeSingle()
      if (existing) return errorResponse('Slug is not available', req, 409)
    }

    const conditions: ConditionSet = overrideConditions ?? (await getConditions(moduleId, tenantId))
    if (moduleId === 'slug' && slugToClaim) {
      (conditions as Record<string, unknown>).slugToClaim = slugToClaim
    }

    const period: BillingPeriod = moduleId === 'slug' ? 'yearly' : billingPeriod
    const price = computePrice(moduleId, conditions, catalogEntry.pricing, { billingPeriod: period })

    // Expire stale pending payments
    await db
      .from('billing_payments')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())

    const existingRows = await getExistingSubscriptionRows(db, tenantId, moduleId)
    const now = new Date()
    const activeRows = existingRows.filter((r) => new Date(r.period_end) > now)
    const existingSub =
      activeRows.length > 0
        ? {
            recurring_amount_usdc: activeRows.reduce((sum, r) => sum + Number(r.recurring_amount_usdc), 0),
            period_start: activeRows[0].period_start,
            period_end: activeRows[0].period_end,
          }
        : null
    if (existingSub && activeRows.length > 1) {
      const minEnd = activeRows.reduce(
        (min, r) => (new Date(r.period_end) < min ? new Date(r.period_end) : min),
        new Date(activeRows[0].period_end),
      )
      ;(existingSub as { period_end: string }).period_end = minEnd.toISOString()
    }

    const newAmount = periodAmount(price, period)
    let paymentType: 'initial' | 'upgrade_prorate' | 'add_unit' = 'initial'
    let amountUsdc = roundUsdc(newAmount)
    let periodStart = now
    let periodEnd = periodEndFromStart(now, period)
    let noPaymentRequired = false
    let withinPaidLimit = false

    if (price.oneTimeTotal > 0 && price.recurringMonthly === 0 && price.recurringYearly === 0) {
      paymentType = 'add_unit'
      noPaymentRequired = newAmount <= 0
    } else if (!existingSub || new Date(existingSub.period_end) <= now) {
      paymentType = 'initial'
      noPaymentRequired = newAmount <= 0
    } else {
      const currentAmount = Number(existingSub.recurring_amount_usdc)
      let withinPaidLimit = newAmount <= currentAmount
      if (moduleId === 'watchtower') {
        const paidByScope: Record<string, number> = {}
        for (const r of activeRows) {
          const row = r as SubscriptionRow
          const cond = (row.conditions_snapshot as Record<string, number>) ?? {}
          const key = (row.scope_key as string) ?? ''
          if (key) paidByScope[key] = Math.max(paidByScope[key] ?? 0, Number(cond[key]) || 0)
        }
        const newCond = conditions as Record<string, number>
        withinPaidLimit = WATCHTOWER_SCOPE_KEYS.every(
          (k) => (Number(newCond[k]) || 0) <= (paidByScope[k] ?? 0),
        )
      }
      if (withinPaidLimit) {
        noPaymentRequired = true
        paymentType = 'upgrade_prorate'
        periodStart = new Date(activeRows[0].period_start)
        periodEnd = new Date(existingSub.period_end)
        amountUsdc = 0
      } else {
        let credit = 0
        for (const r of activeRows) {
          const totalMs = new Date(r.period_end).getTime() - new Date(r.period_start).getTime()
          const totalDays = Math.max(1, Math.ceil(totalMs / MS_PER_DAY))
          const remainingMs = new Date(r.period_end).getTime() - now.getTime()
          const remainingDays = Math.max(1, Math.ceil(remainingMs / MS_PER_DAY))
          credit += (Number(r.recurring_amount_usdc) / totalDays) * remainingDays
        }
        amountUsdc = roundUsdc(Math.max(0, newAmount - credit))
        paymentType = 'upgrade_prorate'
        noPaymentRequired = amountUsdc <= 0
      }
    }

    if (noPaymentRequired) {
      if (moduleId === 'slug') {
        const slugToApply = (conditions as Record<string, unknown>).slugToClaim as string
        if (slugToApply) {
          await db.from('tenant_config').update({ slug: slugToApply }).eq('id', tenantId)
        }
      }
      const currentRecurring = Number(existingSub?.recurring_amount_usdc ?? 0)
      const isDowngrade = paymentType === 'upgrade_prorate' && newAmount <= currentRecurring
      const skipBillingUpdate = isDowngrade || (moduleId === 'watchtower' && withinPaidLimit)
      if (!skipBillingUpdate) {
        await upsertSubscriptionsForModule(
          db,
          tenantId,
          moduleId,
          conditions,
          periodStart,
          periodEnd,
          period,
          price,
        )
      }
      return jsonResponse({
        noPaymentRequired: true,
        amountUsdc: 0,
        billingPeriod: period,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      }, req)
    }

    const memo = generateMemo()
    const expiresAt = new Date(now.getTime() + PAYMENT_INTENT_TTL_MINUTES * 60 * 1000)
    const wallet = resolvedPayerWallet

    const { data: payment, error: insertError } = await db
      .from('billing_payments')
      .insert({
        tenant_id: tenantId,
        module_id: moduleId,
        scope_key: '',
        payment_type: paymentType,
        amount_usdc: amountUsdc,
        billing_period: period,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        payer_wallet: wallet,
        memo,
        conditions_snapshot: conditions,
        price_snapshot: price,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (insertError) return errorResponse(insertError.message, req, 500)

    return jsonResponse({
      noPaymentRequired: false,
      paymentId: (payment as Record<string, unknown>).id,
      amountUsdc,
      memo,
      recipientWallet: BILLING_WALLET.toBase58(),
      recipientAta: BILLING_WALLET_ATA.toBase58(),
      billingPeriod: period,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    }, req)
  }

  // ---------------------------------------------------------------------------
  // confirm – verify payment and activate subscription
  // ---------------------------------------------------------------------------
  if (action === 'confirm') {
    const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : ''
    const paymentId = body.paymentId as string
    const txSignature = body.txSignature as string
    if (!tenantId || !paymentId || !txSignature) {
      return errorResponse('tenantId, paymentId, txSignature required', req)
    }

    const { data: payment, error: payErr } = await db
      .from('billing_payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle()

    if (payErr || !payment) return errorResponse('Payment not found', req, 404)
    const p = payment as Record<string, unknown>
    if (p.tenant_id !== tenantId) return errorResponse('Payment does not belong to tenant', req, 403)
    if (p.status === 'confirmed') {
      const { data: t } = await db.from('tenant_config').select('*').eq('id', tenantId).maybeSingle()
      return jsonResponse({ success: true, alreadyConfirmed: true, tenant: t }, req)
    }
    if (p.status !== 'pending') return errorResponse(`Payment is ${p.status}`, req, 409)
    if (new Date(p.expires_at as string) < new Date()) {
      await db.from('billing_payments').update({ status: 'failed' }).eq('id', paymentId)
      return errorResponse('Payment intent has expired', req, 410)
    }

    const verify = await verifyBillingPayment({
      txSignature,
      expectedAmountUsdc: p.amount_usdc as number,
      expectedMemo: p.memo as string,
    })
    if (!verify.valid) return errorResponse(verify.error ?? 'Payment verification failed', req, 422)

    await db
      .from('billing_payments')
      .update({ status: 'confirmed', tx_signature: txSignature, confirmed_at: new Date().toISOString() })
      .eq('id', paymentId)

    const moduleId = p.module_id as string
    const billingPeriod = p.billing_period as BillingPeriod

    if (moduleId === 'slug') {
      const conditions = (p.conditions_snapshot as Record<string, unknown>) ?? {}
      const slugToClaim = conditions.slugToClaim as string
      if (slugToClaim) {
        await db.from('tenant_config').update({ slug: slugToClaim }).eq('id', tenantId)
      }
      const priceSnap = p.price_snapshot as Record<string, unknown>
      const recurringAmount =
        billingPeriod === 'yearly'
          ? (priceSnap?.recurringYearly as number)
          : (priceSnap?.recurringMonthly as number)
      await db.from('billing_subscriptions').upsert(
        {
          tenant_id: tenantId,
          module_id: moduleId,
          scope_key: '',
          billing_period: billingPeriod,
          recurring_amount_usdc: recurringAmount ?? p.amount_usdc,
          period_start: p.period_start,
          period_end: p.period_end,
          conditions_snapshot: p.conditions_snapshot ?? {},
          price_snapshot: p.price_snapshot ?? {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,module_id,scope_key' },
      )
    } else if (p.payment_type !== 'add_unit') {
      if (p.payment_type === 'extend') {
        await db
          .from('billing_subscriptions')
          .update({
            period_start: p.period_start,
            period_end: p.period_end,
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenantId)
          .eq('module_id', moduleId)
      } else {
        const conditions = (p.conditions_snapshot as ConditionSet) ?? {}
        await upsertSubscriptionsForModule(
          db,
          tenantId,
          moduleId,
          conditions,
          new Date(p.period_start as string),
          new Date(p.period_end as string),
          billingPeriod,
          p.price_snapshot as PriceResult,
        )
      }

      const { data: tenantRow } = await db.from('tenant_config').select('modules').eq('id', tenantId).maybeSingle()
      const modules = (tenantRow?.modules as Record<string, Record<string, unknown>>) ?? {}
      const prev = (modules[moduleId] ?? {}) as Record<string, unknown>
      if (prev.state !== 'active') {
        modules[moduleId] = {
          state: 'active',
          deactivatedate: null,
          deactivatingUntil: null,
          settingsjson: prev.settingsjson ?? {},
        }
        await db.from('tenant_config').update({ modules, updated_at: new Date().toISOString() }).eq('id', tenantId)
      }
    }

    const { data: updatedTenant } = await db.from('tenant_config').select('*').eq('id', tenantId).maybeSingle()
    return jsonResponse({ success: true, tenant: updatedTenant }, req)
  }

  // ---------------------------------------------------------------------------
  // extend-intent – create payment intent to extend a subscription
  // ---------------------------------------------------------------------------
  if (action === 'extend-intent') {
    const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : ''
    const moduleId = body.moduleId as string
    const billingPeriod: BillingPeriod = (body.billingPeriod as BillingPeriod) ?? 'monthly'
    const payerWallet = (body.payerWallet as string) ?? ''

    if (!tenantId || !moduleId) return errorResponse('tenantId and moduleId required', req)

    const catalogEntry = getModuleCatalogEntry(moduleId)
    if (!catalogEntry?.pricing) return errorResponse('Module not found or not billable', req, 404)

    const { data: existingRows } = await db
      .from('billing_subscriptions')
      .select('period_start, period_end, billing_period, price_snapshot')
      .eq('tenant_id', tenantId)
      .eq('module_id', moduleId)
    const hasRows = Array.isArray(existingRows) && existingRows.length > 0
    let existingSub: { period_start: string; period_end: string } | null = hasRows
      ? (existingRows as { period_start: string; period_end: string }[]).reduce(
          (best, r) =>
            !best || new Date(r.period_end) < new Date(best.period_end) ? r : best,
          null as { period_start: string; period_end: string } | null,
        )
      : null

    if (!existingSub && moduleId === 'slug') {
      const { data: lastPayments } = await db
        .from('billing_payments')
        .select('period_start, period_end, billing_period, price_snapshot')
        .eq('tenant_id', tenantId)
        .eq('module_id', 'slug')
        .eq('status', 'confirmed')
        .order('confirmed_at', { ascending: false })
        .limit(1)
      const lastPayment = Array.isArray(lastPayments) ? lastPayments[0] : null
      if (lastPayment) {
        const lp = lastPayment as Record<string, unknown>
        existingSub = {
          period_start: lp.period_start as string,
          period_end: lp.period_end as string,
        }
        const priceSnap = (lp.price_snapshot as Record<string, unknown>) ?? {}
        await db.from('billing_subscriptions').upsert(
          {
            tenant_id: tenantId,
            module_id: moduleId,
            scope_key: '',
            billing_period: lp.billing_period,
            recurring_amount_usdc: (priceSnap.recurringYearly as number) ?? 0,
            period_start: lp.period_start,
            period_end: lp.period_end,
            conditions_snapshot: {},
            price_snapshot: lp.price_snapshot ?? {},
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id,module_id,scope_key' },
        )
      }
    }

    if (!existingSub) return errorResponse('No active subscription to extend', req, 404)

    const conditions = await getConditions(moduleId, tenantId)
    const price = computePrice(moduleId, conditions, catalogEntry.pricing, { billingPeriod })
    const amount = periodAmount(price, billingPeriod)
    const periodStart = new Date((existingSub as Record<string, unknown>).period_end as string)
    const periodEnd = periodEndFromStart(periodStart, billingPeriod)
    const amountUsdc = roundUsdc(amount)
    const memo = generateMemo()
    const expiresAt = new Date(Date.now() + PAYMENT_INTENT_TTL_MINUTES * 60 * 1000)

    await db
      .from('billing_payments')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())

    const { data: payment, error: insertErr } = await db
      .from('billing_payments')
      .insert({
        tenant_id: tenantId,
        module_id: moduleId,
        scope_key: '',
        payment_type: 'extend',
        amount_usdc: amountUsdc,
        billing_period: billingPeriod,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        payer_wallet: payerWallet,
        memo,
        conditions_snapshot: conditions,
        price_snapshot: price,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (insertErr) return errorResponse(insertErr.message, req, 500)

    return jsonResponse({
      noPaymentRequired: false,
      paymentId: (payment as Record<string, unknown>).id,
      amountUsdc,
      memo,
      recipientWallet: BILLING_WALLET.toBase58(),
      recipientAta: BILLING_WALLET_ATA.toBase58(),
      billingPeriod,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    }, req)
  }

  // ---------------------------------------------------------------------------
  // raffle-intent – create per-raffle payment intent
  // ---------------------------------------------------------------------------
  if (action === 'raffle-intent') {
    const tenantId = body.tenantId as string
    const payerWallet = (body.payerWallet as string) ?? ''

    const catalogEntry = getModuleCatalogEntry('raffles')
    const pricing = catalogEntry?.pricing
    if (!pricing || (pricing as Record<string, unknown>).modelType !== 'tiered_with_one_time_per_unit') {
      return errorResponse('Raffle module pricing not configured', req, 500)
    }

    const conditions = await getConditions('raffles', tenantId)
    const price = computePrice('raffles', conditions, pricing, { billingPeriod: 'monthly' })
    const { data: sub } = await db
      .from('billing_subscriptions')
      .select('price_snapshot')
      .eq('tenant_id', tenantId)
      .eq('module_id', 'raffles')
      .maybeSingle()
    const { data: state } = await db
      .from('tenant_module_billing_state')
      .select('selected_tier_id')
      .eq('tenant_id', tenantId)
      .eq('module_id', 'raffles')
      .maybeSingle()

    const selectedTierId =
      ((sub?.price_snapshot as Record<string, unknown>)?.selectedTierId as string) ??
      ((state as Record<string, unknown> | null)?.selected_tier_id as string) ??
      price.selectedTierId ??
      'base'

    const oneTimeAmount = getOneTimePerUnitForTier(pricing, selectedTierId)
    if (oneTimeAmount <= 0) return jsonResponse({ noPaymentRequired: true }, req)

    await db.from('billing_payments').update({ status: 'expired' }).eq('status', 'pending').lt('expires_at', new Date().toISOString())

    const memo = generateMemo()
    const expiresAt = new Date(Date.now() + PAYMENT_INTENT_TTL_MINUTES * 60 * 1000)
    const now = new Date()

    const { data: payment, error: insertErr } = await db
      .from('billing_payments')
      .insert({
        tenant_id: tenantId,
        module_id: 'raffles',
        scope_key: '',
        payment_type: 'add_unit',
        amount_usdc: oneTimeAmount,
        billing_period: 'monthly',
        period_start: now.toISOString(),
        period_end: now.toISOString(),
        payer_wallet: payerWallet,
        memo,
        conditions_snapshot: conditions,
        price_snapshot: { ...price, oneTimePerUnitForSelectedTier: oneTimeAmount },
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (insertErr) return errorResponse(insertErr.message, req, 500)

    return jsonResponse({
      noPaymentRequired: false,
      paymentId: (payment as Record<string, unknown>).id,
      amountUsdc: oneTimeAmount,
      memo,
      recipientWallet: BILLING_WALLET.toBase58(),
      recipientAta: BILLING_WALLET_ATA.toBase58(),
      billingPeriod: 'monthly',
      periodStart: now.toISOString(),
      periodEnd: now.toISOString(),
    }, req)
  }

  // ---------------------------------------------------------------------------
  // register-intent – registration payment intent (new tenant)
  // ---------------------------------------------------------------------------
  if (action === 'register-intent') {
    const payerWallet = body.payerWallet as string
    if (!payerWallet) return errorResponse('payerWallet required', req)

    const catalogEntry = getModuleCatalogEntry('admin')
    if (!catalogEntry?.pricing) return errorResponse('Admin module pricing not configured', req, 500)

    const price = computePrice('admin', {}, catalogEntry.pricing, { billingPeriod: 'yearly' })
    const amountUsdc = price.oneTimeTotal || price.recurringYearly || 0
    if (amountUsdc <= 0) return jsonResponse({ noPaymentRequired: true }, req)

    const memo = generateMemo()
    const expiresAt = new Date(Date.now() + PAYMENT_INTENT_TTL_MINUTES * 60 * 1000)
    const now = new Date()

    const { data: payment, error: insertErr } = await db
      .from('billing_payments')
      .insert({
        tenant_id: 'pending_registration',
        module_id: 'admin',
        scope_key: '',
        payment_type: 'registration',
        amount_usdc: amountUsdc,
        billing_period: 'yearly',
        period_start: now.toISOString(),
        period_end: periodEndFromStart(now, 'yearly').toISOString(),
        payer_wallet: payerWallet,
        memo,
        conditions_snapshot: {},
        price_snapshot: price,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (insertErr) return errorResponse(insertErr.message, req, 500)

    return jsonResponse({
      noPaymentRequired: false,
      paymentId: (payment as Record<string, unknown>).id,
      amountUsdc,
      memo,
      recipientWallet: BILLING_WALLET.toBase58(),
      recipientAta: BILLING_WALLET_ATA.toBase58(),
    }, req)
  }

  // ---------------------------------------------------------------------------
  // register-confirm – confirm registration and create tenant
  // ---------------------------------------------------------------------------
  if (action === 'register-confirm') {
    const paymentId = body.paymentId as string
    const txSignature = body.txSignature as string
    const tenantName = body.tenantName as string
    const payerWallet = body.payerWallet as string
    const description = (body.description as string) || null
    const logo = (body.logo as string) || null
    const discordInviteLink = (body.discordInviteLink as string) || null
    if (!paymentId || !txSignature || !tenantName || !payerWallet) {
      return errorResponse('paymentId, txSignature, tenantName, payerWallet required', req)
    }

    const { data: payment } = await db.from('billing_payments').select('*').eq('id', paymentId).maybeSingle()
    if (!payment) return errorResponse('Payment not found', req, 404)
    const p = payment as Record<string, unknown>
    if (p.status === 'confirmed') return errorResponse('Already confirmed', req, 409)
    if (p.status !== 'pending') return errorResponse(`Payment is ${p.status}`, req, 409)
    if (new Date(p.expires_at as string) < new Date()) {
      await db.from('billing_payments').update({ status: 'failed' }).eq('id', paymentId)
      return errorResponse('Payment intent has expired', req, 410)
    }

    const verify = await verifyBillingPayment({
      txSignature,
      expectedAmountUsdc: p.amount_usdc as number,
      expectedMemo: p.memo as string,
    })
    if (!verify.valid) return errorResponse(verify.error ?? 'Verification failed', req, 422)

    const tenantId = crypto.randomUUID().replace(/-/g, '').slice(0, 7)
    // Payer wallet (tx signer) is the org creator; set as sole admin so they can manage their dGuild.
    // Slug is left null until the admin pays for the slug add-on and claims a custom slug in Admin > General.
    await db.from('tenant_config').insert({
      id: tenantId,
      slug: null,
      name: tenantName,
      description: description || null,
      discord_server_invite_link: discordInviteLink || null,
      branding: logo ? { logo } : {},
      admins: [payerWallet],
      modules: { admin: { state: 'active', deactivatedate: null, deactivatingUntil: null, settingsjson: {} } },
    })
    await db
      .from('billing_payments')
      .update({ tenant_id: tenantId, status: 'confirmed', tx_signature: txSignature, confirmed_at: new Date().toISOString() })
      .eq('id', paymentId)

    const { data: t } = await db.from('tenant_config').select('*').eq('id', tenantId).maybeSingle()
    return jsonResponse({ success: true, tenant: t }, req)
  }

  // ---------------------------------------------------------------------------
  // expire-stale – cron action
  // ---------------------------------------------------------------------------
  if (action === 'expire-stale') {
    const { error } = await db
      .from('billing_payments')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
    if (error) return errorResponse(error.message, req, 500)
    return jsonResponse({ ok: true }, req)
  }

  return errorResponse(`Unknown action: ${action}`, req, 400)
})
