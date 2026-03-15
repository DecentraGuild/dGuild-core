<template>
  <div class="gate-select-row-module" :class="{ 'gate-select-row-module--stacked': layout === 'stacked' }">
    <div class="gate-select-row-module__main">
      <span class="gate-select-row-module__title">{{ title }}</span>
      <div class="gate-select-row-module__controls">
        <div class="gate-select-row-module__select">
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
    </div>
    <p v-if="hint" class="gate-select-row-module__hint">{{ hint }}</p>
    <p v-if="saveSuccess" class="gate-select-row-module__success">Saved.</p>
    <p v-else-if="saveError" class="gate-select-row-module__error">{{ saveError }}</p>
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
    /** 'inline' = title, dropdown, save on one row. 'stacked' = title on top, dropdown + save below. */
    layout?: 'inline' | 'stacked'
    showUseDefault?: boolean
    showAdminOnly?: boolean
    showSave?: boolean
    saveLabel?: string
    dirty?: boolean
    disabled?: boolean
    loading?: boolean
    saveSuccess?: boolean
    saveError?: string | null
    source?: 'edge' | 'db'
  }>(),
  {
    hint: '',
    layout: 'inline',
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
.gate-select-row-module {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
}

.gate-select-row-module__main {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  flex-wrap: wrap;
}

.gate-select-row-module__controls {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  flex: 1;
  min-width: 14rem;
}

.gate-select-row-module--stacked .gate-select-row-module__main {
  flex-direction: column;
  align-items: stretch;
  gap: var(--theme-space-sm);
}

.gate-select-row-module--stacked .gate-select-row-module__controls {
  flex: none;
  min-width: 0;
}

.gate-select-row-module--stacked .gate-select-row-module__select {
  flex: 1;
}

.gate-select-row-module__title {
  flex-shrink: 0;
  min-width: 10rem;
  font-size: var(--theme-font-sm);
  font-weight: 600;
  color: var(--theme-text-primary);
}

.gate-select-row-module--stacked .gate-select-row-module__title {
  min-width: 0;
}

.gate-select-row-module__select {
  flex: 1;
  min-width: 14rem;
}

.gate-select-row-module--stacked .gate-select-row-module__select {
  min-width: 0;
}

.gate-select-row-module__select :deep(.gate-select) {
  margin-bottom: 0;
}

.gate-select-row-module__hint,
.gate-select-row-module__success,
.gate-select-row-module__error {
  margin: 0;
  font-size: var(--theme-font-xs);
  line-height: 1.35;
}

.gate-select-row-module__hint {
  color: var(--theme-text-muted);
}

.gate-select-row-module__success {
  color: var(--theme-status-success, var(--theme-text-muted));
}

.gate-select-row-module__error {
  color: var(--theme-error);
}
</style>
