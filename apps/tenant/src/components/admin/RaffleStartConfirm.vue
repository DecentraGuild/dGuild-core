<template>
  <div class="raffle-start-modal">
    <p class="raffle-start-modal__warning">
      Starting the raffle will finalise it. You will not be able to cancel from this point. Users can buy tickets once started.
    </p>
    <p v-if="raffleName" class="raffle-start-modal__name">{{ raffleName }}</p>
    <div class="raffle-start-modal__actions">
      <Button variant="secondary" type="button" @click="$emit('cancel')">Cancel</Button>
      <Button variant="default" type="button" @click="$emit('confirm')">Start raffle</Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button'

defineProps<{
  raffleName?: string | null
}>()

defineEmits<{ confirm: []; cancel: [] }>()
</script>

<style scoped>
.raffle-start-modal {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
  min-width: 280px;
  overflow: hidden;
}
.raffle-start-modal__warning {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  line-height: 1.5;
}
.raffle-start-modal__name {
  margin: 0;
  font-weight: 600;
  font-size: var(--theme-font-base);
}
.raffle-start-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--theme-space-sm);
  margin-top: var(--theme-space-xs);
}
</style>
