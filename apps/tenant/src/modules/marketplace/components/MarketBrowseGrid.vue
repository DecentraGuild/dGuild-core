<template>
  <div>
    <div class="market-browse-grid__toolbar">
      <div class="market-browse-grid__scale">
        <input
          :model-value="gridScaleRem"
          type="range"
          :min="gridScaleMin"
          :max="gridScaleMax"
          :step="gridScaleStep"
          class="market-browse-grid__scale-slider"
          aria-label="Card size"
          @input="onScaleInput"
        />
      </div>
    </div>
    <div class="market-browse-grid__grid" :style="gridStyle">
      <AssetCard
        v-for="asset in assetCards"
        :key="asset.mint"
        :mint="asset.mint"
        :asset-type="asset.assetType"
        :name="getDisplayName(asset) ?? null"
        :symbol="getDisplaySymbol(asset)"
        :image="getDisplayImage(asset)"
        :offer-count="asset.offerCount"
        :request-count="asset.requestCount"
        :collection-mint="asset.collectionMint"
        :traits="normalisedTraits(asset)"
        @select="onSelect(asset)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AssetCard from './AssetCard.vue'
import { normaliseAttributes } from '~/utils/nftFilterHelpers'
import type { AssetWithCounts } from '~/composables/mint/useAssetWithCounts'

const GRID_SCALE_MIN = 6
const GRID_SCALE_MAX = 20
const GRID_SCALE_STEPS = 5
const gridScaleStep = (GRID_SCALE_MAX - GRID_SCALE_MIN) / (GRID_SCALE_STEPS - 1)

const props = withDefaults(
  defineProps<{
    assetCards: AssetWithCounts[]
    gridScaleRem: number
    gridScaleMin?: number
    gridScaleMax?: number
    getDisplayName: (asset: AssetWithCounts) => string | null
    getDisplaySymbol: (asset: AssetWithCounts) => string | null
    getDisplayImage: (asset: AssetWithCounts) => string | null
  }>(),
  { gridScaleMin: () => GRID_SCALE_MIN, gridScaleMax: () => GRID_SCALE_MAX }
)

const emit = defineEmits<{
  select: [payload: { mint: string; assetType: string; collectionMint?: string | null }]
  'update:gridScaleRem': [value: number]
}>()

const gridStyle = computed(() => ({ '--market-grid-min': `${props.gridScaleRem}rem` }))

function onScaleInput(e: Event) {
  const target = e.target as HTMLInputElement
  const n = target?.value != null ? parseFloat(target.value) : NaN
  if (Number.isFinite(n) && n >= GRID_SCALE_MIN && n <= GRID_SCALE_MAX) {
    emit('update:gridScaleRem', n)
  }
}

function normalisedTraits(asset: AssetWithCounts) {
  return normaliseAttributes(asset.metadata?.traits ?? [])
}

function onSelect(asset: AssetWithCounts) {
  emit('select', {
    mint: asset.mint,
    assetType: asset.assetType,
    collectionMint: asset.collectionMint ?? undefined,
  })
}
</script>

<style scoped>
.market-browse-grid__toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--theme-space-sm);
  margin-bottom: var(--theme-space-sm);
}

.market-browse-grid__scale {
  display: flex;
  align-items: center;
}

.market-browse-grid__scale-slider {
  width: 6rem;
  accent-color: var(--theme-primary);
}

.market-browse-grid__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--market-grid-min, 10rem), 1fr));
  gap: var(--theme-space-sm);
}
</style>
