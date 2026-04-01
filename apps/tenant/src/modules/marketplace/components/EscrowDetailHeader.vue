<template>
  <header class="escrow-modal__header">
    <h2 class="escrow-modal__title">{{ isMaker ? 'Your trade' : 'Trade details' }}</h2>
    <div class="escrow-modal__header-actions">
      <button
        v-if="escrow && !isMaker"
        type="button"
        class="escrow-modal__icon-btn"
        aria-label="Copy link"
        @click="$emit('copyShareLink')"
      >
        <Icon icon="lucide:share-2" />
      </button>
      <button
        v-if="variant === 'modal'"
        type="button"
        class="escrow-modal__icon-btn escrow-modal__close"
        aria-label="Close"
        @click="$emit('close')"
      >
        <Icon icon="lucide:x" />
      </button>
      <button
        v-else
        type="button"
        class="escrow-modal__back"
        @click="goBackToMarket"
      >
        <Icon icon="lucide:arrow-left" class="escrow-modal__back-icon" />
        Back to market
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'

withDefaults(
  defineProps<{
    isMaker: boolean
    escrow: unknown
    variant?: 'modal' | 'page'
  }>(),
  { variant: 'modal' }
)

defineEmits<{
  copyShareLink: []
  close: []
}>()

const route = useRoute()
const router = useRouter()

function goBackToMarket() {
  const q = { ...route.query }
  delete q.escrow
  void router.push({ path: '/market', query: q })
}
</script>

<style scoped>
.escrow-modal__back {
  display: inline-flex;
  align-items: center;
  gap: var(--theme-space-xs);
  padding: var(--theme-space-xs) var(--theme-space-sm);
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-primary);
  font-size: var(--theme-font-sm);
  font-weight: 500;
  cursor: pointer;
}

.escrow-modal__back:hover {
  border-color: var(--theme-primary);
}

.escrow-modal__back-icon {
  font-size: 1.125rem;
  flex-shrink: 0;
}
</style>
