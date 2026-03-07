<template>
  <div class="mint-catalog">
    <div v-if="loading" class="mint-catalog__loading">
      <Icon icon="mdi:loading" class="mint-catalog__spinner" />
      Loading...
    </div>

    <template v-else>
      <p v-if="!splMints.length && !nftMints.length" class="mint-catalog__empty">
        No mints configured yet.
      </p>

      <template v-else>
        <section v-if="splMints.length" class="mint-catalog__section">
          <h5 class="mint-catalog__section-title">SPL tokens</h5>
          <ul class="mint-catalog__list">
            <li
              v-for="item in splMints"
              :key="item.id"
              class="mint-catalog__item"
              :class="{ 'mint-catalog__item--error': item._error }"
            >
              <button
                type="button"
                class="mint-catalog__item-btn"
                :disabled="item._loading"
                @click="emit('inspect', item)"
              >
                <div class="mint-catalog__thumb">
                  <img v-if="item.image" :src="item.image" :alt="item.label" />
                  <span v-else class="mint-catalog__thumb-placeholder">
                    <Icon v-if="item._loading" icon="mdi:loading" class="mint-catalog__item-spin" />
                    <Icon v-else icon="mdi:token" />
                  </span>
                </div>
                <div class="mint-catalog__detail">
                  <span v-if="item._loading" class="mint-catalog__name mint-catalog__name--muted">
                    {{ truncateAddress(item.mint, 6, 4) }}
                  </span>
                  <span v-else-if="item._error" class="mint-catalog__name mint-catalog__name--muted">
                    {{ truncateAddress(item.mint, 6, 4) }}
                  </span>
                  <template v-else>
                    <span class="mint-catalog__name">
                      {{ item.label }}
                      <span v-if="item.symbol" class="mint-catalog__symbol">({{ item.symbol }})</span>
                    </span>
                    <code class="mint-catalog__address">{{ truncateAddress(item.mint, 6, 4) }}</code>
                  </template>
                  <span v-if="item._error" class="mint-catalog__error-text">{{ item._error }}</span>
                  <span v-else-if="item._loading" class="mint-catalog__loading-text">Loading...</span>
                </div>
              </button>

              <div v-if="!readonly" class="mint-catalog__actions">
                <slot name="item-extra" :item="item" />
                <button
                  type="button"
                  class="mint-catalog__action-btn"
                  :disabled="!!pendingIds?.[item.id]"
                  :title="`Remove ${item.label}`"
                  @click.stop="emit('delete', item)"
                >
                  <Icon v-if="pendingIds?.[item.id]" icon="mdi:loading" class="mint-catalog__item-spin" />
                  <Icon v-else icon="mdi:close" />
                </button>
              </div>
            </li>
          </ul>
        </section>

        <section v-if="nftMints.length" class="mint-catalog__section">
          <h5 class="mint-catalog__section-title">NFT collections</h5>
          <ul class="mint-catalog__list">
            <li
              v-for="item in nftMints"
              :key="item.id"
              class="mint-catalog__item"
              :class="{ 'mint-catalog__item--error': item._error }"
            >
              <button
                type="button"
                class="mint-catalog__item-btn"
                :disabled="item._loading"
                @click="emit('inspect', item)"
              >
                <div class="mint-catalog__thumb">
                  <img v-if="item.image" :src="item.image" :alt="item.label" />
                  <span v-else class="mint-catalog__thumb-placeholder">
                    <Icon v-if="item._loading" icon="mdi:loading" class="mint-catalog__item-spin" />
                    <Icon v-else icon="mdi:image-off" />
                  </span>
                </div>
                <div class="mint-catalog__detail">
                  <span v-if="item._loading" class="mint-catalog__name mint-catalog__name--muted">
                    {{ truncateAddress(item.mint, 6, 4) }}
                  </span>
                  <span v-else-if="item._error" class="mint-catalog__name mint-catalog__name--muted">
                    {{ truncateAddress(item.mint, 6, 4) }}
                  </span>
                  <template v-else>
                    <span class="mint-catalog__name">{{ item.label }}</span>
                    <code class="mint-catalog__address">{{ truncateAddress(item.mint, 6, 4) }}</code>
                  </template>
                  <span v-if="item._error" class="mint-catalog__error-text">{{ item._error }}</span>
                  <span v-else-if="item._loading" class="mint-catalog__loading-text">Loading...</span>
                </div>
              </button>

              <div v-if="!readonly" class="mint-catalog__actions">
                <slot name="item-extra" :item="item" />
                <button
                  type="button"
                  class="mint-catalog__action-btn"
                  :disabled="!!pendingIds?.[item.id]"
                  :title="`Remove ${item.label}`"
                  @click.stop="emit('delete', item)"
                >
                  <Icon v-if="pendingIds?.[item.id]" icon="mdi:loading" class="mint-catalog__item-spin" />
                  <Icon v-else icon="mdi:close" />
                </button>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </template>

    <div v-if="!readonly" class="mint-catalog__add">
      <slot name="add" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { truncateAddress } from '@decentraguild/display'
