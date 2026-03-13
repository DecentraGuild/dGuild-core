<template>
  <div class="verify-page">
    <Card class="verify-page__card">
      <h1 class="verify-page__title">Link wallet to Discord</h1>

      <template v-if="!token">
        <p class="verify-page__error">Invalid link. Use /verify in your Discord server to get a new link.</p>
      </template>

      <template v-else-if="sessionError">
        <p class="verify-page__error">{{ sessionError }}</p>
      </template>

      <template v-else-if="success">
        <p class="verify-page__success">Wallet linked. You can close this page and return to Discord.</p>
      </template>

      <template v-else>
        <p class="verify-page__intro">
          Connect your wallet to link it to your Discord account for role verification.
        </p>
        <Button
          variant="default"
          :disabled="loading"
          @click="connectedWallet ? doLink(connectedWallet) : (showConnectModal = true)"
        >
          <Icon v-if="loading" icon="lucide:loader-2" class="verify-page__spinner" />
          {{ connectedWallet ? 'Link this wallet' : 'Connect wallet' }}
        </Button>
        <p v-if="linkError" class="verify-page__error">{{ linkError }}</p>

        <ConnectWalletModal
          :open="showConnectModal"
          title="Connect wallet"
          description="Choose a wallet to link to your Discord account."
          :connectors="connectorState.connectors"
          :loading="loading"
          :error="linkError"
          @close="showConnectModal = false"
          @select="handleConnect"
        />
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Icon } from '@iconify/vue'
import {
  getConnectorState,
  connectWallet,
  subscribeToConnectorState,
} from '@decentraguild/web3/wallet'
import type { WalletConnectorId } from '@solana/connector/headless'
import { useAuth } from '@decentraguild/auth'
import { useSupabase } from '~/composables/core/useSupabase'

const route = useRoute()
const auth = useAuth()

const token = computed(() => (route.query.token as string) ?? '')

const showConnectModal = ref(false)
const loading = ref(false)
const sessionError = ref<string | null>(null)
const linkError = ref<string | null>(null)
const success = ref(false)

const connectorState = ref(getConnectorState())
const connectedWallet = computed(() => connectorState.value.account)

let unsubscribe: (() => void) | null = null
onMounted(() => {
  unsubscribe = subscribeToConnectorState(() => {
    connectorState.value = getConnectorState()
  })
  if (token.value) {
    checkSession()
  }
})
onUnmounted(() => {
  unsubscribe?.()
})

async function checkSession() {
  if (!token.value) return
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('discord-verify', {
      body: { action: 'session-status', token: token.value },
    })
    if (error) {
      sessionError.value = 'This link is invalid or has expired.'
      return
    }
    const result = data as { valid?: boolean; reason?: string }
    if (!result.valid) {
      sessionError.value =
        result.reason === 'expired'
          ? 'This link has expired. Use /verify in Discord to get a new one.'
          : 'This link is invalid or has expired.'
    }
  } catch {
    sessionError.value = 'Could not verify link. Check your connection.'
  }
}

async function doLink(_wallet: string) {
  if (!token.value) return
  linkError.value = null
  loading.value = true
  try {
    const state = getConnectorState()
    const connectorId = state.connectorId as WalletConnectorId | null
    if (!connectorId) {
      linkError.value = 'Wallet not connected'
      return
    }

    // Sign into Supabase with this wallet — this proves ownership without a separate nonce flow.
    if (!auth.wallet.value) {
      const ok = await auth.connectAndSignIn(connectorId)
      if (!ok) {
        linkError.value = auth.error.value ?? 'Sign-in failed'
        return
      }
    }

    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('discord-verify', {
      body: { action: 'link', token: token.value },
    })
    if (error) {
      linkError.value = error.message ?? 'Link failed'
      return
    }
    const result = data as { ok?: boolean; error?: string }
    if (result.error) {
      linkError.value = result.error
      return
    }
    success.value = true
    showConnectModal.value = false
  } catch (e) {
    linkError.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    loading.value = false
  }
}

async function handleConnect(connectorId: WalletConnectorId) {
  if (!token.value) return
  linkError.value = null
  loading.value = true
  try {
    await connectWallet(connectorId)
    connectorState.value = getConnectorState()
    if (!connectorState.value.account) {
      linkError.value = 'Wallet not connected'
      return
    }
    await doLink(connectorState.value.account)
  } catch (e) {
    linkError.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.verify-page {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 40vh;
  padding: var(--theme-space-lg);
}

.verify-page__card {
  max-width: 28rem;
  width: 100%;
}

.verify-page__title {
  font-size: var(--theme-font-lg);
  margin-bottom: var(--theme-space-md);
}

.verify-page__intro {
  margin-bottom: var(--theme-space-md);
  color: var(--theme-text-secondary);
}

.verify-page__success {
  color: var(--theme-success, #0a0);
}

.verify-page__error {
  color: var(--theme-error, #c00);
  margin-top: var(--theme-space-sm);
}

.verify-page__spinner {
  margin-right: var(--theme-space-xs);
  vertical-align: middle;
}
</style>
