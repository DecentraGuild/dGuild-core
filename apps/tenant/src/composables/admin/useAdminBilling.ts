/**
 * Admin billing: payment flow, deploy, reactivate, extend for modules.
 * Uses the billing Edge Function for intent creation and confirmation.
 * On-chain USDC transfer is built/sent client-side as before.
 */

import type { ModuleState } from '@decentraguild/core'
import type { BillingPeriod, ConditionSet } from '@decentraguild/billing'
import { getModuleCatalogEntry } from '@decentraguild/config'
import { PublicKey } from '@solana/web3.js'
import {
  buildBillingTransfer,
  sendAndConfirmTransaction,
  getEscrowWalletFromConnector,
} from '@decentraguild/web3'
import { useAdminTenant } from '~/composables/admin/useAdminTenant'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { useSupabase } from '~/composables/core/useSupabase'
import type { Ref } from 'vue'
import { useTransactionNotificationsStore } from '~/stores/transactionNotifications'
import { getEdgeFunctionErrorMessage } from '~/utils/edgeFunctionError'
import type { TenantConfig } from '@decentraguild/core'

interface PaymentIntentResponse {
  noPaymentRequired: boolean
  paymentId?: string
  amountUsdc?: number
  memo?: string
  recipientWallet?: string
  recipientAta?: string
  billingPeriod?: string
  periodStart?: string
  periodEnd?: string
  error?: string
}

