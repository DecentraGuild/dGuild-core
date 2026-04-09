<template>
  <PageSection>
    <Card>
      <template v-if="!auth.wallet.value">
        <h2 class="onboard-form__title">Create Organisation</h2>
        <p class="onboard-form__prompt">
          Connect your wallet and sign in to create a dGuild.
        </p>
        <Button @click="showConnectModal = true">
          Connect wallet
        </Button>
        <ConnectWalletModal
          :open="showConnectModal"
          title="Connect wallet"
          description="Choose a wallet to sign in and create your dGuild."
          :connectors="auth.connectorState.value.connectors"
          :loading="auth.loading.value"
          :error="auth.error.value"
          :wallet-connect-uri="walletConnectUri"
          :wallet-scan-pending="walletScanPending"
          @close="showConnectModal = false"
          @select="handleConnectAndSignIn"
        />
      </template>
      <form v-else class="onboard-form" @submit.prevent="submit">
        <h2 class="onboard-form__title">Create Organisation</h2>
        <div class="space-y-2">
          <Label for="onboard-name">Name (required)</Label>
          <Input id="onboard-name" v-model="form.name" placeholder="My dGuild" />
        </div>
        <div class="space-y-2">
          <Label for="onboard-desc">Description (required)</Label>
          <Input id="onboard-desc" v-model="form.description" placeholder="Our community hub" />
        </div>
        <div class="space-y-2">
          <Label for="onboard-logo">Logo (optional)</Label>
          <Input id="onboard-logo" v-model="form.logo" placeholder="https://..." />
        </div>
        <div class="space-y-2">
          <Label for="onboard-discord">Discord invite link (optional)</Label>
          <Input id="onboard-discord" v-model="form.discordInviteLink" placeholder="https://discord.gg/..." />
        </div>
        <div v-if="error" class="onboard-form__error">{{ error }}</div>
        <div class="onboard-form__actions">
          <Button type="submit" :disabled="saving">Create and pay</Button>
          <Button type="button" variant="outline" :disabled="saving" @click="submitWithVoucher">
            Claim voucher to create
          </Button>
        </div>
      </form>
    </Card>
  </PageSection>
</template>

<script setup lang="ts">
definePageMeta({ title: 'Create org' })
import { useAuth, useConnectWalletModalExtras } from '@decentraguild/auth'
import { ConnectWalletModal } from '@decentraguild/ui/components'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import type { WalletConnectorId } from '@solana/connector/headless'
import { PublicKey } from '@solana/web3.js'
import {
  createConnection,
  getEscrowWalletFromConnector,
  getConnectorState,
  isBackpackConnector,
  buildBillingTransfer,
  buildVoucherTransfer,
  sendAndConfirmTransaction,
  ensureSigningWalletForSession,
} from '@decentraguild/web3'
import { useSupabase, invokeEdgeFunction, useSubmitInFlightLock } from '@decentraguild/nuxt-composables'
import { generateRandomNumericTenantId } from '@decentraguild/core'
import { useRpc } from '~/composables/useRpc'

/** Individual voucher mint that grants org registration only (see individual_vouchers / individual_voucher_entitlements). */
const ONBOARD_VOUCHER_MINT = '4SabxJwtmC9LBKpuJvt7JiU4iXKoHwhP6DYmNJ6Psiey'

const auth = useAuth()
const supabase = useSupabase()
const { rpcUrl, hasRpc } = useRpc()
const showConnectModal = ref(false)
const { walletConnectUri, walletScanPending } = useConnectWalletModalExtras({
  showModal: showConnectModal,
  refreshConnectorState: () => auth.refreshConnectorState(),
})

onMounted(async () => {
  await auth.fetchMe()
  auth.refreshConnectorState()
  if (auth.wallet.value) {
    try {
      await ensureSigningWalletForSession(auth.wallet.value)
      auth.refreshConnectorState()
    } catch {
      /* Pay flow will call ensure again or surface Connect wallet */
    }
  }
})

