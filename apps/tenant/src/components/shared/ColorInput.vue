<template>
  <div class="color-input">
    <Label v-if="label" :for="hexInputId" class="color-input__label">{{ label }}</Label>
    <div class="color-input__row">
      <input
        :id="swatchId"
        ref="swatchRef"
        type="color"
        :value="pickerValue"
        class="color-input__swatch"
        @input="onPickerInput"
      >
      <Input
        :id="hexInputId"
        :model-value="hexDisplay"
        :placeholder="placeholder"
        class="color-input__hex font-mono"
        @update:model-value="onHexInputValue"
      />
    </div>
    <p v-if="error" class="color-input__error text-destructive text-xs">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import Input from '~/components/ui/input/Input.vue'
import Label from '~/components/ui/label/Label.vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    label?: string
    placeholder?: string
  }>(),
  { placeholder: '#000000' }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const swatchRef = ref<HTMLInputElement | null>(null)

const hexInputId = computed(() => `color-hex-${Math.random().toString(36).slice(2)}`)
const swatchId = computed(() => `color-swatch-${Math.random().toString(36).slice(2)}`)

function normalizeHex(raw: string): string {
  const s = String(raw).trim().replace(/^#/, '')
  if (s.length === 0) return ''
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[0] + s[0]
    const g = s[1] + s[1]
    const b = s[2] + s[2]
    return `#${r}${g}${b}`
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`
  return ''
}

const error = computed(() => {
  const v = props.modelValue ?? ''
  if (v.length === 0) return ''
  const norm = normalizeHex(v)
  return norm ? '' : 'Invalid hex (use #RGB or #RRGGBB)'
})

const hexDisplay = computed(() => {
  const v = props.modelValue ?? ''
  if (v.length === 0) return v
  const norm = normalizeHex(v)
  return norm || v
})

const pickerValue = computed(() => {
  const norm = normalizeHex(props.modelValue ?? '')
  return norm || '#000000'
})

function emitValue(value: string) {
  const norm = normalizeHex(value)
  emit('update:modelValue', norm || value)
}

function onPickerInput(e: Event) {
  const v = (e.target as HTMLInputElement).value
  emitValue(v)
}

function onHexInputValue(value: string) {
  const norm = normalizeHex(value)
  if (norm) {
    emit('update:modelValue', norm)
    swatchRef.value?.setAttribute?.('value', norm)
  } else {
    emit('update:modelValue', value)
  }
}
</script>

<style scoped>
.color-input {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
}

.color-input__label {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.color-input__row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
}

.color-input__swatch {
  width: 2.5rem;
  height: 2rem;
  padding: 0;
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  background: transparent;
  cursor: pointer;
}

.color-input__swatch::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.color-input__swatch::-webkit-color-swatch {
  border: none;
  border-radius: 2px;
}

.color-input__hex {
  flex: 1;
  min-width: 0;
}
</style>
