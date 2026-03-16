/**
 * Admin billing: quote → charge → confirm (pricing engine v2).
 */
import type { ModuleState } from '@decentraguild/core'
import type { BillingPeriod, ConditionSet } from '@decentraguild/billing'
import { getProductDisplayType, MODULE_TO_PRODUCT, toMeterOverrides } from '@decentraguild/billing'
import {
  buildBillingTransfer,
  sendAndConfirmTransaction,
  getEscrowWalletFromConnector,
} from '@decentraguild/web3'
import { PublicKey } from '@solana/web3.js'
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

export function useAdminBilling(opts: {
  saveError: Ref<string | null>
  saving: Ref<boolean>
  deploying: Ref<boolean>
  extending: Ref<boolean>
  fetchSubscription: (moduleId: string) => Promise<void>
}) {
  const { saveError, saving, deploying, extending } = opts
  const { tenantId, slug, tenantStore } = useAdminTenant()
  const supabase = useSupabase()
  const { connection } = useSolanaConnection()
  const txNotifications = useTransactionNotificationsStore()

  async function handleBillingPayment(
    moduleId: string,
    billingPeriod: BillingPeriod,
    slugToClaim?: string,
    conditions?: ConditionSet,
  ): Promise<boolean> {
    let notificationId: string | undefined
    try {
      const id = tenantId.value
      if (!id) throw new Error('Tenant not set')

      const productKey = MODULE_TO_PRODUCT[moduleId] ?? moduleId
    const durationDays = billingPeriod === 'yearly' ? 365 : 30
    let meterOverrides = toMeterOverrides(conditions)
    if (moduleId === 'slug' && slugToClaim) {
      meterOverrides = { slug: 1 }
    }

    const { data: quoteData, error: quoteErr } = await supabase.functions.invoke('billing', {
      body: {
        action: 'quote',
        tenantId: id,
        productKey,
        durationDays,
        meterOverrides,
      },
    })
    if (quoteErr) throw new Error(quoteErr.message ?? 'Quote failed')
    const quote = quoteData as { quoteId: string; priceUsdc: number }
    if (!quote?.quoteId) throw new Error('No quote returned')

    if (quote.priceUsdc <= 0) return true

    const wallet = getEscrowWalletFromConnector()
    if (!wallet?.publicKey) throw new Error('Wallet not connected')
    const payerWallet = wallet.publicKey.toBase58()

    const { data: chargeData, error: chargeErr } = await supabase.functions.invoke('billing', {
      body: {
        action: 'charge',
        quoteId: quote.quoteId,
        payerWallet,
        paymentMethod: 'usdc',
      },
    })
    if (chargeErr) throw new Error(chargeErr.message ?? 'Charge failed')
    const charge = chargeData as { paymentId: string; amountUsdc: number; memo: string; recipientAta: string }
    if (!charge?.paymentId || !charge?.memo || !charge?.recipientAta) throw new Error('Invalid charge response')

    if (!connection.value) throw new Error('Solana RPC not configured')
    notificationId = `billing-${Date.now()}`
    const nid = notificationId
    txNotifications.add(nid, {
      status: 'pending',
      message: 'Payment. Confirm the transaction in your wallet.',
      signature: null,
    })

    const tx = buildBillingTransfer({
      payer: wallet.publicKey,
      amountUsdc: charge.amountUsdc,
      recipientAta: new PublicKey(charge.recipientAta),
      memo: charge.memo,
      connection: connection.value,
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

    const confirmBody: Record<string, unknown> = {
      action: 'confirm',
      paymentId: charge.paymentId,
      txSignature,
    }
    if (slugToClaim) confirmBody.slugToClaim = slugToClaim

    const { error: confirmErr } = await supabase.functions.invoke('billing', {
      body: confirmBody,
    })
      if (confirmErr) {
        txNotifications.update(notificationId, {
          status: 'error',
          message: confirmErr.message ?? 'Confirm failed',
          signature: null,
        })
        throw new Error(confirmErr.message ?? 'Confirm failed')
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

  return { handleBillingPayment, deployModule, reactivateModule, extendModule, slug }
}
