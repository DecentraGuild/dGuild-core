<template>
  <li
    class="mint-list-item"
    :class="{ 'mint-list-item--error': item._error }"
  >
    <button
      type="button"
      class="mint-list-item__btn"
      :disabled="item._loading"
      @click="emit('inspect', item)"
    >
      <div class="mint-list-item__thumb">
        <img v-if="item.image" :src="item.image" :alt="item.label" />
        <span v-else class="mint-list-item__thumb-placeholder">
          <Icon v-if="item._loading" icon="lucide:loader-2" class="mint-list-item__spin" />
          <Icon v-else :icon="placeholderIcon" />
        </span>
      </div>
      <div class="mint-list-item__detail">
        <span v-if="item._loading" class="mint-list-item__name mint-list-item__name--muted">
          {{ truncateAddress(item.mint, 6, 4) }}
        </span>
        <span v-else-if="item._error" class="mint-list-item__name mint-list-item__name--muted">
          {{ truncateAddress(item.mint, 6, 4) }}
        </span>
        <template v-else>
          <span class="mint-list-item__name">
            {{ item.label }}
            <span v-if="showSymbol && item.symbol" class="mint-list-item__symbol">({{ item.symbol }})</span>
          </span>
          <code class="mint-list-item__address">{{ truncateAddress(item.mint, 6, 4) }}</code>
        </template>
        <span v-if="item._error" class="mint-list-item__error-text">{{ item._error }}</span>
        <span v-else-if="item._loading" class="mint-list-item__loading-text">Loading...</span>
      </div>
    </button>

    <div v-if="!readonly || itemExtraWhenReadonly" class="mint-list-item__actions">
      <slot name="item-extra" :item="item" />
      <button
        v-if="!readonly"
        type="button"
        class="mint-list-item__action-btn"
        :disabled="!!pendingIds?.[item.id]"
        :title="`Remove ${item.label}`"
        @click.stop="emit('delete', item)"
      >
        <Icon v-if="pendingIds?.[item.id]" icon="lucide:loader-2" class="mint-list-item__spin" />
        <Icon v-else icon="lucide:x" />
      </button>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { truncateAddress } from '@decentraguild/display'
import type { CatalogMintItem } from '~/types/mints'

const props = defineProps<{
  item: CatalogMintItem
  showSymbol?: boolean
  placeholderIcon?: string
  readonly?: boolean
  itemExtraWhenReadonly?: boolean
  pendingIds?: Record<string | number, boolean>
}>()

const emit = defineEmits<{
  inspect: [item: CatalogMintItem]
  delete: [item: CatalogMintItem]
}>()

const placeholderIcon = computed(() =>
  props.placeholderIcon ?? (props.item.kind === 'SPL' ? 'lucide:circle-dollar-sign' : 'lucide:image-off')
)
</script>

<style scoped>
.mint-list-item {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  padding: var(--theme-space-xs) 0;
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.mint-list-item:last-child {
  border-bottom: none;
}

.mint-list-item__btn {
  display: flex;
  align-items: center;
  gap: var(--theme-space-md);
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: var(--theme-radius-sm);
}

.mint-list-item__btn:hover:not(:disabled) {
  color: var(--theme-text-primary);
}

.mint-list-item__btn:disabled {
  cursor: default;
}

.mint-list-item__thumb {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--theme-radius-sm);
  overflow: hidden;
  background: var(--theme-bg-muted);
}

.mint-list-item__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mint-list-item__thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--theme-text-muted);
  font-size: 1.25rem;
}

.mint-list-item__detail {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mint-list-item__name {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mint-list-item__name--muted {
  font-weight: 400;
  color: var(--theme-text-muted);
}

.mint-list-item__symbol {
  font-weight: 400;
  color: var(--theme-text-muted);
  margin-left: var(--theme-space-xs);
}

.mint-list-item__address {
  font-family: var(--theme-font-mono, monospace);
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.mint-list-item__loading-text {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.mint-list-item__error-text {
  font-size: var(--theme-font-xs);
  color: var(--theme-error);
}

.mint-list-item__actions {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  flex-shrink: 0;
}

.mint-list-item__action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  background: none;
  border: none;
  color: var(--theme-text-muted);
  cursor: pointer;
  border-radius: var(--theme-radius-sm);
}

.mint-list-item__action-btn:hover:not(:disabled) {
  color: var(--theme-text-primary);
  background: var(--theme-bg-secondary);
}

.mint-list-item__action-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.mint-list-item__spin {
  animation: mint-list-item-spin 0.8s linear infinite;
}

@keyframes mint-list-item-spin {
  to { transform: rotate(360deg); }
}

.mint-list-item--error .mint-list-item__btn {
  color: var(--theme-text-muted);
}
</style>
