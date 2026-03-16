<template>
  <SimpleModal
    :model-value="modelValue"
    :title="title"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="confirm-transaction-modal">
      <div v-if="$slots.default" class="confirm-transaction-modal__body">
        <slot />
      </div>
      <p v-if="fee" class="confirm-transaction-modal__fee">
        Estimated fee: {{ fee }}
      </p>
      <div class="confirm-transaction-modal__actions">
        <Button variant="secondary" :disabled="loading" @click="$emit('update:modelValue', false)">
          Cancel
        </Button>
        <Button
          variant="default"
          :disabled="loading"
          @click="$emit('confirm')"
        >
          <Icon v-if="loading" icon="lucide:loader-2" class="confirm-transaction-modal__spinner" />
          {{ confirmLabel }}
        </Button>
      </div>
    </div>
  </SimpleModal>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import SimpleModal from '~/components/ui/simple-modal/SimpleModal.vue'

withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    fee?: string
    confirmLabel?: string
    loading?: boolean
  }>(),
  { confirmLabel: 'Confirm', loading: false }
)

defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
}>()
</script>

<style scoped>
.confirm-transaction-modal {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}
.confirm-transaction-modal__body {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  line-height: 1.5;
}
.confirm-transaction-modal__body :deep(p) {
  margin: 0;
}
.confirm-transaction-modal__fee {
  margin: 0;
  font-size: var(--theme-font-sm);
  font-weight: 500;
  color: var(--theme-text-primary);
}
.confirm-transaction-modal__actions {
  display: flex;
  gap: var(--theme-space-sm);
  justify-content: flex-end;
  margin-top: var(--theme-space-xs);
}
.confirm-transaction-modal__spinner {
  animation: confirm-tx-spin 1s linear infinite;
}
@keyframes confirm-tx-spin {
  to { transform: rotate(360deg); }
}
</style>
