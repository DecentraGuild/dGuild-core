<template>
  <template v-if="entry?.userCostsInfo">
    <button
      type="button"
      class="module-costs-info__trigger"
      aria-label="Costs and fees"
      @click="open = true"
    >
      <Icon icon="lucide:circle-help" class="module-costs-info__icon" />
    </button>
    <SimpleModal
      :model-value="open"
      :title="modalTitle"
      @update:model-value="open = $event"
    >
      <p class="module-costs-info__text">{{ entry.userCostsInfo }}</p>
    </SimpleModal>
  </template>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { getModuleCatalogEntry } from '@decentraguild/catalog'
import SimpleModal from '~/components/ui/simple-modal/SimpleModal.vue'

const props = defineProps<{
  moduleId: string
}>()

const open = ref(false)

const entry = computed(() => getModuleCatalogEntry(props.moduleId))

const modalTitle = computed(() =>
  entry.value ? `Costs & fees — ${entry.value.name}` : 'Costs & fees'
)
</script>

<style scoped>
.module-costs-info__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--theme-space-xs);
  color: var(--theme-text-muted);
  background: none;
  border: none;
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
}

.module-costs-info__trigger:hover {
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-card);
}

.module-costs-info__icon {
  font-size: 1.25rem;
}

.module-costs-info__text {
  margin: 0;
  font-size: var(--theme-font-sm);
  line-height: 1.6;
  color: var(--theme-text-secondary);
  white-space: pre-line;
}
</style>
