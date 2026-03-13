/**
 * Slug claim flow: check availability, claim via billing Edge Function, extend.
 */

import type { BillingPeriod } from '@decentraguild/billing'
import { PublicKey } from '@solana/web3.js'
import {
  buildBillingTransfer,
  sendAndConfirmTransaction,
  getEscrowWalletFromConnector,
} from '@decentraguild/web3'
import { useTenantStore } from '~/stores/tenant'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { useSupabase } from '~/composables/core/useSupabase'
import type { Ref } from 'vue'
import { useTransactionNotificationsStore } from '~/stores/transactionNotifications'
import { getEdgeFunctionErrorMessage } from '~/utils/edgeFunctionError'
import type { TenantConfig } from '@decentraguild/core'

export function useSlugClaim(opts: {
  slug: Ref<string | null>
  saveError: Ref<string | null>
  saving: Ref<boolean>
  handleBillingPayment: (
    moduleId: string,
    period: BillingPeriod,
    slugToClaim?: string,
  ) => Promise<boolean>
  fetchSubscription: (moduleId: string) => Promise<void>
}) {
  const {
    slug: _slug,
    saveError,
    saving,
    handleBillingPayment,
    fetchSubscription,
  } = opts
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId)
  const { connection } = useSolanaConnection()
  const txNotifications = useTransactionNotificationsStore()

  const desiredSlug = ref('')
  const slugCheckStatus = ref<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const slugChecking = ref(false)
  const slugClaiming = ref(false)

  async function checkSlugAvailability() {
    const s = desiredSlug.value.trim().toLowerCase()
    if (!s) return
    slugChecking.value = true
    slugCheckStatus.value = 'checking'
    try {
      const supabase = useSupabase()
      const { data } = await supabase
        .from('tenant_config')
        .select('id')
        .eq('slug', s)
        .maybeSingle()
      slugCheckStatus.value = data ? 'taken' : 'available'
    } catch {
      slugCheckStatus.value = 'idle'
    } finally {
      slugChecking.value = false
    }
  }

  function onSlugCheckBlur() {
    if (desiredSlug.value.trim()) checkSlugAvailability()
  }

  async function claimSlug() {
    const s = desiredSlug.value.trim().toLowerCase()
    if (!s || slugCheckStatus.value !== 'available' || !tenantId.value) return
    slugClaiming.value = true
    saveError.value = null
    try {
      await handleBillingPayment('slug', 'yearly', s)
      tenantStore.refetchTenantContext()
      desiredSlug.value = ''
      slugCheckStatus.value = 'idle'
      await fetchSubscription('slug')
    } catch (e) {
      saveError.value = e instanceof Error ? e.message : 'Claim failed'
    } finally {
      slugClaiming.value = false
    }
  }

  async function claimSlugWithPeriod(_period: BillingPeriod) {
    if (slugCheckStatus.value !== 'available') return
    await claimSlug()
  }

  async function extendSlug(period: BillingPeriod) {
    const id = tenantId.value
    if (!id) return
    saving.value = true
    saveError.value = null
    try {
      const supabase = useSupabase()
      const { data: intentData, error: intentError } = await supabase.functions.invoke('billing', {
        body: { action: 'extend-intent', tenantId: id, moduleId: 'slug', billingPeriod: period },
      })
      if (intentError) throw new Error(getEdgeFunctionErrorMessage(intentError, 'Extend request failed'))
      const intent = intentData as {
        noPaymentRequired: boolean
        paymentId?: string
        amountUsdc?: number
        memo?: string
        recipientAta?: string
      }
      if (intent.noPaymentRequired) {
        await fetchSubscription('slug')
        return
      }
      if (!intent.paymentId || !intent.amountUsdc || !intent.memo || !intent.recipientAta) {
        throw new Error('Invalid extension intent response')
      }
      if (!connection.value) throw new Error('Solana RPC not configured')
      const wallet = getEscrowWalletFromConnector()
      if (!wallet?.publicKey) throw new Error('Wallet not connected')

      const notificationId = `slug-extend-${intent.paymentId}`
      txNotifications.add(notificationId, {
        status: 'pending',
        message: 'Extending slug. Confirm the transaction in your wallet.',
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
            body: { action: 'confirm', tenantId: id, paymentId: intent.paymentId, txSignature },
          },
        )
        if (confirmError) throw new Error(getEdgeFunctionErrorMessage(confirmError, 'Confirm failed'))

        const result = confirmData as { tenant?: Record<string, unknown> }
        if (result.tenant) tenantStore.setTenant(result.tenant as unknown as TenantConfig)
        await fetchSubscription('slug')

        txNotifications.update(notificationId, {
          status: 'success',
          message: 'Slug subscription extended.',
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
      saving.value = false
    }
  }

  return {
    desiredSlug,
    slugCheckStatus,
    slugChecking,
    slugClaiming,
    checkSlugAvailability,
    onSlugCheckBlur,
    claimSlug,
    claimSlugWithPeriod,
    extendSlug,
  }
}
