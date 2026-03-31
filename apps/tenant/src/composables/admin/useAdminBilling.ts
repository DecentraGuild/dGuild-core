/**
 * Admin billing: quote → charge → confirm (pricing engine v2).
 */
import type { ModuleState } from '@decentraguild/core'
import type { BillingPeriod, ConditionSet } from '@decentraguild/billing'
import { getProductDisplayType, MODULE_TO_PRODUCT, toMeterOverrides } from '@decentraguild/billing'
import {
  buildBillingTransfer,
  buildBillingTransferInstructions,
  sendAndConfirmTransaction,
  ensureSigningWalletForSession,
  getEscrowWalletFromConnector,
  getConnectorState,
  isBackpackConnector,
} from '@decentraguild/web3'
import { PublicKey, type TransactionInstruction } from '@solana/web3.js'
import { invokeEdgeFunction, useSubmitInFlightLock } from '@decentraguild/nuxt-composables'
import { useAuth } from '@decentraguild/auth'
import { useAdminTenant } from '~/composables/admin/useAdminTenant'
import { useSupabase } from '~/composables/core/useSupabase'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { useTransactionNotificationsStore } from '~/stores/transactionNotifications'
import type { Ref } from 'vue'
import type { TenantConfig } from '@decentraguild/core'

const TX_STATUS_LABELS: Record<string, string> = {
  signing: 'Signing...',
  sending: 'Sending...',
  confirming: 'Confirming...',
}

/** USDC billing ixs to prepend to a program tx, or no payment when price is zero. */
export type BillingSameTxPrepare =
  | { kind: 'free' }
  | { kind: 'usdc'; paymentId: string; instructions: TransactionInstruction[] }

