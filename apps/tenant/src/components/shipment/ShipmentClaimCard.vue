<template>
  <div class="shipment-claim-card">
    <div class="shipment-claim-card__top-links">
      <button
        v-if="claimLeafId"
        type="button"
        class="shipment-claim-card__icon-btn"
        :title="claimLeafId"
        @click.stop="copyClaimLeafId"
      >
        <Icon icon="lucide:copy" />
      </button>
      <a
        v-if="explorerUrl"
        :href="explorerUrl"
        target="_blank"
        rel="noopener"
        class="shipment-claim-card__icon-btn"
        title="View mint on explorer"
        @click.stop
      >
        <Icon icon="lucide:external-link" />
      </a>
    </div>
    <div class="shipment-claim-card__left">
      <div class="shipment-claim-card__content">
        <h4 class="shipment-claim-card__name">{{ title }}</h4>
        <span class="shipment-claim-card__amount">{{ amount }}</span>
        <p v-if="claimLeafId" class="shipment-claim-card__claim-id">
          <span class="shipment-claim-card__claim-id-label">Claim id</span>
          <code class="shipment-claim-card__claim-id-value">{{ shortClaimLeafId }}</code>
        </p>
        <Button
          variant="default"
          size="sm"
          class="shipment-claim-card__btn"
          :disabled="claiming"
          @click="emit('claim')"
        >
          <Icon v-if="claiming" icon="lucide:loader-2" class="shipment-claim-card__spinner" />
          Claim
        </Button>
      </div>
    </div>
    <div
      class="shipment-claim-card__right"
      :class="{ 'shipment-claim-card__right--fade': !hasBanner && hasImage }"
      :style="cardRightStyle"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'

const props = defineProps<{
  title: string
  amount: string
  claiming: boolean
  /** Decimal leaf hash for support / diagnostics (matches decompress `compressedLeafHash`). */
  claimLeafId?: string
  explorerUrl?: string
  hasBanner: boolean
  hasImage: boolean
  cardRightStyle: Record<string, string>
}>()

const emit = defineEmits<{
  claim: []
}>()

const shortClaimLeafId = computed(() => {
  const id = props.claimLeafId
  if (!id) return ''
  if (id.length <= 22) return id
  return `${id.slice(0, 10)}…${id.slice(-8)}`
})

async function copyClaimLeafId() {
  const id = props.claimLeafId
  if (!id) return
  try {
    await navigator.clipboard.writeText(id)
  } catch {
    void 0
  }
}
</script>

<style scoped>
.shipment-claim-card {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  min-height: 100px;
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  overflow: hidden;
  text-align: left;
}
.shipment-claim-card__top-links {
  position: absolute;
  top: var(--theme-space-sm);
  right: var(--theme-space-sm);
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  z-index: 1;
}
.shipment-claim-card__icon-btn {
  color: var(--theme-text-secondary);
  display: inline-flex;
  padding: 2px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: var(--theme-radius-sm);
}
a.shipment-claim-card__icon-btn {
  text-decoration: none;
}
.shipment-claim-card__icon-btn:hover {
  color: var(--theme-text);
}
.shipment-claim-card__claim-id {
  margin: 0;
  max-width: 100%;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.shipment-claim-card__claim-id-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.shipment-claim-card__claim-id-value {
  font-size: 0.65rem;
  word-break: break-all;
  text-align: center;
  line-height: 1.3;
}
.shipment-claim-card__left {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--theme-space-lg);
  background: var(--theme-bg-card);
}
.shipment-claim-card__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--theme-space-sm);
  color: var(--theme-text);
  text-align: center;
}
.shipment-claim-card__name {
  font-size: var(--theme-font-lg);
  font-weight: 600;
  margin: 0;
  line-height: 1.2;
}
.shipment-claim-card__amount {
  font-size: var(--theme-font-md);
  font-weight: 500;
  color: var(--theme-text-secondary);
}
.shipment-claim-card__right {
  min-height: 120px;
  background: var(--theme-bg-card);
}
.shipment-claim-card__right--fade {
  mask-image: linear-gradient(to right, transparent 0%, black 50%);
  -webkit-mask-image: linear-gradient(to right, transparent 0%, black 50%);
}
.shipment-claim-card__spinner {
  animation: shipment-claim-card-spin 1s linear infinite;
}
@keyframes shipment-claim-card-spin {
  to { transform: rotate(360deg); }
}

@media (min-width: 640px) {
  .shipment-claim-card {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
