<template>
  <PageSection>
    <div class="ops-login">
      <h1 class="ops-login__title">Platform admin</h1>
      <p class="ops-login__subtitle">
        Sign in with the owner wallet to access internal operations.
      </p>

      <div v-if="!auth.wallet.value" class="ops-login__card">
        <p class="ops-login__text">
          Connect your wallet and sign a one-time message to start a session.
        </p>
        <Button variant="primary" @click="showConnectModal = true">
          Connect wallet
        </Button>
        <ConnectWalletModal
          :open="showConnectModal"
          title="Connect wallet"
          description="Choose the owner wallet to sign in to platform admin."
          :connectors="auth.connectorState.value.connectors"
          :loading="auth.loading.value"
          :error="auth.error.value"
          @close="showConnectModal = false"
          @select="handleConnectAndSignIn"
        />
      </div>

      <div v-else class="ops-login__card">
        <p class="ops-login__text">
          Connected as <span class="ops-login__wallet">{{ auth.wallet.value }}</span>.
        </p>
        <p class="ops-login__hint">
          Continue to verify that this wallet is authorised for platform admin.
        </p>
        <Button variant="primary" :disabled="submitting" @click="elevate">
          Continue to platform admin
        </Button>
        <p v-if="error" class="ops-login__error">
          {{ error }}
        </p>
      </div>
    </div>
  </PageSection>
</template>

<script setup lang="ts">
definePageMeta({ title: 'Platform admin login' })

import { useAuth } from '@decentraguild/auth'
import { PageSection, Button, ConnectWalletModal } from '@decentraguild/ui/components'
import type { WalletConnectorId } from '@solana/connector/headless'
import { useApiBase } from '~/composables/useApiBase'

const auth = useAuth()
const apiBase = useApiBase()

const showConnectModal = ref(false)
const submitting = ref(false)
const error = ref<string | null>(null)

onMounted(() => {
  auth.fetchMe()
  auth.refreshConnectorState()
})

async function handleConnectAndSignIn(connectorId: WalletConnectorId) {
  error.value = null
  const ok = await auth.connectAndSignIn(connectorId)
  if (ok) showConnectModal.value = false
}

async function elevate() {
  error.value = null
  submitting.value = true
  try {
    const base = apiBase.value
    const res = await fetch(`${base}/api/v1/platform/auth/elevate`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? 'Failed to start platform admin session')
    }
    await navigateTo('/ops')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to start platform admin session'
    error.value = msg
  } finally {
    submitting.value = false
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
  color: var(--theme-error);
}
</style>

