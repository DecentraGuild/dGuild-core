<template>
  <div class="condition-set-catalog">
    <div class="condition-set-catalog__header">
      <h5 class="condition-set-catalog__title">Rules catalog</h5>
      <Button
        v-if="!hideCreateButton"
        variant="brand"
        size="sm"
        class="condition-set-catalog__new"
        :disabled="loading"
        @click="emit('create')"
      >
        New rule
      </Button>
    </div>
    <div v-if="showFilter" class="condition-set-catalog__tabs">
      <div class="condition-set-catalog__tabs-pills">
        <button
          type="button"
          class="condition-set-catalog__tab"
          :class="{ 'condition-set-catalog__tab--active': filter === 'all' }"
          @click="emit('update:filter', 'all')"
        >
          All
        </button>
        <button
          type="button"
          class="condition-set-catalog__tab"
          :class="{ 'condition-set-catalog__tab--active': filter === 'discord' }"
          @click="emit('update:filter', 'discord')"
        >
          Discord
        </button>
        <button
          type="button"
          class="condition-set-catalog__tab"
          :class="{ 'condition-set-catalog__tab--active': filter === 'weighted' }"
          @click="emit('update:filter', 'weighted')"
        >
          Weighted
        </button>
      </div>
    </div>
    <p class="condition-set-catalog__hint">
      {{ hideDeleteButton ? 'Click a rule to select it. Use edit to change.' : 'Click a rule to select it. Use edit to change, trash to delete.' }}
    </p>

    <div v-if="loading" class="condition-set-catalog__loading">
      <Icon icon="lucide:loader-2" class="condition-set-catalog__spinner" />
      Loading…
    </div>

    <p v-else-if="error" class="condition-set-catalog__error">{{ error }}</p>

    <ul v-else-if="displayItems.length" class="condition-set-catalog__list">
      <li
        v-for="item in displayItems"
        :key="item.id"
        class="condition-set-catalog__item"
        :class="{ 'condition-set-catalog__item--active': item.id === activeId }"
      >
        <button
          type="button"
          class="condition-set-catalog__item-btn"
          @click="emit('select', item)"
        >
          <Icon icon="lucide:file-text" class="condition-set-catalog__icon" />
          <div class="condition-set-catalog__detail">
            <div class="condition-set-catalog__name-row">
              <span class="condition-set-catalog__name">{{ item.name }}</span>
              <span v-if="item.discordRoleName" class="condition-set-catalog__discord-badge">
                <Icon icon="lucide:discord" class="condition-set-catalog__discord-icon" />
                {{ item.discordRoleName }}
              </span>
            </div>
            <span class="condition-set-catalog__meta">
              {{ item.conditionSummary || `${item.conditionCount} condition${item.conditionCount === 1 ? '' : 's'}` }}
            </span>
          </div>
        </button>
        <div class="condition-set-catalog__actions">
          <Button
            variant="ghost"
            size="icon"
            class="condition-set-catalog__edit"
            aria-label="Edit rule"
            @click.stop="emit('edit', item)"
          >
            <Icon icon="lucide:pencil" />
          </Button>
          <Button
            v-if="!hideDeleteButton"
            variant="ghost"
            size="icon"
            class="condition-set-catalog__trash"
            aria-label="Delete rule"
            @click.stop="emit('delete', item)"
          >
            <Icon icon="lucide:trash-2" />
          </Button>
        </div>
      </li>
    </ul>

    <p v-else class="condition-set-catalog__empty">
      {{ filterUnassigned && items.length > 0 ? 'No unassigned rules.' : 'No rules in catalog.' }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import type { ConditionSetItem } from '~/composables/conditions/useConditionSetCatalog'

const props = withDefaults(
  defineProps<{
    items: ConditionSetItem[]
    loading: boolean
    error: string | null
    activeId?: number | null
    filter?: 'all' | 'discord' | 'weighted'
    showFilter?: boolean
    filterUnassigned?: boolean
    hideCreateButton?: boolean
    /** When true, only show edit button (no delete). Use in selection modals. */
    hideDeleteButton?: boolean
  }>(),
  { filter: 'all', showFilter: false, filterUnassigned: false, hideCreateButton: false, hideDeleteButton: false }
)

const displayItems = computed(() => {
  if (!props.filterUnassigned) return props.items
  return props.items.filter((i) => !i.discordRoleId)
})

const emit = defineEmits<{
  select: [item: ConditionSetItem]
  edit: [item: ConditionSetItem]
  delete: [item: ConditionSetItem]
  create: []
  'update:filter': [value: 'all' | 'discord' | 'weighted']
}>()
</script>

<style scoped>
.condition-set-catalog {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.condition-set-catalog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--theme-space-sm);
  margin-bottom: var(--theme-space-xs);
}

