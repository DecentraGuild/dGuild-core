<template>
  <div class="mint-modal__header">
    <div class="mint-modal__header-identity">
      <div class="mint-modal__thumb">
        <img v-if="display.image" :src="display.image" :alt="display.label ?? ''" class="mint-modal__thumb-img" />
        <span v-else class="mint-modal__thumb-placeholder">
          <Icon :icon="display.kind === 'NFT' ? 'lucide:image-off' : 'lucide:circle-dollar-sign'" />
        </span>
      </div>
      <div class="mint-modal__header-text">
        <h3 id="mint-modal-title" class="mint-modal__title">{{ display.label }}</h3>
        <div class="mint-modal__header-badges">
          <span class="mint-modal__kind-badge">{{ display.kind === 'SPL' ? 'SPL Token' : 'NFT Collection' }}</span>
          <span v-if="display.symbol" class="mint-modal__symbol">{{ display.symbol }}</span>
          <span v-if="display.tier" class="mint-modal__tier-badge" :class="`mint-modal__tier-badge--${display.tier}`">{{ display.tier }}</span>
          <TrackIndicators
            :track-holders="display.track_holders"
            :track-snapshot="display.track_snapshot"
            :track-transactions="display.track_transactions"
          />
        </div>
      </div>
    </div>
    <div class="mint-modal__header-controls">
      <button
        v-if="showJsonToggle"
        type="button"
        class="mint-modal__icon-btn"
        :title="showJson ? 'Show fields' : 'Show JSON'"
        @click="$emit('toggle-json')"
      >
        <Icon :icon="showJson ? 'lucide:list' : 'lucide:braces'" />
      </button>
      <button
        type="button"
        class="mint-modal__icon-btn"
        :class="{ 'mint-modal__icon-btn--success': copied }"
        :title="copied ? 'Copied' : 'Copy address'"
        @click="$emit('copy-mint')"
      >
        <Icon :icon="copied ? 'lucide:check' : 'lucide:copy'" />
      </button>
      <a :href="mintExplorerUrl" target="_blank" rel="noopener" class="mint-modal__icon-btn" title="View on Solscan">
        <Icon icon="lucide:external-link" />
      </a>
      <button type="button" class="mint-modal__close" aria-label="Close" @click="$emit('close')">
        <Icon icon="lucide:x" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import TrackIndicators from '~/components/mint/TrackIndicators.vue'

defineProps<{
  display: {
    label: string
    kind: string
    symbol?: string | null
    image?: string | null
    tier?: string
    track_holders?: boolean
    track_snapshot?: boolean
    track_transactions?: boolean
  }
  mintExplorerUrl: string
  showJsonToggle?: boolean
  showJson?: boolean
  copied?: boolean
}>()

defineEmits<{
  'toggle-json': []
  'copy-mint': []
  close: []
}>()
</script>
