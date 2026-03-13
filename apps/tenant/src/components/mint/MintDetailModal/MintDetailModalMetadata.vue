<template>
  <section class="mint-modal__section">
    <dl class="mint-modal__fields">
      <div class="mint-modal__field mint-modal__field--address">
        <dt class="mint-modal__field-label">Mint</dt>
        <dd class="mint-modal__field-value">
          <code class="mint-modal__mono">{{ display.mint }}</code>
          <div class="mint-modal__field-actions">
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
          </div>
        </dd>
      </div>
      <div v-if="display.symbol" class="mint-modal__field">
        <dt class="mint-modal__field-label">{{ isWatchtower ? 'Ticker' : 'Symbol' }}</dt>
        <dd class="mint-modal__field-value">{{ display.symbol }}</dd>
      </div>
      <div v-if="display.decimals != null" class="mint-modal__field">
        <dt class="mint-modal__field-label">Decimals</dt>
        <dd class="mint-modal__field-value">{{ display.decimals }}</dd>
      </div>
      <div v-if="display.sellerFeeBasisPoints != null" class="mint-modal__field">
        <dt class="mint-modal__field-label">{{ isWatchtower ? 'Royalty' : 'Seller fee' }}</dt>
        <dd class="mint-modal__field-value">
          {{ (display.sellerFeeBasisPoints / 100).toFixed(2) }}%
          <span class="mint-modal__field-muted">({{ display.sellerFeeBasisPoints }} bps)</span>
        </dd>
      </div>
      <div v-if="display.tokenStandard" class="mint-modal__field">
        <dt class="mint-modal__field-label">Type</dt>
        <dd class="mint-modal__field-value">{{ display.tokenStandard }}</dd>
      </div>
      <div v-if="display.updateAuthority" class="mint-modal__field mint-modal__field--address">
        <dt class="mint-modal__field-label">Update authority</dt>
        <dd class="mint-modal__field-value">
          <code class="mint-modal__mono">{{ truncateAddress(display.updateAuthority, 8, 6) }}</code>
        </dd>
      </div>
      <div v-if="display.uri" class="mint-modal__field">
        <dt class="mint-modal__field-label">URI</dt>
        <dd class="mint-modal__field-value">
          <a :href="display.uri" target="_blank" rel="noopener" class="mint-modal__link mint-modal__uri">{{ truncateAddress(display.uri, 40, 20) }}</a>
        </dd>
      </div>
      <div v-if="display.primarySaleHappened != null" class="mint-modal__field">
        <dt class="mint-modal__field-label">Primary sale</dt>
        <dd class="mint-modal__field-value">{{ display.primarySaleHappened ? 'Yes' : 'No' }}</dd>
      </div>
      <div v-if="display.isMutable != null" class="mint-modal__field">
        <dt class="mint-modal__field-label">Mutable</dt>
        <dd class="mint-modal__field-value">{{ display.isMutable ? 'Yes' : 'No' }}</dd>
      </div>
      <div v-if="display.editionNonce != null" class="mint-modal__field">
        <dt class="mint-modal__field-label">Edition nonce</dt>
        <dd class="mint-modal__field-value">{{ display.editionNonce }}</dd>
      </div>
      <div v-if="display.tier && !display.track_holders" class="mint-modal__field">
        <dt class="mint-modal__field-label">Tier</dt>
        <dd class="mint-modal__field-value">
          <span class="mint-modal__tier-badge" :class="`mint-modal__tier-badge--${display.tier}`">{{ display.tier }}</span>
        </dd>
      </div>
      <div v-if="display.createdAt" class="mint-modal__field">
        <dt class="mint-modal__field-label">Added</dt>
        <dd class="mint-modal__field-value mint-modal__field-muted">{{ formatDate(display.createdAt) }}</dd>
      </div>
    </dl>
  </section>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { formatDate, truncateAddress } from '@decentraguild/display'

defineProps<{
  display: {
    mint: string
    symbol?: string | null
    decimals?: number | null
    sellerFeeBasisPoints?: number | null
    tokenStandard?: string | null
    updateAuthority?: string | null
    uri?: string | null
    primarySaleHappened?: boolean | null
    isMutable?: boolean | null
    editionNonce?: number | null
    tier?: string
    track_holders?: boolean
    createdAt?: string
  }
  mintExplorerUrl: string
  isWatchtower?: boolean
  copied?: boolean
}>()

defineEmits<{ 'copy-mint': [] }>()
</script>
