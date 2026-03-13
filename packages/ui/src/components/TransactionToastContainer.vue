<template>
  <div class="transaction-toast-container">
    <TransactionToast
      v-for="item in store.items"
      :key="item.id"
      :status="item.status"
      :message="item.message"
      :signature="item.signature"
      :explorer-url="item.signature ? getTxUrl(item.signature) : undefined"
      :dismissible="item.status !== 'pending'"
      @dismiss="store.remove(item.id)"
    />
  </div>
</template>

<script setup lang="ts">
import TransactionToast from './TransactionToast.vue'

export interface TransactionNotification {
  id: string
  status: 'pending' | 'success' | 'error'
  message: string
  signature?: string | null
  createdAt: number
}

defineProps<{
  store: { items: TransactionNotification[]; remove: (id: string) => void }
  getTxUrl: (signature: string) => string
}>()
</script>

<style scoped>
.transaction-toast-container {
  position: fixed;
  bottom: var(--theme-space-lg);
  right: var(--theme-space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
  z-index: 9999;
  max-width: 24rem;
}
</style>
