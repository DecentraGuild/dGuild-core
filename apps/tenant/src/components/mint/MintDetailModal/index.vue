<template>
  <Dialog :open="modelValue" @update:open="(v: boolean) => emit('update:modelValue', v)">
    <DialogContent
      :class="['mint-modal__panel p-0 gap-0 max-h-[90vh]', display?.kind === 'NFT' || display?.kind === 'SPL' ? 'mint-modal__panel--wide' : '']"
      :show-close-button="false"
    >
      <VisuallyHidden>
        <DialogTitle>Mint details</DialogTitle>
        <DialogDescription>Mint metadata, holders, and snapshots</DialogDescription>
      </VisuallyHidden>
      <div v-if="isWatchtower && loading" class="mint-modal__loading">
        <Icon icon="lucide:loader-2" class="mint-modal__spinner" />
        Loading...
      </div>

      <template v-else-if="isWatchtower && error">
        <div class="mint-modal__header">
          <div class="mint-modal__header-text">
            <h3 id="mint-modal-title" class="mint-modal__title">{{ mintAddress ? truncateAddress(mintAddress, 8, 6) : 'Error' }}</h3>
          </div>
          <button type="button" class="mint-modal__close" aria-label="Close" @click="close">
            <Icon icon="lucide:x" />
          </button>
        </div>
        <div class="mint-modal__body">
          <p class="mint-modal__error">{{ error }}</p>
          <p v-if="mintAddress" class="mint-modal__muted">
            <a :href="mintExplorerUrl" target="_blank" rel="noopener" class="mint-modal__link">View on Solscan</a>
          </p>
        </div>
      </template>

      <template v-else-if="display">
        <MintDetailModalHeader
          :display="display"
          :mint-explorer-url="mintExplorerUrl"
          :show-json-toggle="isCatalog"
          :show-json="showJson"
          :copied="copied"
          @toggle-json="showJson = !showJson"
          @copy-mint="copyMint"
          @close="close"
        />

        <div class="mint-modal__body">
          <section v-if="isCatalog && showJson" class="mint-modal__section">
            <pre class="mint-modal__json">{{ jsonPreview }}</pre>
          </section>

          <template v-else>
            <MintDetailModalMetadata
              :display="display"
              :mint-explorer-url="mintExplorerUrl"
              :is-watchtower="isWatchtower"
              :copied="copied"
              @copy-mint="copyMint"
            />
            <MintDetailModalTraitTypes v-if="display.kind === 'NFT'" :display="display" />
            <MintDetailModalHoldersNfts
              v-if="showHoldersAndNftsSection"
              v-model="memberNftView"
              :combined-holders="combinedHolders"
              :holders-updated-at="display.track_holders ? display.holdersUpdatedAt : null"
              :holders-total="isWatchtower ? watchtowerHoldersTotal : undefined"
              :loading="memberNftsLoading"
              :loading-more="holdersLoadingMore"
              :spl-mode="holdersSectionSplMode"
              :format-token-amount="formatHolderAmount"
              :nft-link="nftLink"
              :copied-wallet="copiedWallet"
              :copied-mint="copiedMint"
              :account-url="(addr) => explorerLinks.accountUrl(addr)"
              :token-url="(m) => explorerLinks.tokenUrl(m)"
              @copy="onHoldersCopy"
              @load-more="loadMoreWatchtowerHolders"
            />
            <MintDetailModalSnapshots
              v-if="showSnapshotsSection"
              :snapshots="snapshotsForDisplay"
              :loading="snapshotsLoading"
              :expanded-date="expandedSnapshotDate"
              :holders="holdersForSnapshot"
              :wallets-loading="walletsLoading"
              :copied-wallet="copiedWallet"
              :format-holder-amount="formatHolderAmount"
              :account-url="(addr) => explorerLinks.accountUrl(addr)"
              @toggle="toggleSnapshot"
              @copy-wallet="(w) => copyToClipboard(w, display!.mint, 'owner', w)"
            />
            <section v-if="display.track_transactions" class="mint-modal__section mint-modal__section--bordered">
              <h4 class="mint-modal__section-title">Transactions</h4>
              <p class="mint-modal__muted">Coming soon.</p>
            </section>
            <section v-if="display.tier === 'pro' && isCatalog" class="mint-modal__section mint-modal__section--bordered">
              <h4 class="mint-modal__section-title">Transaction data</h4>
              <p class="mint-modal__muted">Live transaction tracking (Pro) coming soon.</p>
            </section>
            <section v-if="isCatalog" class="mint-modal__section mint-modal__section--bordered">
              <h4 class="mint-modal__section-title">Shipment banner</h4>
              <p class="mint-modal__muted">Optional image URL for the Shipments page card background. Shown when members view their shipments.</p>
              <div class="mint-modal__shipment-banner-row">
                <input
                  v-model="shipmentBannerImage"
                  type="url"
                  class="mint-modal__input"
                  placeholder="https://..."
                />
                <Button
                  variant="brand"
                  size="sm"
                  :disabled="shipmentBannerSaving"
                  @click="saveShipmentBanner"
                >
                  <Icon v-if="shipmentBannerSaving" icon="lucide:loader-2" class="mint-modal__spinner" />
                  Save
                </Button>
              </div>
            </section>
          </template>
        </div>
      </template>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { toRef } from 'vue'
import { Icon } from '@iconify/vue'
import MintDetailModalHeader from './MintDetailModalHeader.vue'
import MintDetailModalMetadata from './MintDetailModalMetadata.vue'
import MintDetailModalTraitTypes from './MintDetailModalTraitTypes.vue'
import MintDetailModalHoldersNfts from './MintDetailModalHoldersNfts.vue'
import MintDetailModalSnapshots from './MintDetailModalSnapshots.vue'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '~/components/ui/dialog'
import { VisuallyHidden } from 'reka-ui'
import { Button } from '~/components/ui/button'
import { useMintDetailModal } from '~/composables/mint/useMintDetailModal'
import type { CatalogMintItem, AddressBookEntry } from '~/types/mints'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    mint?: CatalogMintItem | string | null
    entry?: AddressBookEntry | null
    tenantId?: string
  }>(),
  { mint: null, entry: null, tenantId: '' }
)

const emit = defineEmits<{ 'update:modelValue': [v: boolean]; saved: [] }>()

const {
  display, loading, error, isWatchtower, isCatalog, mintAddress, mintExplorerUrl,
  showJson, copied, expandedSnapshotDate, memberNftView, copiedMint, copiedWallet,
  combinedHolders, showHoldersAndNftsSection, holdersSectionSplMode, memberNftsLoading, nftLink,
  snapshotsForDisplay, snapshotsLoading, holdersForSnapshot, walletsLoading, showSnapshotsSection,
  holdersLoadingMore, watchtowerHoldersTotal, loadMoreWatchtowerHolders,
  shipmentBannerImage, shipmentBannerSaving, jsonPreview,
  close, copyMint, copyToClipboard, onHoldersCopy, formatHolderAmount, toggleSnapshot, saveShipmentBanner,
  explorerLinks, truncateAddress,
} = useMintDetailModal(
  {
    modelValue: toRef(props, 'modelValue'),
    mint: toRef(props, 'mint'),
    entry: toRef(props, 'entry'),
    tenantId: toRef(props, 'tenantId'),
  },
  emit,
)
</script>

<style src="./MintDetailModal.css"></style>
