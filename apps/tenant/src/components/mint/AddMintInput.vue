<template>
  <div class="add-mint-input">
    <div class="add-mint-input__row">
      <div class="add-mint-input__input">
        <input
          :value="modelValue"
          type="text"
          class="add-mint-input__field"
          :placeholder="placeholder"
          :disabled="disabled"
          @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
          @keydown.enter.prevent="onSubmit"
        >
      </div>
      <AddressBookBrowser
        :kind="bookKind"
        :hide-base-mints="hideBookBaseMints"
        @select="onAddressBookSelect"
      />
      <select
        v-if="showKindSelector"
        :value="kind"
        class="add-mint-input__select"
        @change="$emit('update:kind', ($event.target as HTMLSelectElement).value as KindValue)"
      >
        <option value="auto">Auto-detect type</option>
        <option value="SPL">SPL token</option>
        <option value="NFT">NFT / collection</option>
      </select>
      <Button
        variant="brand"
        :disabled="!canSubmit || loading || disabled"
        @click="onSubmit"
      >
        <Icon v-if="loading" icon="lucide:loader-2" class="add-mint-input__spinner" />
        {{ loading ? 'Loading…' : buttonLabel }}
      </Button>
    </div>
    <p v-if="error" class="add-mint-input__error text-destructive text-sm">{{ error }}</p>
    <p v-if="finePrint" class="add-mint-input__fine-print">{{ finePrint }}</p>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import AddressBookBrowser from '~/components/shared/AddressBookBrowser.vue'
import type { AddressBookEntry, MintKind } from '~/types/mints'

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
    showKindSelector?: boolean
    bookKind?: MintKind
    hideBookBaseMints?: boolean
  }>(),
  {
    kind: 'auto',
    error: null,
    loading: false,
    disabled: false,
    placeholder: 'Mint or collection address',
    buttonLabel: 'Load',
    finePrint: 'If auto-detection fails, select SPL or NFT explicitly and try again.',
    showKindSelector: true,
    hideBookBaseMints: false,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:kind': [value: KindValue]
  submit: [mint: string, kind: KindValue, entry?: AddressBookEntry]
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
  emit('submit', mint, (entry.kind as KindValue) ?? 'auto', entry)
}
</script>

<style scoped>
.add-mint-input {
  width: 100%;
  min-width: 0;
}

.add-mint-input__row {
  display: flex;
  flex-wrap: nowrap;
  align-items: stretch;
  gap: var(--theme-space-sm);
  width: 100%;
  min-width: 0;
  overflow-x: auto;
}

.add-mint-input__input {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
}

.add-mint-input__row :deep(.ab-browser) {
  flex-shrink: 0;
  align-self: center;
}

.add-mint-input__row :deep(.ab-browser__trigger) {
  height: var(--theme-input-height, 2.25rem);
  min-height: var(--theme-input-height, 2.25rem);
  width: var(--theme-input-height, 2.25rem);
  box-sizing: border-box;
}

.add-mint-input__field {
  width: 100%;
  min-width: 0;
  height: var(--theme-input-height, 2.25rem);
  min-height: var(--theme-input-height, 2.25rem);
  padding: var(--theme-space-sm) var(--theme-space-md);
  font-size: var(--theme-font-base);
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-primary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.add-mint-input__field:focus {
  border-color: var(--theme-primary);
  box-shadow: 0 0 0 2px var(--theme-bg-primary), 0 0 0 4px var(--theme-primary-light);
}

.add-mint-input__field:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.add-mint-input__field::placeholder {
  color: var(--theme-text-muted);
}

.add-mint-input__select {
  flex-shrink: 0;
  align-self: center;
  max-width: 100%;
  height: var(--theme-input-height, 2.25rem);
  min-height: var(--theme-input-height, 2.25rem);
  padding: 0 var(--theme-space-md);
  border-radius: var(--theme-radius-md);
  border: var(--theme-border-thin) solid var(--theme-border);
  box-sizing: border-box;
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-primary);
  line-height: 1.25;
  appearance: none;
}

.add-mint-input__row :deep(button) {
  align-self: center;
  height: var(--theme-input-height, 2.25rem);
  min-height: var(--theme-input-height, 2.25rem);
  max-height: var(--theme-input-height, 2.25rem);
  padding-top: 0;
  padding-bottom: 0;
  box-sizing: border-box;
}

.add-mint-input__select option {
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-primary);
}

.add-mint-input__error {
  margin-top: var(--theme-space-xs);
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