export function useAdminBilling(opts: {
  saveError: Ref<string | null>
  saving: Ref<boolean>
  deploying: Ref<boolean>
  extending: Ref<boolean>
  fetchSubscription: (moduleId: string) => Promise<void>
}) {
  const { saveError, saving, deploying, extending } = opts
  const { tenantId, slug, tenantStore } = useAdminTenant()
  const auth = useAuth()
  const supabase = useSupabase()
  const { connection } = useSolanaConnection()
  const txNotifications = useTransactionNotificationsStore()
  const billingSubmitLock = useSubmitInFlightLock()

  async function quoteAndChargeUsdc(
    moduleId: string,
    billingPeriod: BillingPeriod,
    slugToClaim?: string,
    conditions?: ConditionSet,
  ): Promise<
    | { kind: 'free' }
    | {
        kind: 'charged'
        paymentId: string
        amountUsdc: number
        memo: string
        recipientAta: string
      }
  > {
    const id = tenantId.value
    if (!id) throw new Error('Tenant not set')

    const productKey = MODULE_TO_PRODUCT[moduleId] ?? moduleId
    const durationDays = billingPeriod === 'yearly' ? 365 : 30
    let meterOverrides = toMeterOverrides(conditions)
    if (moduleId === 'slug' && slugToClaim) {
      meterOverrides = { slug: 1 }
    }

    const quoteData = await invokeEdgeFunction<{ quoteId: string; priceUsdc: number }>(
      supabase,
      'billing',
      {
        action: 'quote',
        tenantId: id,
        productKey,
        durationDays,
        meterOverrides,
      },
      { errorFallback: 'Quote failed' },
    )
    const quote = quoteData
    if (!quote?.quoteId) throw new Error('No quote returned')

    if (quote.priceUsdc <= 0) return { kind: 'free' }

    await ensureSigningWalletForSession(auth.wallet.value)
    const wallet = getEscrowWalletFromConnector()
    if (!wallet?.publicKey) throw new Error('Wallet not connected')
    const payerWallet = wallet.publicKey.toBase58()

    const chargeData = await invokeEdgeFunction<{ paymentId: string; amountUsdc: number; memo: string; recipientAta: string }>(
      supabase,
      'billing',
      {
        action: 'charge',
        quoteId: quote.quoteId,
        payerWallet,
        paymentMethod: 'usdc',
      },
      { errorFallback: 'Charge failed' },
    )
    const charge = chargeData
    if (!charge?.paymentId || !charge?.memo || !charge?.recipientAta) throw new Error('Invalid charge response')

    return {
      kind: 'charged',
      paymentId: charge.paymentId,
      amountUsdc: charge.amountUsdc,
      memo: charge.memo,
      recipientAta: charge.recipientAta,
    }
  }

  async function prepareBillingInstructionsForSameTx(
    moduleId: string,
    billingPeriod: BillingPeriod,
    slugToClaim?: string,
    conditions?: ConditionSet,
  ): Promise<BillingSameTxPrepare> {
    const r = await quoteAndChargeUsdc(moduleId, billingPeriod, slugToClaim, conditions)
    if (r.kind === 'free') return { kind: 'free' }

    const wallet = getEscrowWalletFromConnector()
    if (!wallet?.publicKey) throw new Error('Wallet not connected')
    const connectorId = getConnectorState().connectorId
    const instructions = buildBillingTransferInstructions({
      payer: wallet.publicKey,
      amountUsdc: r.amountUsdc,
      recipientAta: new PublicKey(r.recipientAta),
      memo: r.memo,
      instructionOrder: isBackpackConnector(connectorId) ? 'memoFirst' : 'transferFirst',
    })
    return { kind: 'usdc', paymentId: r.paymentId, instructions }
  }

  async function confirmBillingFromTxSignature(
    paymentId: string,
    txSignature: string,
    slugToClaim?: string,
  ): Promise<void> {
    const confirmBody: Record<string, unknown> = {
      action: 'confirm',
      paymentId,
      txSignature,
    }
    if (slugToClaim) confirmBody.slugToClaim = slugToClaim

    await invokeEdgeFunction(supabase, 'billing', confirmBody, { errorFallback: 'Confirm failed' })
  }

  async function handleBillingPayment(
    moduleId: string,
    billingPeriod: BillingPeriod,
    slugToClaim?: string,
    conditions?: ConditionSet,
  ): Promise<boolean> {
    const exclusive = await billingSubmitLock.runExclusive(async () => {
      let notificationId: string | undefined
      try {
        if (!connection.value) throw new Error('Solana RPC not configured')

        const r = await quoteAndChargeUsdc(moduleId, billingPeriod, slugToClaim, conditions)
        if (r.kind === 'free') return true

        const wallet = getEscrowWalletFromConnector()
        if (!wallet?.publicKey) throw new Error('Wallet not connected')

        notificationId = `billing-${Date.now()}`
        const nid = notificationId
        txNotifications.add(nid, {
          status: 'pending',
          message: 'Payment. Confirm the transaction in your wallet.',
          signature: null,
        })

        const connectorId = getConnectorState().connectorId
        const tx = buildBillingTransfer({
          payer: wallet.publicKey,
          amountUsdc: r.amountUsdc,
          recipientAta: new PublicKey(r.recipientAta),
          memo: r.memo,
          connection: connection.value,
          instructionOrder: isBackpackConnector(connectorId) ? 'memoFirst' : 'transferFirst',
        })
        const txSignature = await sendAndConfirmTransaction(
          connection.value,
          tx,
          wallet,
          wallet.publicKey,
          {
            onStatus: (s) => {
              const label = TX_STATUS_LABELS[s] ?? s
              txNotifications.update(nid, {
                status: 'pending',
                message: `Payment: ${label}`,
              })
            },
          },
        )

        txNotifications.update(nid, {
          status: 'success',
          message: 'Payment confirmed.',
          signature: txSignature,
        })

        try {
          await confirmBillingFromTxSignature(r.paymentId, txSignature, slugToClaim)
        } catch (confirmErr) {
          txNotifications.update(notificationId, {
            status: 'error',
            message: confirmErr instanceof Error ? confirmErr.message : 'Confirm failed',
            signature: null,
          })
          throw confirmErr
        }

        return true
      } catch (e) {
        if (notificationId) {
          txNotifications.update(notificationId, {
            status: 'error',
            message: e instanceof Error ? e.message : 'Payment failed',
            signature: null,
          })
        }
        throw e
      }
    })
    if (!exclusive.ok) {
      throw new Error('Please wait for the current payment or transaction to finish')
    }
    return exclusive.value
  }

  async function deployModule(moduleId: string, billingPeriod: BillingPeriod, conditions?: ConditionSet) {
    if (!tenantId.value) return
    if (deploying.value) return
    deploying.value = true
    saveError.value = null
    try {
      const productKey = MODULE_TO_PRODUCT[moduleId] ?? moduleId
      const isAddUnitOnly = getProductDisplayType(productKey) === 'one_time_per_unit'
      if (!isAddUnitOnly) {
        const paid = await handleBillingPayment(moduleId, billingPeriod, undefined, conditions)
        if (!paid) throw new Error('Payment was not completed')
      }

      const freshTenant = tenantStore.tenant
      const moduleEntry = freshTenant?.modules?.[moduleId] as { state?: string } | undefined
      if (moduleEntry?.state === 'active') return

      const prevMods = freshTenant?.modules ?? {}
      const modules = { ...prevMods }
      const prev = (modules[moduleId] ?? {}) as {
        state?: ModuleState
        deactivatedate?: string | null
        deactivatingUntil?: string | null
        settingsjson?: Record<string, unknown>
      }
      modules[moduleId] = {
        state: 'active',
        deactivatedate: prev.deactivatedate ?? null,
        deactivatingUntil: prev.deactivatingUntil ?? null,
        settingsjson: prev.settingsjson ?? {},
      }

      const { data, error } = await supabase
        .from('tenant_config')
        .update({ modules, updated_at: new Date().toISOString() })
        .eq('id', tenantId.value)
        .select()
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) throw new Error('Update failed. Ensure you are an admin for this organisation.')
      tenantStore.setTenant(data as unknown as TenantConfig)
    } catch (e) {
      saveError.value = e instanceof Error ? e.message : 'Deploy failed'
    } finally {
      deploying.value = false
    }
  }

  async function reactivateModule(moduleId: string, billingPeriod: BillingPeriod) {
    if (!tenantId.value) return
    saving.value = true
    saveError.value = null
    try {
      const productKey = MODULE_TO_PRODUCT[moduleId] ?? moduleId
      const isAddUnitOnly = getProductDisplayType(productKey) === 'one_time_per_unit'
      if (!isAddUnitOnly) {
        const paid = await handleBillingPayment(moduleId, billingPeriod)
        if (!paid) throw new Error('Payment was not completed')
      }

      const freshTenant = tenantStore.tenant
      const moduleEntry = freshTenant?.modules?.[moduleId] as { state?: string } | undefined
      if (moduleEntry?.state === 'active') return

      const prevMods = freshTenant?.modules ?? {}
      const modules = { ...prevMods }
      const prev = (modules[moduleId] ?? {}) as {
        deactivatedate?: string | null
        deactivatingUntil?: string | null
        settingsjson?: Record<string, unknown>
      }
      modules[moduleId] = {
        state: 'active',
        deactivatedate: null,
        deactivatingUntil: null,
        settingsjson: prev.settingsjson ?? {},
      }

      const { data, error } = await supabase
        .from('tenant_config')
        .update({ modules, updated_at: new Date().toISOString() })
        .eq('id', tenantId.value)
        .select()
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) throw new Error('Update failed. Ensure you are an admin for this organisation.')
      tenantStore.setTenant(data as unknown as TenantConfig)
    } catch (e) {
      saveError.value = e instanceof Error ? e.message : 'Reactivate failed'
    } finally {
      saving.value = false
    }
  }

  async function extendModule(moduleId: string, billingPeriod: BillingPeriod) {
    if (!tenantId.value) return
    extending.value = true
    saveError.value = null
    try {
      await handleBillingPayment(moduleId, billingPeriod)
      await opts.fetchSubscription(moduleId)
    } catch (e) {
      saveError.value = e instanceof Error ? e.message : 'Extend failed'
    } finally {
      extending.value = false
    }
  }

  return {
    handleBillingPayment,
    prepareBillingInstructionsForSameTx,
    confirmBillingFromTxSignature,
    deployModule,
    reactivateModule,
    extendModule,
    slug,
  }
}
