<template>
  <section class="mint-modal__section mint-modal__section--bordered">
    <div class="mint-modal__section-header">
      <h4 class="mint-modal__section-title">{{ splMode ? 'Holders' : 'Holders & NFTs' }}</h4>
      <div v-if="!splMode" class="mint-modal__view-toggle">
        <button
          type="button"
          class="mint-modal__view-btn"
          :class="{ 'mint-modal__view-btn--active': modelValue === 'list' }"
          aria-label="List view"
          @click="$emit('update:modelValue', 'list')"
        >
          <Icon icon="lucide:list" />
        </button>
        <button
          type="button"
          class="mint-modal__view-btn"
          :class="{ 'mint-modal__view-btn--active': modelValue === 'card' }"
          aria-label="Card view"
          @click="$emit('update:modelValue', 'card')"
        >
          <Icon icon="lucide:layout-grid" />
        </button>
      </div>
    </div>
    <p v-if="holdersUpdatedAt" class="mint-modal__muted">Updated {{ formatDate(holdersUpdatedAt) }}</p>
    <div v-if="loading && !combinedHolders.length" class="mint-modal__loading">
      <Icon icon="lucide:loader-2" class="mint-modal__spinner" />
      Loading...
    </div>
    <div v-else-if="!combinedHolders.length" class="mint-modal__empty">
      {{ splMode ? 'No holders yet. Enable Holders tracking in Watchtower.' : 'No holders or member NFTs yet. Add the collection in Address Book and enable Holders tracking.' }}
    </div>
    <div v-else-if="splMode" class="mint-modal__nft-list mint-modal__nft-list--spl">
      <div class="mint-modal__nft-list-header mint-modal__nft-list-header--spl">
        <span class="mint-modal__nft-list-col mint-modal__nft-list-col--holder">Holder</span>
        <span class="mint-modal__nft-list-col mint-modal__nft-list-col--count">Balance</span>
      </div>
      <div
        v-for="h in combinedHolders"
        :key="h.wallet"
        class="mint-modal__nft-list-row mint-modal__nft-list-row--spl"
      >
        <div class="mint-modal__nft-list-col mint-modal__nft-list-col--holder">
          <span class="mint-modal__nft-list-value">{{ truncateAddress(h.wallet, 8, 4) }}</span>
          <button
            type="button"
            class="mint-modal__icon-btn mint-modal__icon-btn--sm"
            :class="{ 'mint-modal__icon-btn--success': copiedWallet === h.wallet }"
            :title="copiedWallet === h.wallet ? 'Copied' : 'Copy wallet'"
            @click.stop="onCopy(h.wallet, 'owner', h.wallet)"
          >
            <Icon :icon="copiedWallet === h.wallet ? 'lucide:check' : 'lucide:copy'" />
          </button>
          <a :href="accountUrl(h.wallet)" target="_blank" rel="noopener" class="mint-modal__icon-btn mint-modal__icon-btn--sm" title="Solscan">
            <Icon icon="lucide:external-link" />
          </a>
        </div>
        <div class="mint-modal__nft-list-col mint-modal__nft-list-col--count">
          <span class="mint-modal__holder-amount">{{ formatTokenAmount(h.splAmount ?? '0') }}</span>
        </div>
      </div>
    </div>
    <div v-else-if="modelValue === 'list'" class="mint-modal__nft-list">
      <div class="mint-modal__nft-list-header">
        <span class="mint-modal__nft-list-col mint-modal__nft-list-col--holder">Holder</span>
        <span class="mint-modal__nft-list-col mint-modal__nft-list-col--count">Count</span>
        <span class="mint-modal__nft-list-col mint-modal__nft-list-col--name">NFTs</span>
      </div>
      <div
        v-for="h in combinedHolders"
        :key="h.wallet"
        class="mint-modal__nft-list-row"
      >
        <div class="mint-modal__nft-list-col mint-modal__nft-list-col--holder">
          <span class="mint-modal__nft-list-value">{{ truncateAddress(h.wallet, 8, 4) }}</span>
          <button
            type="button"
            class="mint-modal__icon-btn mint-modal__icon-btn--sm"
            :class="{ 'mint-modal__icon-btn--success': copiedWallet === h.wallet }"
            :title="copiedWallet === h.wallet ? 'Copied' : 'Copy wallet'"
            @click.stop="onCopy(h.wallet, 'owner', h.wallet)"
          >
            <Icon :icon="copiedWallet === h.wallet ? 'lucide:check' : 'lucide:copy'" />
          </button>
          <a :href="accountUrl(h.wallet)" target="_blank" rel="noopener" class="mint-modal__icon-btn mint-modal__icon-btn--sm" title="Solscan">
            <Icon icon="lucide:external-link" />
          </a>
        </div>
        <div class="mint-modal__nft-list-col mint-modal__nft-list-col--count">
          <span class="mint-modal__holder-amount">{{ h.count }}</span>
        </div>
        <div class="mint-modal__nft-list-col mint-modal__nft-list-col--name mint-modal__nft-list-col--nfts">
          <template v-if="h.nfts.length">
            <span
              v-for="nft in h.nfts"
              :key="nft.mint"
              class="mint-modal__nft-inline"
            >
              <a :href="tokenUrl(nft.mint)" target="_blank" rel="noopener" class="mint-modal__link">
                {{ nft.name ?? truncateAddress(nft.mint, 6, 4) }}
              </a>
              <button
                type="button"
                class="mint-modal__icon-btn mint-modal__icon-btn--sm"
                :class="{ 'mint-modal__icon-btn--success': copiedMint === nft.mint }"
                :title="copiedMint === nft.mint ? 'Copied' : 'Copy mint'"
                @click.stop="onCopy(nft.mint, 'mint')"
              >
                <Icon :icon="copiedMint === nft.mint ? 'lucide:check' : 'lucide:copy'" />
              </button>
            </span>
          </template>
          <span v-else class="mint-modal__muted">—</span>
        </div>
      </div>
    </div>
    <div v-else class="mint-modal__nft-grid">
      <template v-for="h in combinedHolders" :key="h.wallet">
        <component
          :is="nftLink ? 'a' : 'div'"
          v-for="nft in h.nfts"
          :key="nft.mint"
          :href="nftLink ? tokenUrl(nft.mint) : undefined"
          :target="nftLink ? '_blank' : undefined"
          :rel="nftLink ? 'noopener' : undefined"
          class="mint-modal__nft-card"
        >
          <div class="mint-modal__nft-media">
            <img v-if="nft.image" :src="nft.image" :alt="nft.name ?? nft.mint" />
            <div v-else class="mint-modal__nft-placeholder">
              <Icon icon="lucide:image-off" />
            </div>
          </div>
          <div class="mint-modal__nft-info">
            <p class="mint-modal__nft-name">{{ nft.name ?? truncateAddress(nft.mint, 8, 6) }}</p>
            <p class="mint-modal__nft-mint">{{ truncateAddress(h.wallet, 6, 4) }}</p>
            <div v-if="(nft.traits?.length ?? 0) > 0" class="mint-modal__nft-traits">
              <span
                v-for="(attr, idx) in (nft.traits ?? []).slice(0, 2)"
                :key="idx"
                class="mint-modal__nft-trait"
              >
                {{ attr.trait_type ?? attr.traitType }}: {{ attr.value }}
              </span>
            </div>
          </div>
        </component>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { formatDate, truncateAddress } from '@decentraguild/display'

interface HolderNft {
  mint: string
  name: string | null
  image: string | null
  traits: Array<{ trait_type?: string; traitType?: string; value?: string | number }>
  owner?: string | null
}

interface CombinedHolder {
  wallet: string
  count: number
  nfts: HolderNft[]
  splAmount?: string
}

defineProps<{
  combinedHolders: CombinedHolder[]
  holdersUpdatedAt?: string | null
  loading?: boolean
  modelValue: 'list' | 'card'
  splMode?: boolean
  formatTokenAmount?: (raw: string) => string
  nftLink?: boolean
  copiedWallet?: string | null
  copiedMint?: string | null
  accountUrl: (addr: string) => string
  tokenUrl: (mint: string) => string
}>()

const emit = defineEmits<{
  'update:modelValue': [v: 'list' | 'card']
  copy: [text: string, field: 'owner' | 'mint', wallet?: string]
}>()

function onCopy(text: string, field: 'owner' | 'mint', wallet?: string) {
  emit('copy', text, field, wallet)
}
</script>
