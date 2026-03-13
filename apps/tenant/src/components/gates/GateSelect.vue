<template>
  <div class="gate-select">
    <label v-if="label" class="gate-select__label">{{ label }}</label>
    <select
      :value="selectValue"
      :disabled="disabled || loading"
      class="gate-select__field"
      @change="onChange"
    >
      <option v-if="showAdminOnly" value="__admin_only__">
        Admin only
      </option>
      <option value="">
        {{ loading ? 'Loading...' : (lists.length ? `Public (no ${gateLabelLower})` : `No lists / Public`) }}
      </option>
      <option v-if="showUseDefault" value="__use_default__">
        Use dGuild default {{ gateLabelLower }}
      </option>
      <option
        v-for="list in lists"
        :key="list.address"
        :value="list.address"
      >
        {{ list.name ? `${list.name} (${truncateAddress(list.address, 8, 4)})` : truncateAddress(list.address, 8, 4) }}
      </option>
    </select>
    <p v-if="error" class="gate-select__error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { truncateAddress } from '@decentraguild/display'
import { getGateLabel } from '@decentraguild/config'
import type { MarketplaceGateSettings } from '@decentraguild/core'
import { useGateLists } from '~/composables/gates/useGateListsPublic'

const GATE_PROGRAM_ID = 'whi5uDPWK4rAE9Sus6hdxdHwsG1hjDBn6kXM6pyqwTn'
const gateLabelLower = computed(() => getGateLabel().toLowerCase())

/** Emitted value: null | { programId, account } for public/specific list, or 'use-default' | 'admin-only' sentinel. */
export type GateSelectValue = MarketplaceGateSettings | null | 'use-default' | 'admin-only'

const props = withDefaults(
  defineProps<{
    slug: string | null
    modelValue?: GateSelectValue
    label?: string
    showUseDefault?: boolean
    showAdminOnly?: boolean
    disabled?: boolean
    /** Use DB fetch (admin) instead of gates Edge Function (public). Admin uses tenant auth only. */
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

const selectValue = computed(() => {
  const v = props.modelValue
  if (v === undefined || v === null) return ''
  if (v === 'use-default') return '__use_default__'
  if (v === 'admin-only') return '__admin_only__'
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

.gate-select__field {
  padding: var(--theme-space-sm) var(--theme-space-md);
  font-size: var(--theme-font-base);
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-primary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  outline: none;
  cursor: pointer;
}

.gate-select__field:focus {
  border-color: var(--theme-primary);
}

.gate-select__field:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.gate-select__error {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}
</style>