export function useAdminBilling(opts: {
  saveError: Ref<string | null>
  saving: Ref<boolean>
  deploying: Ref<boolean>
  extending: Ref<boolean>
  fetchSubscription: (moduleId: string) => Promise<void>
}) {
  const { saveError, saving, deploying, extending, fetchSubscription } = opts
  const { tenantId, slug, tenantStore } = useAdminTenant()
  const { connection } = useSolanaConnection()
  const txNotifications = useTransactionNotificationsStore()

  async function handleBillingPayment(
    moduleId: string,
    billingPeriod: BillingPeriod,
    slugToClaim?: string,
    conditions?: ConditionSet,
  ): Promise<boolean> {
    const id = tenantId.value
    if (!id) return false

    const supabase = useSupabase()
    const body: Record<string, unknown> = {
      action: 'intent',
      tenantId: id,
      moduleId,
      billingPeriod,
    }
    if (moduleId === 'slug' && slugToClaim) body.slug = slugToClaim
    if (conditions && typeof conditions === 'object') body.conditions = conditions
    const wallet = getEscrowWalletFromConnector()
    if (wallet?.publicKey) body.payerWallet = wallet.publicKey.toBase58()

    const { data: intentData, error: intentError } = await supabase.functions.invoke('billing', {
      body,
    })
    if (intentError) {
      throw new Error(getEdgeFunctionErrorMessage(intentError, 'Billing request failed'))
    }

    const intent = intentData as PaymentIntentResponse
    if (intent.noPaymentRequired) return true

    if (!intent.paymentId || !intent.amountUsdc || !intent.memo || !intent.recipientAta) {
      throw new Error('Invalid payment intent response')
    }
    if (!connection.value) throw new Error('Solana RPC not configured')
    if (!wallet?.publicKey) throw new Error('Wallet not connected')

    const notificationId = `billing-${moduleId}-${intent.paymentId}`
    txNotifications.add(notificationId, {
      status: 'pending',
      message: 'Processing payment. Confirm the transaction in your wallet.',
      signature: null,
    })

    try {
      const tx = buildBillingTransfer({
        payer: wallet.publicKey,
        amountUsdc: intent.amountUsdc,
        recipientAta: new PublicKey(intent.recipientAta),
        memo: intent.memo,
        connection: connection.value,
      })
      const txSignature = await sendAndConfirmTransaction(
        connection.value,
        tx,
        wallet,
        wallet.publicKey,
      )

      const { data: confirmData, error: confirmError } = await supabase.functions.invoke(
        'billing',
        {
          body: {
            action: 'confirm',
            tenantId: id,
            paymentId: intent.paymentId,
            txSignature,
          },
        },
      )
      if (confirmError) throw new Error(getEdgeFunctionErrorMessage(confirmError, 'Confirm failed'))

      const result = confirmData as { tenant?: Record<string, unknown> }
      if (result.tenant) {
        tenantStore.setTenant(result.tenant as unknown as TenantConfig)
      }

      txNotifications.update(notificationId, {
        status: 'success',
        message: 'Payment confirmed.',
        signature: txSignature,
      })
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Payment failed'
      txNotifications.update(notificationId, {
        status: 'error',
        message: msg,
        signature: null,
      })
      throw e
    }
  }

  async function deployModule(moduleId: string, billingPeriod: BillingPeriod, conditions?: ConditionSet) {
    if (!tenantId.value) return
    if (deploying.value) return
    deploying.value = true
    saveError.value = null
    try {
      const catalogEntry = getModuleCatalogEntry(moduleId)
      const isAddUnitOnly =
        catalogEntry?.pricing &&
        (catalogEntry.pricing as { modelType?: string }).modelType === 'add_unit'
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

      const supabase = useSupabase()
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
      const catalogEntry = getModuleCatalogEntry(moduleId)
      const isAddUnitOnly =
        catalogEntry?.pricing &&
        (catalogEntry.pricing as { modelType?: string }).modelType === 'add_unit'
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

      const supabase = useSupabase()
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
      const supabase = useSupabase()
      const { data: intentData, error: intentError } = await supabase.functions.invoke('billing', {
        body: {
          action: 'extend-intent',
          tenantId: tenantId.value,
          moduleId,
          billingPeriod,
        },
      })
      if (intentError) throw new Error(getEdgeFunctionErrorMessage(intentError, 'Extend request failed'))
      const intent = intentData as PaymentIntentResponse
      if (intent.noPaymentRequired) {
        await fetchSubscription(moduleId)
        return
      }
      if (!intent.paymentId || !intent.amountUsdc || !intent.memo || !intent.recipientAta) {
        throw new Error('Invalid extension intent response')
      }
      if (!connection.value) throw new Error('Solana RPC not configured')
      const wallet = getEscrowWalletFromConnector()
      if (!wallet?.publicKey) throw new Error('Wallet not connected')

      const notificationId = `billing-extend-${moduleId}-${intent.paymentId}`
      txNotifications.add(notificationId, {
        status: 'pending',
        message: 'Extending subscription. Confirm the transaction in your wallet.',
        signature: null,
      })

      try {
        const tx = buildBillingTransfer({
          payer: wallet.publicKey,
          amountUsdc: intent.amountUsdc,
          recipientAta: new PublicKey(intent.recipientAta),
          memo: intent.memo,
          connection: connection.value,
        })
        const txSignature = await sendAndConfirmTransaction(
          connection.value,
          tx,
          wallet,
          wallet.publicKey,
        )

        const { data: confirmData, error: confirmError } = await supabase.functions.invoke(
          'billing',
          {
            body: {
              action: 'confirm',
              tenantId: tenantId.value,
              paymentId: intent.paymentId,
              txSignature,
            },
          },
        )
        if (confirmError) throw new Error(getEdgeFunctionErrorMessage(confirmError, 'Confirm failed'))

        const result = confirmData as { tenant?: Record<string, unknown> }
        if (result.tenant) {
          tenantStore.setTenant(result.tenant as unknown as TenantConfig)
        }
        await fetchSubscription(moduleId)

        txNotifications.update(notificationId, {
          status: 'success',
          message: 'Subscription extended.',
          signature: txSignature,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Extension failed'
        txNotifications.update(notificationId, { status: 'error', message: msg, signature: null })
        throw e
      }
    } catch (e) {
      saveError.value = e instanceof Error ? e.message : 'Extend failed'
    } finally {
      extending.value = false
    }
  }

  return { handleBillingPayment, deployModule, reactivateModule, extendModule, slug }
}
