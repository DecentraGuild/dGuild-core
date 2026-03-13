<template>
  <div class="gate-select-row" :class="{ 'gate-select-row--compact': compact }">
    <div class="gate-select-row__main">
      <span class="gate-select-row__title">{{ title }}</span>
      <div class="gate-select-row__select">
        <GateSelect
          :slug="slug"
          :model-value="modelValue"
          :show-use-default="showUseDefault"
          :show-admin-only="showAdminOnly"
          :disabled="disabled || loading"
          :source="source"
          @update:model-value="$emit('update:modelValue', $event)"
        />
      </div>
      <Button
        v-if="showSave"
        variant="default"
        size="sm"
        :disabled="disabled || loading || !dirty"
        @click="$emit('save')"
      >
        {{ loading ? 'Saving...' : saveLabel }}
      </Button>
    </div>
    <p v-if="!compact && hint" class="gate-select-row__hint">{{ hint }}</p>
    <p v-if="saveSuccess" class="gate-select-row__success">Saved.</p>
    <p v-else-if="saveError" class="gate-select-row__error">{{ saveError }}</p>
  </div>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button'
import GateSelect from '~/components/gates/GateSelect.vue'
import type { GateSelectValue } from '~/components/gates/GateSelect.vue'

withDefaults(
  defineProps<{
    slug: string | null
    modelValue?: GateSelectValue
    title: string
    hint?: string
    /** Compact: single line (name, dropdown, save), no hint. */
    compact?: boolean
    showUseDefault?: boolean
    showAdminOnly?: boolean
    showSave?: boolean
    saveLabel?: string
    dirty?: boolean
    disabled?: boolean
    loading?: boolean
    saveSuccess?: boolean
    saveError?: string | null
    /** 'db' = fetch from Supabase (admin, no Edge Function). 'edge' = gates function (public). */
    source?: 'edge' | 'db'
  }>(),
  {
    hint: '',
    compact: false,
    showUseDefault: false,
    showAdminOnly: false,
    showSave: false,
    saveLabel: 'Save',
    dirty: false,
    disabled: false,
    loading: false,
    saveSuccess: false,
    saveError: null,
    source: 'db',
  }
)

defineEmits<{
  'update:modelValue': [value: GateSelectValue]
  save: []
}>()
</script>

<style scoped>
.gate-select-row {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
}

.gate-select-row--compact .gate-select-row__main {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  flex-wrap: wrap;
}

.gate-select-row--compact .gate-select-row__title {
  flex-shrink: 0;
  min-width: 8rem;
}

.gate-select-row--compact .gate-select-row__select {
  flex: 1;
  min-width: 12rem;
}

.gate-select-row__select :deep(.gate-select) {
  margin-bottom: 0;
}

.gate-select-row__main {
  display: flex;
  align-items: flex-end;
  gap: var(--theme-space-sm);
  flex-wrap: wrap;
}

.gate-select-row:not(.gate-select-row--compact) .gate-select-row__title {
  flex-shrink: 0;
}

.gate-select-row:not(.gate-select-row--compact) .gate-select-row__select {
  flex: 1;
  min-width: 12rem;
}

.gate-select-row__title {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  color: var(--theme-text-primary);
  margin: 0;
}

.gate-select-row__hint {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  margin: 0;
  line-height: 1.35;
}

.gate-select-row__success,
.gate-select-row__error {
  margin: 0;
  font-size: var(--theme-font-xs);
}

.gate-select-row__success {
  color: var(--theme-status-success, var(--theme-text-muted));
}

.gate-select-row__error {
  color: var(--theme-error);
}
</style>
