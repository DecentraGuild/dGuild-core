<template>
  <div class="module-window-row">
    <button
      type="button"
      class="module-window-row__arrow"
      aria-label="Previous module"
      :disabled="!canGoPrev"
      @click="emit('prev')"
    >
      <Icon icon="mdi:chevron-left" class="module-window-row__arrow-icon" aria-hidden="true" />
    </button>
    <div class="module-window-row__panel">
      <slot />
    </div>
    <button
      type="button"
      class="module-window-row__arrow"
      aria-label="Next module"
      :disabled="!canGoNext"
      @click="emit('next')"
    >
      <Icon icon="mdi:chevron-right" class="module-window-row__arrow-icon" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'

defineProps<{
  canGoPrev: boolean
  canGoNext: boolean
}>()

const emit = defineEmits<{
  prev: []
  next: []
}>()
</script>

<style scoped>
.module-window-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--theme-space-sm);
  width: 100%;
  min-width: 0;
}

.module-window-row__panel {
  flex: 1;
  min-width: 0;
}

.module-window-row__arrow {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background: var(--theme-bg-card);
  color: var(--theme-text-primary);
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    opacity 0.15s ease;
}

.module-window-row__arrow:hover:not(:disabled) {
  border-color: var(--theme-primary);
  color: var(--theme-primary);
}

.module-window-row__arrow:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.module-window-row__arrow-icon {
  width: 1.5rem;
  height: 1.5rem;
}

@media (max-width: 479px) {
  .module-window-row__arrow {
    width: 2rem;
    height: 2rem;
  }

  .module-window-row__arrow-icon {
    width: 1.25rem;
    height: 1.25rem;
  }
}
</style>
