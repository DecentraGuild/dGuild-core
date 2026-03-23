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
        <Button type="submit" :disabled="saving">Create and pay</Button>
      </form>
    </Card>
  </PageSection>
</template>

<script setup lang="ts">
definePageMeta({ title: 'Create org' })
import { useAuth } from '@decentraguild/auth'
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
  sendAndConfirmTransaction,
} from '@decentraguild/web3'
import { useSupabase, invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useRpc } from '~/composables/useRpc'

const auth = useAuth()
const supabase = useSupabase()
const { rpcUrl, hasRpc } = useRpc()
const showConnectModal = ref(false)

onMounted(() => {
  auth.fetchMe()
  auth.refreshConnectorState()
})

const form = reactive({
  name: '',
  description: '',
  logo: '',
  discordInviteLink: '',
})

const saving = ref(false)
const error = ref<string | null>(null)

async function handleConnectAndSignIn(connectorId: WalletConnectorId) {
  const ok = await auth.connectAndSignIn(connectorId)
  if (ok) showConnectModal.value = false
}

async function submit() {
  if (!auth.wallet.value) return
  if (!form.name?.trim()) {
    error.value = 'Name is required'
    return
  }
  if (!form.description?.trim()) {
    error.value = 'Description is required'
    return
  }
  if (!hasRpc.value || !rpcUrl.value) {
    error.value = 'RPC not configured. Set NUXT_PUBLIC_HELIUS_RPC.'
    return
  }

  const wallet = getEscrowWalletFromConnector()
  if (!wallet?.publicKey) {
    error.value = 'Connect your wallet'
    return
  }

  saving.value = true
  error.value = null
  try {
    const tenantId = crypto.randomUUID().replace(/-/g, '').slice(0, 7)

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

    const { data: session } = await supabase.auth.getSession()
    const token = session?.session?.access_token
    await invokeEdgeFunction(
      supabase,
      'billing',
      {
        action: 'register-create',
        paymentId: charge.paymentId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        logo: form.logo.trim() || null,
        discordInviteLink: form.discordInviteLink.trim() || null,
      },
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    )

    const config = useRuntimeConfig()
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    const tenantAppUrl = isLocal
      ? `http://localhost:3002/?tenant=${encodeURIComponent(tenantId)}`
      : `https://${(config.public.tenantAppHost as string) || 'dapp.dguild.org'}/?tenant=${encodeURIComponent(tenantId)}`
    await navigateTo(tenantAppUrl, { external: true })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to create organisation'
  } finally {
    saving.value = false
  }
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