.condition-set-catalog__title {
  font-size: var(--theme-font-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--theme-text-muted);
  font-weight: 600;
  margin: 0;
}

.condition-set-catalog__new {
  flex-shrink: 0;
}

.condition-set-catalog__tabs {
  margin-bottom: var(--theme-space-sm);
}

.condition-set-catalog__tabs-pills {
  display: inline-flex;
  padding: 2px;
  background-color: var(--theme-bg-muted);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
}

.condition-set-catalog__tab {
  padding: 6px 12px;
  font-size: var(--theme-font-sm);
  font-weight: 500;
  color: var(--theme-text-muted);
  background: none;
  border: none;
  border-radius: calc(var(--theme-radius-md) - 2px);
  cursor: pointer;
}

.condition-set-catalog__tab:hover {
  color: var(--theme-secondary);
}

.condition-set-catalog__tab--active {
  color: var(--theme-secondary);
  background-color: var(--theme-bg-card);
}

.condition-set-catalog__hint {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  margin: 0 0 var(--theme-space-sm);
  line-height: 1.4;
}

.condition-set-catalog__loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  color: var(--theme-text-muted);
  font-size: var(--theme-font-sm);
}

.condition-set-catalog__spinner {
  animation: condition-set-catalog-spin 1s linear infinite;
}

@keyframes condition-set-catalog-spin {
  to { transform: rotate(360deg); }
}

.condition-set-catalog__error {
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
  margin: 0;
}

.condition-set-catalog__list {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
}

.condition-set-catalog__item {
  display: flex;
  align-items: center;
  gap: var(--theme-space-md);
  padding: var(--theme-space-md);
  background-color: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.condition-set-catalog__item:hover {
  background-color: var(--theme-bg-muted);
  border-color: var(--theme-border);
}

.condition-set-catalog__item--active {
  border-color: var(--theme-primary);
  background-color: var(--theme-bg-muted);
}

.condition-set-catalog__item-btn {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--theme-space-md);
  width: 100%;
  padding: 0;
  background: none;
  border: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}

.condition-set-catalog__icon {
  flex-shrink: 0;
  color: var(--theme-text-muted);
  font-size: 1.25rem;
}

.condition-set-catalog__item--active .condition-set-catalog__icon {
  color: var(--theme-primary);
}

.condition-set-catalog__detail {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
}

.condition-set-catalog__name-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  flex-wrap: wrap;
}

.condition-set-catalog__name {
  font-size: var(--theme-font-md);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.condition-set-catalog__meta {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--theme-space-xs);
}

.condition-set-catalog__actions {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  flex-shrink: 0;
}

.condition-set-catalog__edit,
.condition-set-catalog__trash {
  color: var(--theme-text-muted);
}

.condition-set-catalog__edit:hover {
  color: var(--theme-primary);
}

.condition-set-catalog__trash:hover {
  color: var(--theme-error);
}

.condition-set-catalog__discord-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: var(--theme-radius-sm);
  background: rgba(88, 101, 242, 0.2);
  color: #5865f2;
  font-size: var(--theme-font-xs);
  flex-shrink: 0;
}

.condition-set-catalog__discord-icon {
  font-size: 0.75em;
}

.condition-set-catalog__empty {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin: 0;
}
</style>
