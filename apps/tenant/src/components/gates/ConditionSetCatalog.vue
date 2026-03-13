<template>
  <div class="condition-set-catalog">
    <div class="condition-set-catalog__header">
      <h5 class="condition-set-catalog__title">Rules catalog</h5>
      <Button
        variant="default"
        size="sm"
        class="condition-set-catalog__new"
        :disabled="loading"
        @click="emit('create')"
      >
        New rule
      </Button>
    </div>
    <div v-if="showFilter" class="condition-set-catalog__tabs">
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
    <p class="condition-set-catalog__hint">
      Click a rule to select it. Use edit to change, trash to delete.
    </p>

    <div v-if="loading" class="condition-set-catalog__loading">
      <Icon icon="lucide:loader-2" class="condition-set-catalog__spinner" />
      Loading…
    </div>

    <p v-else-if="error" class="condition-set-catalog__error">{{ error }}</p>

    <ul v-else-if="items.length" class="condition-set-catalog__list">
      <li
        v-for="item in items"
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
          variant="ghost"
          size="icon"
          class="condition-set-catalog__trash"
          aria-label="Delete rule"
          @click.stop="emit('delete', item)"
        >
          <Icon icon="lucide:trash-2" />
        </Button>
      </li>
    </ul>

    <p v-else class="condition-set-catalog__empty">
      No rules in catalog.
    </p>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import type { ConditionSetItem } from '~/composables/conditions/useConditionSetCatalog'

withDefaults(
  defineProps<{
    items: ConditionSetItem[]
    loading: boolean
    error: string | null
    activeId?: number | null
    filter?: 'all' | 'discord' | 'weighted'
    showFilter?: boolean
  }>(),
  { filter: 'all', showFilter: false }
)

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
  display: flex;
  gap: 2px;
  margin-bottom: var(--theme-space-xs);
}

.condition-set-catalog__tab {
  padding: 4px 10px;
  font-size: var(--theme-font-xs);
  font-weight: 500;
  color: var(--theme-text-muted);
  background: none;
  border: none;
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
}

.condition-set-catalog__tab:hover {
  color: var(--theme-text-primary);
  background: var(--theme-bg-muted);
}

.condition-set-catalog__tab--active {
  color: var(--theme-primary);
  background: var(--theme-bg-muted);
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
}

.condition-set-catalog__item {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.condition-set-catalog__item-btn {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  width: 100%;
  padding: var(--theme-space-sm) 0;
  background: none;
  border: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: var(--theme-radius-md);
}

.condition-set-catalog__item-btn:hover {
  background: var(--theme-bg-muted);
}

.condition-set-catalog__edit,
.condition-set-catalog__trash {
  flex-shrink: 0;
  color: var(--theme-text-muted);
}

.condition-set-catalog__edit:hover {
  color: var(--theme-primary);
}

.condition-set-catalog__trash:hover {
  color: var(--theme-error);
}

.condition-set-catalog__item:last-child {
  border-bottom: none;
}

.condition-set-catalog__item--active .condition-set-catalog__item-btn {
  background: var(--theme-bg-muted);
  color: var(--theme-primary);
}

.condition-set-catalog__icon {
  flex-shrink: 0;
  color: var(--theme-text-muted);
  font-size: 1rem;
}

.condition-set-catalog__item--active .condition-set-catalog__icon {
  color: var(--theme-primary);
}

.condition-set-catalog__detail {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.condition-set-catalog__name-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  flex-wrap: wrap;
}

.condition-set-catalog__name {
  font-size: var(--theme-font-sm);
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
