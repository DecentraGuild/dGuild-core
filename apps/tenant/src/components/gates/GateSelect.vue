<template>
  <div class="gate-select">
    <label v-if="label" class="gate-select__label" :for="selectId">{{ label }}</label>
    <Select
      :model-value="internalValue"
      :disabled="disabled || loading"
      @update:model-value="onSelectUpdate"
    >
      <SelectTrigger :id="selectId" class="gate-select__trigger w-full">
        <SelectValue :placeholder="loading ? 'Loading…' : 'Select…'" />
      </SelectTrigger>
      <SelectContent class="gate-select__content">
        <SelectItem
          v-if="showAdminOnly"
          value="__admin_only__"
          class="gate-select__item"
        >
          Admin only
        </SelectItem>
        <SelectItem :value="EMPTY_SENTINEL" class="gate-select__item">
          {{ loading ? 'Loading…' : (lists.length ? `Public (no ${gateLabelLower})` : `No lists / Public`) }}
        </SelectItem>
        <SelectItem
          v-if="showUseDefault"
          value="__use_default__"
          class="gate-select__item"
        >
          Use dGuild default {{ gateLabelLower }}
        </SelectItem>
        <SelectItem
          v-for="list in lists"
          :key="list.address"
          :value="list.address"
          class="gate-select__item"
        >
          {{ list.name ? `${list.name} (${truncateAddress(list.address, 8, 4)})` : truncateAddress(list.address, 8, 4) }}
        </SelectItem>
      </SelectContent>
    </Select>
    <p v-if="error" class="gate-select__error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { truncateAddress } from '@decentraguild/display'
import { getGateLabel } from '@decentraguild/catalog'
import type { MarketplaceGateSettings } from '@decentraguild/core'
import { useGateLists } from '~/composables/gates/useGateListsPublic'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'

export type GateSelectValue = MarketplaceGateSettings | null | 'use-default' | 'admin-only'

const EMPTY_SENTINEL = '__empty__'

const GATE_PROGRAM_ID = 'whi5uDPWK4rAE9Sus6hdxdHwsG1hjDBn6kXM6pyqwTn'
const gateLabelLower = computed(() => getGateLabel().toLowerCase())
const selectId = useId()

const props = withDefaults(
  defineProps<{
    slug: string | null
    modelValue?: GateSelectValue
    label?: string
    showUseDefault?: boolean
    showAdminOnly?: boolean
    disabled?: boolean
    source?: 'edge' | 'db'
  }>(),
  { showUseDefault: false, showAdminOnly: false, disabled: false, source: 'edge' }
)

const emit = defineEmits<{
  'update:modelValue': [value: GateSelectValue]
}>()

const { lists, loading, error } = useGateLists({
  slug: toRef(() => props.slug),
  source: toRef(() => props.source ?? 'edge'),
})

const internalValue = computed(() => {
  const v = props.modelValue
  if (v === undefined || v === null) return EMPTY_SENTINEL
  if (v === 'use-default') return '__use_default__'
  if (v === 'admin-only') return '__admin_only__'
  if (typeof v === 'object' && v.account && v.account.trim()) return v.account
  return EMPTY_SENTINEL
})

function onSelectUpdate(value: string | undefined) {
  if (value === undefined || value === EMPTY_SENTINEL) {
    emit('update:modelValue', null)
    return
  }
  if (value === '__use_default__') {
    emit('update:modelValue', 'use-default')
    return
  }
  if (value === '__admin_only__') {
    emit('update:modelValue', 'admin-only')
    return
  }
  emit('update:modelValue', {
    programId: GATE_PROGRAM_ID,
    account: value,
  })
}
</script>

<style scoped>
.gate-select {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.gate-select__label {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.gate-select__trigger {
  min-height: 2.5rem;
  height: auto;
  padding-top: var(--theme-space-sm);
  padding-bottom: var(--theme-space-sm);
  padding-left: var(--theme-space-md);
  padding-right: var(--theme-space-md);
  font-size: var(--theme-font-base);
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-primary);
  border-color: var(--theme-border);
  border-radius: var(--theme-radius-md);
  box-shadow: none;
}

.gate-select__trigger:focus-visible {
  border-color: var(--theme-primary);
  --tw-ring-color: color-mix(in srgb, var(--theme-primary) 35%, transparent);
}

.gate-select__content {
  border-color: var(--theme-border);
  border-radius: var(--theme-radius-md);
  background-color: var(--theme-bg-card);
  color: var(--theme-text-primary);
  box-shadow: var(--theme-shadow-card);
}

.gate-select :deep(.gate-select__item) {
  font-size: var(--theme-font-sm);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-primary);
}

.gate-select :deep(.gate-select__item:focus),
.gate-select :deep(.gate-select__item[data-highlighted]) {
  background-color: var(--theme-bg-secondary) !important;
  color: var(--theme-text-primary) !important;
  outline: none;
}

.gate-select :deep(.gate-select__item[data-state='checked']) {
  color: var(--theme-primary);
}

.gate-select__error {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}
</style>
