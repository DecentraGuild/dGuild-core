<template>
  <Modal :model-value="open" :title="title" :wide="!!walletConnectUri" @update:model-value="$emit('close')">
    <div class="connect-wallet-modal">
      <p v-if="description" class="connect-wallet-modal__description">
        {{ description }}
      </p>

      <div v-if="showMobileDeepLinks" class="connect-wallet-modal__mobile-links">
        <p class="connect-wallet-modal__mobile-links-title">Open in wallet app</p>
        <div class="connect-wallet-modal__mobile-links-row">
          <a
            class="connect-wallet-modal__app-link"
            :href="phantomBrowseUrl"
            rel="noopener noreferrer"
            target="_blank"
          >
            Phantom
          </a>
          <a
            class="connect-wallet-modal__app-link"
            :href="solflareBrowseUrl"
            rel="noopener noreferrer"
            target="_blank"
          >
            Solflare
          </a>
        </div>
      </div>

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

      <p v-if="connectors.length === 0 && !loading" class="connect-wallet-modal__empty">
        No wallets detected. Install a Solana wallet (e.g. Phantom, Backpack) to continue.
      </p>
      <p v-if="error" class="connect-wallet-modal__error">{{ error }}</p>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import Modal from './Modal.vue'
import WalletConnectQr from './WalletConnectQr.vue'

const MOBILE_UA_RE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i

withDefaults(
  defineProps<{
    open: boolean
    title?: string
    description?: string
    connectors: { id: string; name: string; ready: boolean }[]
    loading?: boolean
    error?: string | null
    walletConnectUri?: string | null
  }>(),
  {
    title: 'Connect wallet',
    description: '',
    loading: false,
    error: null,
    walletConnectUri: null,
  },
)

defineEmits<{
  close: []
  select: [connectorId: string]
}>()

function isWalletInAppBrowser(): boolean {
  if (typeof window === 'undefined') return false
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/Phantom/i.test(ua)) return true
  if (/Solflare/i.test(ua)) return true
  const w = window as Window & { solana?: { isPhantom?: boolean }; solflare?: unknown }
  if (w.solana?.isPhantom) return true
  if (w.solflare) return true
  return false
}

const showMobileDeepLinks = computed(() => {
  if (typeof navigator === 'undefined') return false
  if (!MOBILE_UA_RE.test(navigator.userAgent)) return false
  return !isWalletInAppBrowser()
})

const pageHref = computed(() => {
  if (typeof window === 'undefined') return ''
  return window.location.href
})

const pageRef = computed(() => {
  if (typeof window === 'undefined') return ''
  return window.location.origin || ''
})

function deepLinkRef(href: string, origin: string): string {
  if (origin) return origin
  try {
    return new URL(href).origin
  } catch {
    return 'https://'
  }
}

const phantomBrowseUrl = computed(() => {
  const href = pageHref.value || 'https://'
  const ref = deepLinkRef(href, pageRef.value)
  return `https://phantom.app/ul/browse/${encodeURIComponent(href)}?ref=${encodeURIComponent(ref)}`
})

const solflareBrowseUrl = computed(() => {
  const href = pageHref.value || 'https://'
  const ref = deepLinkRef(href, pageRef.value)
  return `https://solflare.com/ul/v1/browse/${encodeURIComponent(href)}?ref=${encodeURIComponent(ref)}`
})
</script>

<style scoped>
.connect-wallet-modal__description {
  margin: 0 0 var(--theme-space-md);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.connect-wallet-modal__mobile-links {
  margin-bottom: var(--theme-space-md);
  padding: var(--theme-space-md);
  background: var(--theme-bg-secondary);
  border-radius: var(--theme-radius-md);
  border: var(--theme-border-thin) solid var(--theme-border);
}

.connect-wallet-modal__mobile-links-title {
  margin: 0 0 var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  font-weight: 600;
  color: var(--theme-text-primary);
}

.connect-wallet-modal__mobile-links-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-sm);
}

.connect-wallet-modal__app-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 var(--theme-space-md);
  touch-action: manipulation;
  font-size: var(--theme-font-sm);
  font-weight: 500;
  color: var(--theme-primary);
  text-decoration: none;
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background: var(--theme-bg-card);
}

.connect-wallet-modal__app-link:hover {
  border-color: var(--theme-primary);
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

.connect-wallet-modal__empty {
  margin: var(--theme-space-md) 0 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.connect-wallet-modal__error {
  margin: var(--theme-space-md) 0 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}
</style>
