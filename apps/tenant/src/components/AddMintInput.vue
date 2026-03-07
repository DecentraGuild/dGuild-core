<template>
  <div class="add-mint-input">
    <div class="add-mint-input__row">
      <TextInput
        :model-value="modelValue"
        :placeholder="placeholder"
        :error="error"
        class="add-mint-input__input"
        @update:model-value="$emit('update:modelValue', $event)"
        @keydown.enter.prevent="onSubmit"
      />
      <AddressBookBrowser @select="onAddressBookSelect" />
      <select
        :value="kind"
        class="add-mint-input__select"
        @change="$emit('update:kind', ($event.target as HTMLSelectElement).value as KindValue)"
      >
        <option value="auto">Auto-detect type</option>
        <option value="SPL">SPL token</option>
        <option value="NFT">NFT / collection</option>
      </select>
      <Button
        variant="secondary"
        :disabled="!canSubmit || loading || disabled"
        @click="onSubmit"
      >
        <Icon v-if="loading" icon="mdi:loading" class="add-mint-input__spinner" />
        {{ loading ? 'Loading…' : buttonLabel }}
      </Button>
    </div>
    <p v-if="finePrint" class="add-mint-input__fine-print">{{ finePrint }}</p>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { TextInput, Button } from '@decentraguild/ui/components'
import AddressBookBrowser from '~/components/AddressBookBrowser.vue'
import type { AddressBookEntry } from '~/types/mints'

export type KindValue = 'auto' | 'SPL' | 'NFT'

const props = withDefaults(
  defineProps<{
    modelValue: string
    kind?: KindValue
    error?: string | null
    loading?: boolean
    disabled?: boolean
    placeholder?: string
    buttonLabel?: string
    finePrint?: string
  }>(),
  {
    kind: 'auto',
    error: null,
    loading: false,
    disabled: false,
    placeholder: 'Mint or collection address',
    buttonLabel: 'Load',
    finePrint: 'If auto-detection fails, select SPL or NFT explicitly and try again.',
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:kind': [value: KindValue]
  submit: [mint: string, kind: KindValue]
}>()

const canSubmit = computed(() => {
  const trimmed = props.modelValue.trim()
  return trimmed.length >= 32
})

function onSubmit() {
  const mint = props.modelValue.trim()
  if (!mint || mint.length < 32) return
  emit('submit', mint, props.kind)
}

function onAddressBookSelect(mint: string, entry: AddressBookEntry) {
  emit('update:modelValue', mint)
  if (entry.kind) emit('update:kind', entry.kind)
  emit('submit', mint, (entry.kind as KindValue) ?? 'auto')
}
</script>

<style scoped>
.add-mint-input__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-sm);
  align-items: flex-start;
}

.add-mint-input__input {
  flex: 1;
  min-width: 180px;
}

.add-mint-input__select {
  height: var(--theme-input-height);
  padding: 0 var(--theme-space-md);
  border-radius: var(--theme-radius-md);
  border: var(--theme-border-thin) solid var(--theme-border);
  box-sizing: border-box;
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-primary);
}

.add-mint-input__select option {
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-primary);
}

.add-mint-input__fine-print {
  margin-top: var(--theme-space-xs);
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.add-mint-input__spinner {
  animation: add-mint-input-spin 0.8s linear infinite;
}

@keyframes add-mint-input-spin {
  to { transform: rotate(360deg); }
}
</style>
