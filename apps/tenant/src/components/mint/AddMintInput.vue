<template>
  <div class="add-mint-input">
    <div class="add-mint-input__shell">
      <div class="add-mint-input__mint-wrap">
        <input
          :value="modelValue"
          type="text"
          class="add-mint-input__mint"
          :placeholder="placeholder"
          :disabled="disabled"
          autocomplete="off"
          spellcheck="false"
          @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
          @keydown.enter.prevent="onSubmit"
        >
      </div>
      <AddressBookBrowser class="add-mint-input__book" @select="onAddressBookSelect" />
      <select
        v-if="showKindSelector"
        :value="kind"
        class="add-mint-input__select"
        :disabled="disabled"
        @change="$emit('update:kind', ($event.target as HTMLSelectElement).value as KindValue)"
      >
        <option value="auto">Auto-detect type</option>
        <option value="SPL">SPL token</option>
        <option value="NFT">NFT / collection</option>
      </select>
      <Button
        variant="secondary"
        class="add-mint-input__action"
        :disabled="!canSubmit || loading || disabled"
        @click="onSubmit"
      >
        <Icon v-if="loading" icon="lucide:loader-2" class="add-mint-input__spinner" />
        {{ loading ? 'Loading…' : buttonLabel }}
      </Button>
    </div>
    <p v-if="error" class="add-mint-input__error">{{ error }}</p>
    <p v-if="finePrint" class="add-mint-input__fine-print">{{ finePrint }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import AddressBookBrowser from '~/components/shared/AddressBookBrowser.vue'
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
    showKindSelector?: boolean
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
  },
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
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
}

.add-mint-input__shell {
  --add-mint-h: var(--theme-input-height, 2.25rem);
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-height: var(--add-mint-h);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background: var(--theme-bg-primary);
  overflow: hidden;
}

.add-mint-input__mint-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.add-mint-input__mint {
  width: 100%;
  min-width: 0;
  height: var(--add-mint-h);
  min-height: var(--add-mint-h);
  box-sizing: border-box;
  padding: 0 var(--theme-space-md);
  border: none;
  outline: none;
  margin: 0;
  font-size: var(--theme-font-base);
  font-family: inherit;
  color: var(--theme-text-primary);
  background: transparent;
}

.add-mint-input__mint::placeholder {
  color: var(--theme-text-muted);
}

.add-mint-input__mint:focus-visible {
  outline: none;
}

.add-mint-input__shell:focus-within {
  border-color: var(--theme-primary);
  box-shadow: 0 0 0 1px var(--theme-primary);
}

.add-mint-input__shell :deep(.ab-browser) {
  display: flex;
  align-self: stretch;
}

.add-mint-input__shell :deep(.ab-browser__trigger) {
  width: var(--add-mint-h);
  min-width: var(--add-mint-h);
  height: 100%;
  min-height: var(--add-mint-h);
  border: none;
  border-radius: 0;
  border-left: var(--theme-border-thin) solid var(--theme-border);
  box-sizing: border-box;
}

.add-mint-input__select {
  flex-shrink: 0;
  width: auto;
  max-width: 11rem;
  min-height: var(--add-mint-h);
  height: auto;
  align-self: stretch;
  padding: 0 var(--theme-space-sm) 0 var(--theme-space-md);
  margin: 0;
  border: none;
  border-left: var(--theme-border-thin) solid var(--theme-border);
  border-radius: 0;
  box-sizing: border-box;
  font-size: var(--theme-font-sm);
  font-family: inherit;
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-secondary);
  cursor: pointer;
}

.add-mint-input__select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.add-mint-input__select option {
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-primary);
}

.add-mint-input__action {
  flex-shrink: 0;
  align-self: stretch;
  min-height: var(--add-mint-h) !important;
  height: 100% !important;
  margin: 0;
  border-radius: 0 !important;
  border: none !important;
  border-left: var(--theme-border-thin) solid var(--theme-border) !important;
  box-shadow: none !important;
  padding-left: var(--theme-space-md);
  padding-right: var(--theme-space-md);
}

.add-mint-input__error {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}

.add-mint-input__fine-print {
  margin: 0;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.add-mint-input__spinner {
  animation: add-mint-input-spin 0.8s linear infinite;
}

@keyframes add-mint-input-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
