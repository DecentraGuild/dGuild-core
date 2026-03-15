<template>
  <div
    v-if="hasAny"
    class="track-indicators"
    role="img"
    :aria-label="ariaLabel"
  >
    <span
      v-if="trackHolders"
      class="track-indicators__cell"
      title="Holders"
    >
      <Icon icon="lucide:users" class="track-indicators__icon" />
    </span>
    <span
      v-if="trackSnapshot"
      class="track-indicators__cell"
      title="Snapshot"
    >
      <Icon icon="lucide:camera" class="track-indicators__icon" />
    </span>
    <span
      v-if="trackTransactions"
      class="track-indicators__cell"
      title="Transactions"
    >
      <Icon icon="lucide:arrow-left-right" class="track-indicators__icon" />
    </span>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed } from 'vue'

const props = defineProps<{
  trackHolders?: boolean
  trackSnapshot?: boolean
  trackTransactions?: boolean
}>()

const hasAny = computed(
  () =>
    (props.trackHolders ?? false) ||
    (props.trackSnapshot ?? false) ||
    (props.trackTransactions ?? false)
)

const ariaLabel = computed(() => {
  const parts: string[] = []
  if (props.trackHolders) parts.push('Current holders')
  if (props.trackSnapshot) parts.push('Snapshot')
  if (props.trackTransactions) parts.push('Transactions')
  return parts.length ? `Tracking: ${parts.join(', ')}` : ''
})
</script>

<style scoped>
.track-indicators {
  display: inline-flex;
  align-items: center;
  gap: var(--theme-space-xs);
}

.track-indicators__cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  color: var(--theme-text-muted);
}

.track-indicators__icon {
  font-size: 0.875rem;
}
</style>