const form = reactive({
  name: '',
  description: '',
  logo: '',
  discordInviteLink: '',
})

const saving = ref(false)
const error = ref<string | null>(null)
const onboardSubmitLock = useSubmitInFlightLock()

async function handleConnectAndSignIn(connectorId: string) {
  const ok = await auth.connectAndSignIn(connectorId as WalletConnectorId)
  if (ok) showConnectModal.value = false
}

function onboardingOrgPayload() {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    logo: form.logo.trim() || undefined,
    discordInviteLink: form.discordInviteLink.trim() || undefined,
  }
}

async function completeOnboardAfterPayment(tenantId: string, paymentId: string) {
  const { data: session } = await supabase.auth.getSession()
  const token = session?.session?.access_token
  try {
    await invokeEdgeFunction(
      supabase,
      'billing',
      {
        action: 'register-create',
        paymentId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        logo: form.logo.trim() || null,
        discordInviteLink: form.discordInviteLink.trim() || null,
      },
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    )
  } catch (regErr) {
    const msg = regErr instanceof Error ? regErr.message : String(regErr)
    if (!/already exists|Tenant already exists|409/.test(msg)) throw regErr
  }

  const config = useRuntimeConfig()
  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  const tenantAppUrl = isLocal
    ? `http://localhost:3002/?tenant=${encodeURIComponent(tenantId)}`
    : `https://${(config.public.tenantAppHost as string) || 'dapp.dguild.org'}/?tenant=${encodeURIComponent(tenantId)}`
  await navigateTo(tenantAppUrl, { external: true })
}

async function assertOnboardReady() {
  if (!auth.wallet.value) return false
  if (!form.name?.trim()) {
    error.value = 'Name is required'
    return false
  }
  if (!form.description?.trim()) {
    error.value = 'Description is required'
    return false
  }
  if (!hasRpc.value || !rpcUrl.value) {
    error.value = 'RPC not configured. Set NUXT_PUBLIC_HELIUS_RPC.'
    return false
  }

  try {
    await ensureSigningWalletForSession(auth.wallet.value ?? undefined)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Connect your wallet'
    return false
  }

  const wallet = getEscrowWalletFromConnector()
  if (!wallet?.publicKey) {
    error.value = 'Connect your wallet'
    return false
  }
  return true
}

