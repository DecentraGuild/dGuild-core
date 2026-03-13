<template>
  <PageSection>
    <Card>
      <template v-if="!auth.wallet.value">
        <h2 class="onboard-form__title">Create Organisation</h2>
        <p class="onboard-form__prompt">
          Connect your wallet and sign in to create a dGuild.
        </p>
        <Button variant="primary" @click="showConnectModal = true">
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
        <TextInput v-model="form.name" label="Name (required)" placeholder="My dGuild" />
        <TextInput v-model="form.description" label="Description (required)" placeholder="Our community hub" />
        <TextInput v-model="form.logo" label="Logo (optional)" placeholder="https://..." />
        <TextInput
          v-model="form.discordInviteLink"
          label="Discord invite link (optional)"
          placeholder="https://discord.gg/..."
        />
        <div v-if="error" class="onboard-form__error">{{ error }}</div>
        <Button type="submit" variant="primary" :disabled="saving">Create and pay</Button>
      </form>
    </Card>
  </PageSection>
</template>

<script setup lang="ts">
definePageMeta({ title: 'Create org' })
import { Connection, PublicKey } from '@solana/web3.js'
import { useAuth } from '@decentraguild/auth'
import {
  buildBillingTransfer,
  sendAndConfirmTransaction,
  getEscrowWalletFromConnector,
  getConnectorState,
  isBackpackConnector,
} from '@decentraguild/web3'
import { PageSection, Card, TextInput, Button, ConnectWalletModal } from '@decentraguild/ui/components'
import type { WalletConnectorId } from '@solana/connector/headless'
import { useTransactionNotificationsStore } from '~/stores/transactionNotifications'

const auth = useAuth()
const { rpcUrl, hasRpc } = useRpc()
const showConnectModal = ref(false)
const txNotifications = useTransactionNotificationsStore()

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

const config = useRuntimeConfig()
const saving = ref(false)
const error = ref<string | null>(null)

/** Path to fallback logo (served from platform app public). */
const DEFAULT_LOGO_PATH = '/dguild-logoGreyscale.webp'

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

  saving.value = true
  error.value = null
  let notificationId: string | null = null
  try {
    const wallet = getEscrowWalletFromConnector()
    if (!wallet?.publicKey) {
      showConnectModal.value = true
      throw new Error('Wallet disconnected. Reconnect to sign the transaction.')
    }

    const { useSupabase } = await import('~/composables/useSupabase')
    const supabase = useSupabase()
    const { data: intentData, error: intentError } = await supabase.functions.invoke('billing', {
      body: {
        action: 'register-intent',
        payerWallet: wallet.publicKey.toBase58(),
      },
    })
    if (intentError) {
      const msg = intentError.message ?? 'Failed to create payment intent'
      const hint = msg.includes('non-2xx')
        ? ' Ensure Supabase is running (pnpm supabase start) and edge functions are served (pnpm supabase functions serve).'
        : ''
      throw new Error(msg + hint)
    }
    const intent = intentData as {
      paymentId: string
      amountUsdc: number
      memo: string
      recipientAta: string
    }
    if (!intent.paymentId || !intent.amountUsdc || !intent.memo || !intent.recipientAta) {
      throw new Error('Invalid payment intent response')
    }

    const connection = new Connection(rpcUrl.value)
    notificationId = `create-org-${intent.paymentId}`
    txNotifications.add(notificationId, {
      status: 'pending',
      message: 'Creating organisation. Confirm the transaction in your wallet.',
      signature: null,
    })
    const connectorId = getConnectorState().connectorId
    const tx = buildBillingTransfer({
      payer: wallet.publicKey,
      amountUsdc: intent.amountUsdc,
      recipientAta: new PublicKey(intent.recipientAta),
      memo: intent.memo,
      connection,
      instructionOrder: isBackpackConnector(connectorId) ? 'memoFirst' : 'transferFirst',
    })
    const txSignature = await sendAndConfirmTransaction(
      connection,
      tx,
      wallet,
      wallet.publicKey,
    )

    if (notificationId) {
      txNotifications.update(notificationId, {
        status: 'success',
        message: 'Organisation created. Redirecting to your dGuild.',
        signature: txSignature,
      })
    }

    const { data: confirmData, error: confirmError } = await supabase.functions.invoke('billing', {
      body: {
        action: 'register-confirm',
        paymentId: intent.paymentId,
        txSignature,
        tenantName: form.name.trim(),
        payerWallet: wallet.publicKey.toBase58(),
        description: form.description.trim() || null,
        logo:
          form.logo?.trim() ||
          (typeof window !== 'undefined' ? window.location.origin : 'https://dguild.org') + DEFAULT_LOGO_PATH,
        discordInviteLink: form.discordInviteLink.trim() || null,
      },
    })
    if (confirmError) throw new Error(confirmError.message ?? 'Failed to confirm registration')
    const result = confirmData as { tenant?: { id: string; slug?: string | null } }
    const tenant = result.tenant
    const tenantId = (tenant?.id ?? '').trim()
    if (!tenantId?.trim()) throw new Error('No tenant id returned')
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    if (isLocal) {
      window.location.href = `http://localhost:3002/admin?tenant=${encodeURIComponent(tenantId)}&new=1`
    } else {
      const tenantAppHost = config.public.tenantAppHost as string
      window.location.href = `https://${tenantAppHost}/admin?tenant=${encodeURIComponent(tenantId)}&new=1`
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create org'
    error.value = msg
    if (notificationId) {
      txNotifications.update(notificationId, {
        status: 'error',
        message: msg,
        signature: null,
      })
    }
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
