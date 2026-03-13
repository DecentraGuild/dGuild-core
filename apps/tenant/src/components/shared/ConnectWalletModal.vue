<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription v-if="description">
          {{ description }}
        </DialogDescription>
      </DialogHeader>
      <div class="connect-wallet-modal">
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
                icon="svg-spinners:ring-resize"
                class="connect-wallet-modal__spinner"
              />
            </button>
          </li>
        </ul>
        <p v-if="connectors.length === 0 && !loading" class="connect-wallet-modal__empty">
          No wallets detected. Install a Solana wallet (e.g. Phantom, Backpack) to continue.
        </p>
        <p v-if="error" class="connect-wallet-modal__error text-destructive text-sm">{{ error }}</p>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import Dialog from '~/components/ui/dialog/Dialog.vue'
import DialogContent from '~/components/ui/dialog/DialogContent.vue'
import DialogHeader from '~/components/ui/dialog/DialogHeader.vue'
import DialogTitle from '~/components/ui/dialog/DialogTitle.vue'
import DialogDescription from '~/components/ui/dialog/DialogDescription.vue'

withDefaults(
  defineProps<{
    open: boolean
    title?: string
    description?: string
    connectors: { id: string; name: string; ready: boolean }[]
    loading?: boolean
    error?: string | null
  }>(),
  {
    title: 'Connect wallet',
    description: '',
    loading: false,
    error: null,
  }
)

const emit = defineEmits<{
  close: []
  select: [connectorId: string]
}>()

function onOpenChange(open: boolean) {
  if (!open) emit('close')
}
</script>

<style scoped>
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
  padding: var(--theme-space-md) var(--theme-space-lg);
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
}
</style>
