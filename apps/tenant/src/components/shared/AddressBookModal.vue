<template>
  <SimpleModal
    :model-value="modelValue"
    title="Pick from Address Book"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="ab-modal">
      <div v-if="loading" class="ab-modal__state">
        <Icon icon="lucide:loader-2" class="ab-modal__spinner" />
        Loading…
      </div>
      <ul v-else-if="filtered.length" class="ab-modal__list">
        <li
          v-for="entry in filtered"
          :key="entry.mint"
          class="ab-modal__item"
        >
          <button
            type="button"
            class="ab-modal__entry"
            @click="select(entry)"
          >
            <span class="ab-modal__thumb">
              <img v-if="entry.image" :src="entry.image" :alt="entry.name ?? entry.label ?? ''" />
              <Icon v-else :icon="entry.kind === 'SPL' ? 'lucide:circle-dollar-sign' : 'lucide:image-off'" class="ab-modal__thumb-icon" />
            </span>
            <span class="ab-modal__text">
              <span class="ab-modal__name">{{ entry.name || entry.label || truncateAddress(entry.mint, 8, 4) }}</span>
              <span class="ab-modal__kind">{{ entry.kind }}</span>
            </span>
          </button>
        </li>
      </ul>
      <p v-else class="ab-modal__state ab-modal__state--empty">
        No mints in Address Book. Add mints in Admin > Address Book first.
      </p>
    </div>
  </SimpleModal>
</template>

<script setup lang="ts">
import { truncateAddress } from '@decentraguild/display'
import { Icon } from '@iconify/vue'
import SimpleModal from '~/components/ui/simple-modal/SimpleModal.vue'
import type { AddressBookEntry, MintKind } from '~/types/mints'
import { useAddressBook } from '~/composables/watchtower/useAddressBook'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    kind?: MintKind
  }>(),
  { kind: undefined }
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  select: [mint: string, entry: AddressBookEntry]
}>()

const { entries, loading, fetchEntries } = useAddressBook()

const filtered = computed(() => {
  if (!props.kind) return entries.value
  return entries.value.filter((e) => e.kind === props.kind)
})

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      fetchEntries()
    }
  },
  { immediate: true }
)

function select(entry: AddressBookEntry) {
  emit('select', entry.mint, entry)
  emit('update:modelValue', false)
}
</script>

<style scoped>
.ab-modal {
  min-width: 18rem;
  max-height: 60vh;
  overflow-y: auto;
}

.ab-modal__list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.ab-modal__item {
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.ab-modal__item:last-child {
  border-bottom: none;
}

.ab-modal__entry {
  display: flex;
  align-items: center;
  width: 100%;
  padding: var(--theme-space-xs) var(--theme-space-sm);
  text-align: left;
  background: none;
  border: none;
  font: inherit;
  color: var(--theme-text-primary);
  cursor: pointer;
  gap: var(--theme-space-sm);
}

.ab-modal__entry:hover {
  background: var(--theme-bg-secondary);
}

.ab-modal__thumb {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: var(--theme-radius-sm);
  overflow: hidden;
  background: var(--theme-bg-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ab-modal__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ab-modal__thumb-icon {
  font-size: 0.9rem;
  color: var(--theme-text-muted);
}

.ab-modal__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.ab-modal__name {
  font-size: var(--theme-font-sm);
  font-weight: 500;
  color: var(--theme-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ab-modal__kind {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.ab-modal__state {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  padding: var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.ab-modal__state--empty {
  justify-content: center;
}

.ab-modal__spinner {
  animation: ab-modal-spin 0.8s linear infinite;
}

@keyframes ab-modal-spin {
  to { transform: rotate(360deg); }
}
</style>