import type { CatalogMintItem } from '~/types/mints'

const props = defineProps<{
  mints: CatalogMintItem[]
  loading?: boolean
  readonly?: boolean
  pendingIds?: Record<string | number, boolean>
}>()

const emit = defineEmits<{
  inspect: [item: CatalogMintItem]
  delete: [item: CatalogMintItem]
}>()

const splMints = computed(() =>
  props.mints
    .filter((m) => m.kind === 'SPL')
    .sort((a, b) => a.label.localeCompare(b.label))
)

const nftMints = computed(() =>
  props.mints
    .filter((m) => m.kind === 'NFT')
    .sort((a, b) => a.label.localeCompare(b.label))
)
</script>

<style scoped>
.mint-catalog__loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  color: var(--theme-text-muted);
  font-size: var(--theme-font-sm);
}

.mint-catalog__spinner {
  animation: mint-catalog-spin 1s linear infinite;
}

@keyframes mint-catalog-spin {
  to { transform: rotate(360deg); }
}

.mint-catalog__empty {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin: 0 0 var(--theme-space-md);
}

.mint-catalog__section {
  margin-bottom: var(--theme-space-md);
}

.mint-catalog__section-title {
  font-size: var(--theme-font-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--theme-text-muted);
  font-weight: 600;
  margin: 0 0 var(--theme-space-xs);
}

.mint-catalog__list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.mint-catalog__item {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  padding: var(--theme-space-xs) 0;
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.mint-catalog__item:last-child {
  border-bottom: none;
}

.mint-catalog__item-btn {
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

.mint-catalog__item-btn:hover:not(:disabled) {
  color: var(--theme-text-primary);
}

.mint-catalog__item-btn:disabled {
  cursor: default;
}

.mint-catalog__thumb {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--theme-radius-sm);
  overflow: hidden;
  background: var(--theme-bg-muted);
}

.mint-catalog__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mint-catalog__thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--theme-text-muted);
  font-size: 1.25rem;
}

.mint-catalog__detail {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mint-catalog__name {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mint-catalog__name--muted {
  font-weight: 400;
  color: var(--theme-text-muted);
}

.mint-catalog__symbol {
  font-weight: 400;
  color: var(--theme-text-muted);
  margin-left: var(--theme-space-xs);
}

.mint-catalog__address {
  font-family: var(--theme-font-mono, monospace);
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.mint-catalog__loading-text {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.mint-catalog__error-text {
  font-size: var(--theme-font-xs);
  color: var(--theme-error);
}

.mint-catalog__actions {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  flex-shrink: 0;
}

.mint-catalog__action-btn {
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

.mint-catalog__action-btn:hover:not(:disabled) {
  color: var(--theme-text-primary);
  background: var(--theme-bg-secondary);
}

.mint-catalog__action-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.mint-catalog__item-spin {
  animation: mint-catalog-spin 0.8s linear infinite;
}

.mint-catalog__add {
  margin-top: var(--theme-space-md);
  border-top: var(--theme-border-thin) solid var(--theme-border);
  padding-top: var(--theme-space-md);
}
</style>
