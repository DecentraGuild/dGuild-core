<template>
  <PageSection>
    <div class="ops-login">
      <h1 class="ops-login__title">Platform admin</h1>
      <p class="ops-login__subtitle">
        Sign in with the owner wallet to access internal operations.
      </p>

      <Card v-if="!auth.wallet.value" class="ops-login__card">
        <p class="ops-login__text">
          Connect your wallet and sign a one-time message to start a session.
        </p>
        <Button @click="showConnectModal = true">
          Connect wallet
        </Button>
        <ConnectWalletModal
          :open="showConnectModal"
          title="Connect wallet"
          description="Choose the owner wallet to sign in to platform admin."
          :connectors="auth.connectorState.value.connectors"
          :loading="auth.loading.value"
          :error="auth.error.value"
          :wallet-connect-uri="walletConnectUri"
          :wallet-scan-pending="walletScanPending"
          @close="showConnectModal = false"
          @select="handleConnectAndSignIn"
        />
      </Card>

      <Card v-else class="ops-login__card">
        <p class="ops-login__text">
          Connected as <span class="ops-login__wallet">{{ auth.wallet.value }}</span>.
        </p>
        <p class="ops-login__hint">
          Continue to platform operations. Access is restricted to the wallet in platform_owner.
        </p>
        <p v-if="opsAccessError" class="ops-login__error" role="alert">
          {{ opsAccessError }}
        </p>
        <Button :disabled="opsChecking" @click="goToOps">
          {{ opsChecking ? 'Checking access…' : 'Continue to platform admin' }}
        </Button>
      </Card>
    </div>
  </PageSection>
</template>

<script setup lang="ts">
definePageMeta({ title: 'Platform admin login' })

import { useAuth, useConnectWalletModalExtras } from '@decentraguild/auth'
import { ConnectWalletModal } from '@decentraguild/ui/components'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { useSupabase } from '~/composables/useSupabase'
import type { WalletConnectorId } from '@solana/connector/headless'

const auth = useAuth()

const showConnectModal = ref(false)
const { walletConnectUri, walletScanPending } = useConnectWalletModalExtras({
  showModal: showConnectModal,
  refreshConnectorState: () => auth.refreshConnectorState(),
})
const opsAccessError = ref<string | null>(null)
const opsChecking = ref(false)

onMounted(() => {
  auth.fetchMe()
  auth.refreshConnectorState()
})

async function handleConnectAndSignIn(connectorId: string) {
  opsAccessError.value = null
  const ok = await auth.connectAndSignIn(connectorId as WalletConnectorId)
  if (ok) {
    showConnectModal.value = false
    await goToOps()
  }
}

async function goToOps() {
  opsAccessError.value = null
  opsChecking.value = true
  try {
    const supabase = useSupabase()
    const { data: wallet, error } = await supabase.rpc('check_platform_admin')
    if (error) {
      opsAccessError.value =
        error.message || 'Could not verify platform access. Check Supabase logs.'
      return
    }
    if (!wallet) {
      opsAccessError.value =
        'Not recognized as platform admin. (1) Insert your wallet into public.platform_owner in Supabase. (2) In Dashboard → Authentication → Hooks, enable Custom Access Token Hook → Postgres function public.custom_access_token_hook so your JWT includes wallet_address.'
      return
    }
    await navigateTo('/ops')
  } finally {
    opsChecking.value = false
  }
}
</script>

<style scoped>
.ops-login {
  max-width: 520px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.ops-login__title {
  margin: 0;
  font-size: var(--theme-font-xl);
  font-weight: 600;
  color: var(--theme-text-primary);
}

.ops-login__subtitle {
  margin: 0 0 var(--theme-space-md);
  color: var(--theme-text-secondary);
}

.ops-login__card {
  padding: var(--theme-space-lg);
  border-radius: var(--theme-radius-lg);
  background: var(--theme-bg-card);
  border: 1px solid var(--theme-border);
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.ops-login__text {
  margin: 0;
  color: var(--theme-text-secondary);
}

.ops-login__wallet {
  font-family: monospace;
  font-size: var(--theme-font-xs);
}

.ops-login__hint {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.ops-login__error {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-destructive, #b91c1c);
}
</style>
