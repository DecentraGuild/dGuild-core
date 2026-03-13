<template>
  <div class="token-amount-input">
    <Label v-if="label" :for="id" class="token-amount-input__label">{{ label }}</Label>
    <div class="token-amount-input__wrap">
      <Input
        :id="id"
        :model-value="modelValue"
        :type="type"
        :placeholder="placeholder"
        :disabled="disabled"
        class="token-amount-input__field border-0 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        @update:model-value="$emit('update:modelValue', $event)"
      />
      <div v-if="showQuickAmounts && !disabled" class="token-amount-input__quick">
        <button type="button" class="token-amount-input__quick-btn" @click="$emit('setPercent', 0.25)">25%</button>
        <button type="button" class="token-amount-input__quick-btn" @click="$emit('setPercent', 0.5)">50%</button>
        <button type="button" class="token-amount-input__quick-btn" @click="$emit('setPercent', 0.75)">75%</button>
        <button type="button" class="token-amount-input__quick-btn" @click="$emit('setPercent', 1)">Max</button>
      </div>
    </div>
    <p v-if="hint" class="token-amount-input__hint text-muted-foreground text-sm">{{ hint }}</p>
    <p v-if="error" class="token-amount-input__error text-destructive text-sm">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Input from '~/components/ui/input/Input.vue'
import Label from '~/components/ui/label/Label.vue'

withDefaults(
  defineProps<{
    modelValue?: string
    label?: string
    type?: string
    placeholder?: string
    disabled?: boolean
    error?: string
    hint?: string
    showQuickAmounts?: boolean
  }>(),
  { type: 'text', disabled: false, showQuickAmounts: false }
)

defineEmits<{
  'update:modelValue': [value: string]
  setPercent: [pct: number]
}>()

const id = computed(() => `token-amount-${Math.random().toString(36).slice(2)}`)
</script>

<style scoped>
.token-amount-input {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
}

.token-amount-input__label {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.token-amount-input__wrap {
  display: flex;
  align-items: stretch;
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background-color: var(--theme-bg-primary);
  transition: border-color 0.15s;
}

.token-amount-input__wrap:focus-within {
  border-color: var(--theme-primary);
}

.token-amount-input__field {
  flex: 1;
  min-width: 0;
}

.token-amount-input__quick {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  border-left: var(--theme-border-thin) solid var(--theme-border);
}

.token-amount-input__quick-btn {
  padding: var(--theme-space-xs) var(--theme-space-sm);
  font-size: var(--theme-font-xs);
  font-weight: 500;
  color: var(--theme-text-secondary);
  background: none;
  border: none;
  border-left: var(--theme-border-thin) solid var(--theme-border);
  cursor: pointer;
}

.token-amount-input__quick-btn:first-child {
  border-left: none;
}

.token-amount-input__quick-btn:hover {
  color: var(--theme-primary);
  background: var(--theme-bg-secondary);
}
</style>
