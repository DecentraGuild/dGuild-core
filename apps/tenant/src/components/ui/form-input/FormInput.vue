<template>
  <div class="form-input">
    <Label v-if="label" :for="id" class="form-input__label">{{ label }}</Label>
    <input
      :id="id"
      :value="modelValue"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      class="form-input__field"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @blur="$emit('blur')"
      @keydown="$emit('keydown', $event)"
    >
    <p v-if="error" class="form-input__error text-destructive text-sm">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Label from '~/components/ui/label/Label.vue'

withDefaults(
  defineProps<{
    modelValue?: string
    label?: string
    type?: string
    placeholder?: string
    disabled?: boolean
    error?: string
    required?: boolean
  }>(),
  { type: 'text', disabled: false }
)

defineEmits<{
  'update:modelValue': [value: string]
  blur: []
  keydown: [event: KeyboardEvent]
}>()

const id = computed(() => `form-input-${Math.random().toString(36).slice(2)}`)
</script>

<style scoped>
.form-input {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
}

.form-input__label {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.form-input__field {
  width: 100%;
  height: var(--theme-input-height, 2.25rem);
  min-width: 0;
  padding: var(--theme-space-sm) var(--theme-space-md);
  font-size: var(--theme-font-base);
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-primary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.form-input__field:focus {
  border-color: var(--theme-primary);
  box-shadow: 0 0 0 2px var(--theme-bg-primary), 0 0 0 4px var(--theme-primary-light);
}

.form-input__field:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-input__field::placeholder {
  color: var(--theme-text-muted);
}
</style>
