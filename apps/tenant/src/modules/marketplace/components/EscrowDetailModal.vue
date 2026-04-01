<template>
  <Dialog :open="modelValue" @update:open="(v: boolean) => emit('update:modelValue', v)">
    <DialogContent :class="['escrow-modal gap-0 max-h-[90vh] overflow-y-auto sm:max-w-[42rem]']" :show-close-button="false">
      <EscrowDetailPanel
        variant="modal"
        :escrow-id="escrowId"
        :fill-disabled="fillDisabled"
        :active="modelValue"
        @close="emit('update:modelValue', false)"
      />
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { Dialog, DialogContent } from '~/components/ui/dialog'
import EscrowDetailPanel from './EscrowDetailPanel.vue'

withDefaults(
  defineProps<{
    modelValue: boolean
    escrowId: string | null
    fillDisabled?: boolean
  }>(),
  { fillDisabled: false }
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<style scoped>
.escrow-modal {
  background: var(--theme-bg-primary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  box-shadow: var(--theme-shadow-card);
  --escrow-modal-width: 42rem;
  max-width: min(90vw, var(--escrow-modal-width));
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  padding: var(--theme-space-xl);
}
</style>
