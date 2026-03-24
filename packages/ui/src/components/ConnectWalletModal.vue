<template>
  <Modal :model-value="open" :title="title" :wide="!!walletConnectUri" @update:model-value="$emit('close')">
    <div class="connect-wallet-modal">
      <p v-if="description" class="connect-wallet-modal__description">
        {{ description }}
      </p>

      <ul class="connect-wallet-modal__list">
        <li
          v-for="connector in connectors"
          :key="connector.id"
          class="connect-wallet-modal__item"
        >
          <button
            type="button"
            class="connect-wallet-modal__connector"
            :disabled="!connector.ready || loading"
            @click="$emit('select', connector.id)"
          >
            <span class="connect-wallet-modal__name">{{ connector.name }}</span>
            <Icon
              v-if="loading"
              icon="mdi:loading"
              class="connect-wallet-modal__spinner"
            />
          </button>
        </li>
      </ul>

      <div v-if="walletConnectUri" class="connect-wallet-modal__wc-inline">
        <p class="connect-wallet-modal__wc-hint">
          Scan with your mobile wallet or copy the link.
        </p>
        <WalletConnectQr :uri="walletConnectUri" />
      </div>

      <p v-if="walletScanPending" class="connect-wallet-modal__scanning">
        Looking for wallets…
      </p>
      <p
        v-else-if="connectors.length === 0 && !loading && !walletConnectUri"
        class="connect-wallet-modal__empty"
      >
        No wallets detected in this browser. Install a Solana wallet extension, open this page in your wallet app, or use WalletConnect if your host provides it.
      </p>
      <p
        v-else-if="connectors.length === 0 && !loading && walletConnectUri"
        class="connect-wallet-modal__empty connect-wallet-modal__empty--muted"
      >
        If your wallet is on another device, scan the QR code above.
      </p>
      <p v-if="error" class="connect-wallet-modal__error">{{ error }}</p>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import Modal from './Modal.vue'
import WalletConnectQr from './WalletConnectQr.vue'

withDefaults(
  defineProps<{
    open: boolean
    title?: string
    description?: string
    connectors: { id: string; name: string; ready: boolean }[]
    loading?: boolean
    error?: string | null
    walletConnectUri?: string | null
    walletScanPending?: boolean
  }>(),
  {
    title: 'Connect wallet',
    description: '',
    loading: false,
    error: null,
    walletConnectUri: null,
    walletScanPending: false,
  },
)

defineEmits<{
  close: []
  select: [connectorId: string]
}>()
</script>

<style scoped>
.connect-wallet-modal__description {
  margin: 0 0 var(--theme-space-md);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.connect-wallet-modal__wc-inline {
  margin-bottom: var(--theme-space-md);
  padding: var(--theme-space-md);
  background: var(--theme-bg-secondary);
  border-radius: var(--theme-radius-md);
  border: var(--theme-border-thin) solid var(--theme-border);
}

.connect-wallet-modal__wc-hint {
  margin: 0 0 var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.connect-wallet-modal__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.connect-wallet-modal__item {
  margin: 0 0 var(--theme-space-xs);
}

.connect-wallet-modal__item:last-child {
  margin-bottom: 0;
}

.connect-wallet-modal__connector {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 48px;
  padding: var(--theme-space-md) var(--theme-space-lg);
  touch-action: manipulation;
  text-align: left;
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  color: var(--theme-text-primary);
  cursor: pointer;
  border-radius: var(--theme-radius-md);
  font-size: var(--theme-font-base);
}

.connect-wallet-modal__connector:hover:not(:disabled) {
  border-color: var(--theme-primary);
  background: var(--theme-bg-card);
}

.connect-wallet-modal__connector:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.connect-wallet-modal__name {
  font-weight: 500;
}

.connect-wallet-modal__spinner {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.connect-wallet-modal__scanning {
  margin: var(--theme-space-md) 0 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.connect-wallet-modal__empty {
  margin: var(--theme-space-md) 0 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.connect-wallet-modal__empty--muted {
  color: var(--theme-text-secondary);
}

.connect-wallet-modal__error {
  margin: var(--theme-space-md) 0 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}
</style>
