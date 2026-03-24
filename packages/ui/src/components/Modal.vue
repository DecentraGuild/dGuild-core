<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
        class="modal"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        @keydown.escape="onClose"
      >
        <div class="modal__backdrop" aria-hidden="true" @click="onClose" />
        <div class="modal__content" :class="{ 'modal__content--wide': wide }" @click.stop>
          <div class="modal__header">
            <h2 v-if="title" :id="titleId" class="modal__title">{{ title }}</h2>
            <button
              type="button"
              class="modal__close"
              aria-label="Close"
              @click="onClose"
            >
              <Icon icon="mdi:close" />
            </button>
          </div>
          <div class="modal__body">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useId } from 'vue'

withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    /** When true, modal content is wider (e.g. for forms with many fields) */
    wide?: boolean
  }>(),
  { wide: false }
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const titleId = useId()

function onClose() {
  emit('update:modelValue', false)
}
</script>

<style scoped>
/* Higher than other overlays (e.g. escrow/trade modals) so connect-wallet and dialogs always on top */
.modal {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--theme-space-lg);
}

.modal__backdrop {
  position: absolute;
  inset: 0;
  background: var(--theme-backdrop, rgba(0, 0, 0, 0.6));
}

.modal__content {
  position: relative;
  width: 100%;
  max-width: 24rem;
  max-height: 90vh;
  overflow: auto;
  background: var(--theme-bg-card);
  border-radius: var(--theme-radius-lg);
  box-shadow: var(--theme-shadow-card);
}
.modal__content--wide {
  max-width: 42rem;
}

@media (max-width: 640px) {
  .modal {
    align-items: flex-end;
    padding: 0;
  }

  .modal__content,
  .modal__content--wide {
    width: 100%;
    max-width: 100%;
    max-height: 85dvh;
    border-radius: var(--theme-radius-lg) var(--theme-radius-lg) 0 0;
  }

  .modal-enter-from .modal__content,
  .modal-leave-to .modal__content {
    transform: translateY(100%);
  }
}

.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--theme-space-md) var(--theme-space-lg);
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.modal__title {
  margin: 0;
  font-size: var(--theme-font-lg);
  font-weight: 600;
  color: var(--theme-text-primary);
}

.modal__close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--theme-space-xs);
  background: none;
  border: none;
  color: var(--theme-text-secondary);
  cursor: pointer;
  border-radius: var(--theme-radius-sm);
  transition: color 0.15s, background-color 0.15s;
}

.modal__close:hover {
  color: var(--theme-text-primary);
  background: var(--theme-bg-secondary);
}

.modal__close:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--theme-bg-card), 0 0 0 4px var(--theme-primary-light);
}

.modal__body {
  padding: var(--theme-space-lg);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal__content,
.modal-leave-active .modal__content {
  transition: transform 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal__content,
.modal-leave-to .modal__content {
  transform: scale(0.95);
}
</style>
