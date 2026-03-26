/**
 * Slug claim flow: check availability, claim via billing (quote → charge → confirm).
 */
import type { BillingPeriod } from '@decentraguild/billing'
import {
  buildBillingTransfer,
  sendAndConfirmTransaction,
  ensureSigningWalletForSession,
  getEscrowWalletFromConnector,
} from '@decentraguild/web3'
import { useAuth } from '@decentraguild/auth'
import { PublicKey } from '@solana/web3.js'
import { useTenantStore } from '~/stores/tenant'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useSupabase } from '~/composables/core/useSupabase'
import type { Ref } from 'vue'
import { useTransactionNotificationsStore } from '~/stores/transactionNotifications'
import type { TenantConfig } from '@decentraguild/core'
import { validateSlug, sanitizeSlug } from '~/lib/validateSocialLinks'

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
    saveError,
    saving,
    handleBillingPayment,
    fetchSubscription,
  } = opts
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId)
  const { connection } = useSolanaConnection()
  const supabase = useSupabase()
  const txNotifications = useTransactionNotificationsStore()
  const auth = useAuth()

  const desiredSlug = ref('')
  const slugCheckStatus = ref<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const slugChecking = ref(false)
  const slugClaiming = ref(false)
  const slugError = ref<string | null>(null)

  function setDesiredSlug(value: string) {
    const sanitized = sanitizeSlug(value)
    desiredSlug.value = sanitized
    slugError.value = null
    slugCheckStatus.value = 'idle'
  }

  async function checkSlugAvailability() {
    const s = desiredSlug.value.trim().toLowerCase()
    if (!s) return
    const validation = validateSlug(s)
    if (!validation.valid) {
      slugError.value = validation.error ?? null
      return
    }
    slugError.value = null
    slugChecking.value = true
    slugCheckStatus.value = 'checking'
    try {
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
    if (!s || !tenantId.value) return
    const validation = validateSlug(s)
    if (!validation.valid) {
      slugError.value = validation.error ?? null
      return
    }
    if (slugCheckStatus.value !== 'available') return
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

  async function extendSlug(_period: BillingPeriod) {
    const id = tenantId.value
    if (!id) return
    saving.value = true
    saveError.value = null
    try {
      const quoteData = await invokeEdgeFunction<{ quoteId: string; priceUsdc: number }>(supabase, 'billing', {
        action: 'quote',
        tenantId: id,
        productKey: 'admin',
        meterOverrides: { slug: 1 },
        durationDays: 365,
      }, { errorFallback: 'Quote failed' })
      const quote = quoteData
      if (!quote?.quoteId) throw new Error('No quote returned')

      if (quote.priceUsdc <= 0) {
        await fetchSubscription('slug')
        return
      }

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

      const notificationId = `slug-extend-${charge.paymentId}`
      txNotifications.add(notificationId, {
        status: 'pending',
        message: 'Extending slug. Confirm the transaction in your wallet.',
        signature: null,
      })

      try {
        if (!connection.value) throw new Error('Solana RPC not configured')
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
        )

        const confirmData = await invokeEdgeFunction<{ tenant?: Record<string, unknown> }>(
          supabase,
          'billing',
          { action: 'confirm', paymentId: charge.paymentId, txSignature },
          { errorFallback: 'Confirm failed' },
        )

        const result = confirmData
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
    slugError,
    setDesiredSlug,
    checkSlugAvailability,
    onSlugCheckBlur,
    claimSlug,
    claimSlugWithPeriod,
    extendSlug,
  }
}