async function submit() {
  const ready = await assertOnboardReady()
  if (!ready) return

  const wallet = getEscrowWalletFromConnector()
  if (!wallet?.publicKey) return

  const exclusive = await onboardSubmitLock.runExclusive(async () => {
    saving.value = true
    error.value = null
    try {
      const tenantId = generateRandomNumericTenantId()

      const quoteData = await invokeEdgeFunction<{ quoteId?: string; priceUsdc?: number }>(supabase, 'billing', {
        action: 'quote',
        tenantId,
        productKey: 'admin',
        meterOverrides: { registration: 1 },
        durationDays: 0,
      })
      const quote = quoteData
      if (!quote?.quoteId) throw new Error('No quote returned')

      if ((quote.priceUsdc ?? 0) <= 0) throw new Error('Registration pricing not configured')

      const payerWallet = wallet.publicKey.toBase58()
      const chargeData = await invokeEdgeFunction<{ paymentId?: string; amountUsdc?: number; memo?: string; recipientAta?: string }>(
        supabase,
        'billing',
        {
          action: 'charge',
          quoteId: quote.quoteId,
          payerWallet,
          paymentMethod: 'usdc',
          onboardingOrg: onboardingOrgPayload(),
        },
      )
      const charge = chargeData
      if (!charge?.paymentId || !charge?.memo || !charge?.recipientAta) throw new Error('Invalid charge response')

      const connection = createConnection(rpcUrl.value)
      const connectorId = getConnectorState().connectorId
      const tx = buildBillingTransfer({
        payer: wallet.publicKey,
        amountUsdc: charge.amountUsdc ?? 0,
        recipientAta: new PublicKey(charge.recipientAta),
        memo: charge.memo,
        connection,
        instructionOrder: isBackpackConnector(connectorId) ? 'memoFirst' : 'transferFirst',
      })
      const txSignature = await sendAndConfirmTransaction(connection, tx, wallet, wallet.publicKey)

      await invokeEdgeFunction(supabase, 'billing', { action: 'confirm', paymentId: charge.paymentId, txSignature })

      await completeOnboardAfterPayment(tenantId, charge.paymentId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create organisation'
    } finally {
      saving.value = false
    }
  })
  if (!exclusive.ok) return
}

async function submitWithVoucher() {
  const ready = await assertOnboardReady()
  if (!ready) return

  const wallet = getEscrowWalletFromConnector()
  if (!wallet?.publicKey) return

  const exclusive = await onboardSubmitLock.runExclusive(async () => {
    saving.value = true
    error.value = null
    try {
      const tenantId = generateRandomNumericTenantId()

      const quoteData = await invokeEdgeFunction<{
        quoteId?: string
        memo?: string
        voucherRecipientAta?: string
        voucherWallet?: string
        tokensRequired?: number
      }>(supabase, 'billing', {
        action: 'voucher-quote',
        tenantId,
        voucherMint: ONBOARD_VOUCHER_MINT,
      })
      const vq = quoteData
      if (!vq?.quoteId || !vq?.memo || !vq?.voucherRecipientAta) {
        throw new Error('Invalid voucher quote')
      }
      const tokensRequired = vq.tokensRequired ?? 1
      const voucherWallet = vq.voucherWallet ?? '89s4gjt2STRy83XQrxmYrWRkQBH3CL228BRVs6Qbed2Q'

      const payerWallet = wallet.publicKey.toBase58()
      const chargeData = await invokeEdgeFunction<{
        paymentId?: string
        memo?: string
        voucherRecipientAta?: string
      }>(supabase, 'billing', {
        action: 'charge',
        quoteId: vq.quoteId,
        payerWallet,
        paymentMethod: 'voucher',
        voucherMint: ONBOARD_VOUCHER_MINT,
        onboardingOrg: onboardingOrgPayload(),
      })
      const charge = chargeData
      if (!charge?.paymentId || !charge?.memo) throw new Error('Invalid charge response')

      const connection = createConnection(rpcUrl.value)
      const connectorId = getConnectorState().connectorId
      const tx = await buildVoucherTransfer({
        payer: wallet.publicKey,
        mint: ONBOARD_VOUCHER_MINT,
        amount: tokensRequired,
        decimals: 0,
        recipientAta: charge.voucherRecipientAta ?? vq.voucherRecipientAta,
        recipientOwner: voucherWallet,
        memo: charge.memo,
        connection,
        instructionOrder: isBackpackConnector(connectorId) ? 'memoFirst' : 'transferFirst',
      })
      const txSignature = await sendAndConfirmTransaction(connection, tx, wallet, wallet.publicKey)

      await invokeEdgeFunction(supabase, 'billing', { action: 'confirm', paymentId: charge.paymentId, txSignature })

      await completeOnboardAfterPayment(tenantId, charge.paymentId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create organisation'
    } finally {
      saving.value = false
    }
  })
  if (!exclusive.ok) return
}
</script>

<style scoped>
.onboard-form__title {
  margin: 0 0 var(--theme-space-md);
  font-size: var(--theme-font-xl);
  font-weight: 600;
  color: var(--theme-text-primary);
}

.onboard-form__prompt {
  margin-bottom: var(--theme-space-md);
  color: var(--theme-text-secondary);
}

.onboard-form {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.onboard-form__error {
  color: var(--theme-error);
  font-size: var(--theme-font-sm);
}
</style>
