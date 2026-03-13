<template>
  <div class="mint-catalog">
    <div v-if="loading" class="mint-catalog__loading">
      <Icon icon="lucide:loader-2" class="mint-catalog__spinner" />
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
            <MintListItem
              v-for="item in splMints"
              :key="item.id"
              :item="item"
              :show-symbol="true"
              placeholder-icon="lucide:circle-dollar-sign"
              :readonly="readonly"
              :item-extra-when-readonly="itemExtraWhenReadonly"
              :pending-ids="pendingIds"
              @inspect="emit('inspect', item)"
              @delete="emit('delete', item)"
            >
              <template #item-extra="{ item: slotItem }">
                <slot name="item-extra" :item="slotItem" />
              </template>
            </MintListItem>
          </ul>
        </section>

        <section v-if="nftMints.length" class="mint-catalog__section">
          <h5 class="mint-catalog__section-title">NFT collections</h5>
          <ul class="mint-catalog__list">
            <MintListItem
              v-for="item in nftMints"
              :key="item.id"
              :item="item"
              :show-symbol="false"
              placeholder-icon="lucide:image-off"
              :readonly="readonly"
              :item-extra-when-readonly="itemExtraWhenReadonly"
              :pending-ids="pendingIds"
              @inspect="emit('inspect', item)"
              @delete="emit('delete', item)"
            >
              <template #item-extra="{ item: slotItem }">
                <slot name="item-extra" :item="slotItem" />
              </template>
            </MintListItem>
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
import MintListItem from '~/components/mint/MintListItem.vue'
import type { CatalogMintItem } from '~/types/mints'

const props = defineProps<{
  mints: CatalogMintItem[]
  loading?: boolean
  readonly?: boolean
  /** When true and readonly, still show the item-extra slot (e.g. Load traits). */
  itemExtraWhenReadonly?: boolean
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

.mint-catalog__add {
  margin-top: var(--theme-space-md);
  border-top: var(--theme-border-thin) solid var(--theme-border);
  padding-top: var(--theme-space-md);
}
</style>
