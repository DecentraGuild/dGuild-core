<template>
  <div class="whitelist-select">
    <label v-if="label" class="whitelist-select__label">{{ label }}</label>
    <select
      :value="selectValue"
      :disabled="disabled || loading"
      class="whitelist-select__field"
      @change="onChange"
    >
      <option value="">
        {{ loading ? 'Loading...' : (lists.length ? 'Public (no whitelist)' : 'No lists / Public') }}
      </option>
      <option v-if="showUseDefault" value="__use_default__">
        Use dGuild default
      </option>
      <option
        v-for="list in lists"
        :key="list.address"
        :value="list.address"
      >
        {{ list.name }} ({{ list.address.slice(0, 8) }}...)
      </option>
    </select>
    <p v-if="error" class="whitelist-select__error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import type { MarketplaceWhitelistSettings } from '@decentraguild/core'

const WHITELIST_PROGRAM_ID = 'whi5uDPWK4rAE9Sus6hdxdHwsG1hjDBn6kXM6pyqwTn'

/** Emitted value: null | { programId, account } for public/specific list, or 'use-default' sentinel. */
export type WhitelistSelectValue = MarketplaceWhitelistSettings | null | 'use-default'

const props = withDefaults(
  defineProps<{
    slug: string | null
    modelValue?: WhitelistSelectValue
    label?: string
    showUseDefault?: boolean
    disabled?: boolean
  }>(),
  { showUseDefault: false, disabled: false }
)

const emit = defineEmits<{
  'update:modelValue': [value: WhitelistSelectValue]
}>()

const { lists, loading, error } = useWhitelistListsPublic(toRef(() => props.slug))

const selectValue = computed(() => {
  const v = props.modelValue
  if (v === undefined || v === null) return ''
  if (v === 'use-default') return '__use_default__'
  if (typeof v === 'object' && v.account && v.account.trim()) return v.account
  return ''
})

function onChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value
  if (value === '') {
    emit('update:modelValue', null)
    return
  }
  if (value === '__use_default__') {
    emit('update:modelValue', 'use-default')
    return
  }
  emit('update:modelValue', {
    programId: WHITELIST_PROGRAM_ID,
    account: value,
  })
}
</script>

<style scoped>
.whitelist-select {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
}

.whitelist-select__label {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.whitelist-select__field {
  padding: var(--theme-space-sm) var(--theme-space-md);
  font-size: var(--theme-font-base);
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-primary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  outline: none;
  cursor: pointer;
}

.whitelist-select__field:focus {
  border-color: var(--theme-primary);
}

.whitelist-select__field:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.whitelist-select__error {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}
</style>
