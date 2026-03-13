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
        type="button"
        class="escrow-modal__icon-btn escrow-modal__close"
        aria-label="Close"
        @click="$emit('close')"
      >
        <Icon icon="lucide:x" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'

defineProps<{
  isMaker: boolean
  escrow: unknown
}>()

defineEmits<{
  copyShareLink: []
  close: []
}>()
</script>
