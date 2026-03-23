<template>
  <Dialog :open="modelValue" @update:open="(v: boolean) => emit('update:modelValue', v)">
    <DialogContent :class="['escrow-modal gap-0 max-h-[90vh] overflow-y-auto sm:max-w-[42rem]']" :show-close-button="false">
      <EscrowDetailHeader
        :is-maker="isMaker"
        :escrow="detailEscrow"
        @copy-share-link="detail.copyShareLinkAndNotify"
        @close="close"
      />
      <StatusBanner
        v-if="detailRpcError && !detail.apiAvailable"
        variant="error"
        :message="detailRpcError"
      >
        <template #hint>
          <p class="escrow-modal__rpc-hint">Set NUXT_PUBLIC_HELIUS_RPC in your environment.</p>
        </template>
      </StatusBanner>
      <StatusBanner
        v-else-if="detailLoading"
        variant="loading"
        message="Loading escrow..."
      />
      <StatusBanner
        v-else-if="!detailEscrow"
        variant="empty"
        message="Escrow not found."
      />
      <template v-else>
        <StatusBanner
          v-if="detailRpcError && detail.apiAvailable && (isMaker || detail.canFill)"
          variant="info"
          message="To fill or cancel, add NUXT_PUBLIC_HELIUS_RPC to your .env. Viewing works without it."
        />
        <div class="escrow-modal__body">
          <section v-if="isMaker" class="escrow-modal__owner">
            <section class="escrow-modal__details">
              <button
                type="button"
                class="escrow-modal__details-toggle"
                :aria-expanded="unref(detail.ownerFillOpen)"
                @click="detail.toggleOwnerFillOpen"
              >
                <span>Fill trade</span>
                <Icon :icon="unref(detail.ownerFillOpen) ? 'lucide:chevron-up' : 'lucide:chevron-down'" />
              </button>
              <div v-show="unref(detail.ownerFillOpen)" class="escrow-modal__details-content">
                <div v-if="!detailDisplay" class="escrow-modal__fill-loading">Loading trade details...</div>
                <EscrowDetailTradeFlow
                  v-else
                  :escrow="detailEscrow!"
                  :display="detailDisplay"
                  :show-amount-controls="false"
                  :show-fill-actions="false"
                  :wallet-address="unref(detail.walletAddress)"
                  :can-fill="unref(detail.canFill)"
                  :can-sign-transactions="unref(detail.canSignTransactions)"
                  :insufficient-balance="unref(detail.insufficientBalance)"
                  :filling="unref(detail.filling)"
                  :fill-percent="unref(detail.fillPercent)"
                  :fill-amount-input="unref(detail.fillAmountInput)"
                  :ratio-flipped="unref(detail.ratioFlipped)"
                  :chain-price="unref(detail.chainPrice)"
                  :deposit-symbol-display="unref(detail.depositSymbolDisplay)"
                  :price-symbol-display="unref(detail.priceSymbolDisplay)"
                  :deposit-name-display="unref(detail.depositNameDisplay)"
                  :request-name-display="unref(detail.requestNameDisplay)"
                  :fill-request-amount-display="unref(detail.fillRequestAmountDisplay)"
                  :fill-deposit-amount-display="unref(detail.fillDepositAmountDisplay)"
                  :request-token-balance="unref(detail.requestTokenBalance)"
                  cannot-fill-reason=""
                  @update:fill-percent="detail.setFillPercent"
                  @fill-amount-input="detail.onFillAmountInput"
                  @focus-amount-input="detail.onFocusAmountInput"
                  @toggle-ratio="detail.toggleRatio"
                />
              </div>
            </section>
            <EscrowDetailActions
              :cancelling="unref(detail.cancelling)"
              @cancel="() => detail.handleCancel(close)"
            />
            <h3 class="escrow-modal__section-title">Details</h3>
            <EscrowDetailMetadata
              :escrow="detailEscrow!"
              :escrow-id="props.escrowId"
              :display="detailDisplay"
              :is-public-recipient="unref(detail.isPublicRecipient)"
              :expire-label="unref(detail.expireLabel)"
              :share-url-value="unref(detail.shareUrlValue)"
              :share-qr-data-url="unref(detail.shareQrDataUrl)"
              :show-qr-and-link="true"
              :truncate-address="detail.truncateAddress"
              :explorer-links="unref(detail.explorerLinks)"
              :copy-to-clipboard="detail.copyToClipboard"
              @copy-share-link="detail.copyShareLinkAndNotify"
            />
          </section>

          <section v-if="!isMaker" class="escrow-modal__fill">
            <h3 class="escrow-modal__section-title">Fill trade</h3>
            <p v-if="props.fillDisabled" class="escrow-modal__fill-winding-down">
              Marketplace is winding down; only cancel is allowed.
            </p>
            <p v-else-if="!detailDisplay" class="escrow-modal__fill-loading">Loading trade details...</p>
            <EscrowDetailTradeFlow
              v-else
              :escrow="detailEscrow!"
              :display="detailDisplay"
              :show-amount-controls="true"
              :show-fill-actions="true"
              :wallet-address="unref(detail.walletAddress)"
              :can-fill="unref(detail.canFill)"
              :can-sign-transactions="unref(detail.canSignTransactions)"
              :insufficient-balance="unref(detail.insufficientBalance)"
              :filling="unref(detail.filling)"
              :fill-percent="unref(detail.fillPercent)"
              :fill-amount-input="unref(detail.fillAmountInput)"
              :ratio-flipped="unref(detail.ratioFlipped)"
              :chain-price="unref(detail.chainPrice)"
              :deposit-symbol-display="unref(detail.depositSymbolDisplay)"
              :price-symbol-display="unref(detail.priceSymbolDisplay)"
              :deposit-name-display="unref(detail.depositNameDisplay)"
              :request-name-display="unref(detail.requestNameDisplay)"
              :fill-request-amount-display="unref(detail.fillRequestAmountDisplay)"
              :fill-deposit-amount-display="unref(detail.fillDepositAmountDisplay)"
              :request-token-balance="unref(detail.requestTokenBalance)"
              :cannot-fill-reason="cannotFillReason"
              @update:fill-percent="detail.setFillPercent"
              @fill-amount-input="detail.onFillAmountInput"
              @focus-amount-input="detail.onFocusAmountInput"
              @toggle-ratio="detail.toggleRatio"
              @fill="detail.handleFill(close)"
              @connect-wallet="auth.openConnectModal()"
            />
          </section>

          <section v-if="!isMaker" class="escrow-modal__details">
            <button
              type="button"
              class="escrow-modal__details-toggle"
              :aria-expanded="unref(detail.detailsOpen)"
              @click="detail.toggleDetailsOpen"
            >
              <span>Details</span>
              <Icon :icon="unref(detail.detailsOpen) ? 'lucide:chevron-up' : 'lucide:chevron-down'" />
            </button>
            <div v-show="unref(detail.detailsOpen)" class="escrow-modal__details-content">
              <EscrowDetailMetadata
                :escrow="detailEscrow!"
                :escrow-id="props.escrowId"
                :display="detailDisplay"
                :is-public-recipient="unref(detail.isPublicRecipient)"
                :expire-label="unref(detail.expireLabel)"
                :share-url-value="unref(detail.shareUrlValue)"
                :share-qr-data-url="unref(detail.shareQrDataUrl)"
                :show-qr-and-link="true"
                :truncate-address="detail.truncateAddress"
                :explorer-links="unref(detail.explorerLinks)"
                :copy-to-clipboard="detail.copyToClipboard"
                @copy-share-link="detail.copyShareLinkAndNotify"
              />
            </div>
          </section>
        </div>
      </template>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, toRef, unref } from 'vue'
import { Icon } from '@iconify/vue'
import StatusBanner from '~/components/ui/status-banner/StatusBanner.vue'
import { useAuth } from '@decentraguild/auth'
import EscrowDetailHeader from './EscrowDetailHeader.vue'
import EscrowDetailMetadata from './EscrowDetailMetadata.vue'
import EscrowDetailActions from './EscrowDetailActions.vue'
import EscrowDetailTradeFlow from './EscrowDetailTradeFlow.vue'
import { Dialog, DialogContent } from '~/components/ui/dialog'
import { useEscrowDetail } from '../composables/useEscrowDetail'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    escrowId: string | null
    fillDisabled?: boolean
  }>(),
  { fillDisabled: false }
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const auth = useAuth()

const detail = useEscrowDetail({
  escrowId: toRef(props, 'escrowId'),
  fillDisabled: toRef(props, 'fillDisabled'),
  modelValue: toRef(props, 'modelValue'),
})

const detailLoading = computed(() => detail.loading.value)
const detailEscrow = computed(() => detail.escrow.value)
const detailDisplay = computed(() => detail.display.value)
const detailRpcError = computed(() => detail.rpcError.value ?? null)

const isMaker = computed(() => !!unref(detail.isMaker))

function close() {
  emit('update:modelValue', false)
}

const cannotFillReason = computed(() => {
  if (!detail.escrow.value) return ''
  if (detail.escrow.value.account.onlyWhitelist && detail.isOnEscrowWhitelist.value !== true) {
    return 'Only whitelisted members can fill this trade.'
  }
  return 'You cannot fill this trade (restrictions or expired).'
})
</script>

<style scoped>
.escrow-modal {
  background: var(--theme-bg-primary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  box-shadow: var(--theme-shadow-card);
  --escrow-modal-width: 42rem;
  max-width: min(90vw, var(--escrow-modal-width));
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  padding: var(--theme-space-xl);
}
</style>

<style>
.escrow-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--theme-space-lg);
  padding-bottom: var(--theme-space-md);
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.escrow-modal__title {
  margin: 0;
  font-size: var(--theme-font-xl);
  font-weight: 600;
  color: var(--theme-text-primary);
}

.escrow-modal__header-actions {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
}

.escrow-modal__icon-btn {
  padding: var(--theme-space-xs);
  background: none;
  border: none;
  color: var(--theme-text-secondary);
  cursor: pointer;
  font-size: 1.25rem;
}

.escrow-modal__icon-btn:hover {
  color: var(--theme-text-primary);
}

.escrow-modal__close {
  padding: var(--theme-space-xs);
  background: none;
  border: none;
  color: var(--theme-text-secondary);
  cursor: pointer;
  font-size: 1.25rem;
}

.escrow-modal__close:hover {
  color: var(--theme-text-primary);
}

.escrow-modal__rpc-hint {
  margin-top: var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  opacity: 0.9;
}

.escrow-modal__body {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-lg);
}

.escrow-modal__owner {
  background: var(--theme-bg-card);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  padding: var(--theme-space-lg);
}

.escrow-modal__section-title {
  margin-top: 0;
}

.escrow-modal__owner .escrow-modal__section-title {
  margin-top: var(--theme-space-lg);
}

.escrow-modal__owner .escrow-modal__section-title:first-child {
  margin-top: 0;
}

.escrow-modal__details-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--theme-space-lg);
  align-items: start;
}

@media (max-width: 479px) {
  .escrow-modal__details-cols {
    grid-template-columns: 1fr;
  }
}

.escrow-modal__details-col-left {
  min-width: 0;
}

.escrow-modal__token-preview {
  display: flex;
  align-items: center;
  gap: var(--theme-space-md);
  margin-bottom: var(--theme-space-lg);
  padding: var(--theme-space-md);
  background: var(--theme-bg-secondary);
  border-radius: var(--theme-radius-md);
}

.escrow-modal__token-preview-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--theme-space-xs);
}

.escrow-modal__token-img {
  width: 3rem;
  height: 3rem;
  object-fit: cover;
  border-radius: var(--theme-radius-sm);
}

.escrow-modal__token-placeholder {
  width: 3rem;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--theme-bg-muted);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-muted);
  font-size: 1.25rem;
}

.escrow-modal__token-label {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  max-width: 6rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.escrow-modal__token-arrow {
  color: var(--theme-text-muted);
  flex-shrink: 0;
}

.escrow-modal__details-col-right {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.escrow-modal__owner-qr {
  display: flex;
  justify-content: center;
  padding: var(--theme-space-md);
  background: var(--theme-bg-secondary);
  border-radius: var(--theme-radius-md);
}

.escrow-modal__owner-qr-img {
  width: 200px;
  height: 200px;
  display: block;
}

.escrow-modal__owner-link-row {
  display: flex;
  gap: var(--theme-space-sm);
  align-items: center;
}

.escrow-modal__owner-input {
  flex: 1;
  min-width: 0;
  padding: var(--theme-space-sm) var(--theme-space-md);
  font-size: var(--theme-font-sm);
  font-family: ui-monospace, monospace;
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-primary);
}

.escrow-modal__owner-copy {
  flex-shrink: 0;
  padding: var(--theme-space-sm) var(--theme-space-md);
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-secondary);
  cursor: pointer;
}

.escrow-modal__owner-copy:hover {
  color: var(--theme-text-primary);
  border-color: var(--theme-primary);
}

.escrow-modal__details-list--rest {
  margin: 0;
}

.escrow-modal__owner-actions {
  margin-top: var(--theme-space-md);
  margin-bottom: 0;
}

.escrow-modal__fill {
  background: var(--theme-bg-card);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  padding: var(--theme-space-lg);
}

.escrow-modal__fill-loading,
.escrow-modal__fill-winding-down {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.escrow-modal__fill-winding-down {
  padding: var(--theme-space-sm);
  background: var(--theme-status-warning, #ecc94b);
  color: var(--theme-text-primary);
}

.escrow-modal__fill-amount-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--theme-space-xs);
}

.escrow-modal__label {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.escrow-modal__balance-inline {
  display: flex;
  align-items: baseline;
  gap: var(--theme-space-xs);
  font-size: var(--theme-font-sm);
}

.escrow-modal__balance-label {
  color: var(--theme-text-muted);
}

.escrow-modal__balance-placeholder {
  color: var(--theme-text-muted);
}

.escrow-modal__slider-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-md);
  margin-bottom: var(--theme-space-sm);
}

.escrow-modal__range {
  flex: 1;
  height: 0.5rem;
  accent-color: var(--theme-primary);
  cursor: pointer;
}

.escrow-modal__range:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.escrow-modal__slider-value {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  color: var(--theme-text-primary);
  min-width: 2.5rem;
}

.escrow-modal__fill-amount-input-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  margin-top: var(--theme-space-sm);
}

.escrow-modal__fill-amount-input {
  width: 8rem;
  padding: var(--theme-space-sm) var(--theme-space-md);
  font-size: var(--theme-font-sm);
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-primary);
}

.escrow-modal__fill-amount-input:focus {
  outline: none;
  border-color: var(--theme-primary);
}

.escrow-modal__fill-amount-token {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.escrow-modal__rate {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  margin-bottom: var(--theme-space-md);
}

.escrow-modal__rate-label {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  flex-shrink: 0;
}

.escrow-modal__rate-value {
  display: inline-flex;
  align-items: center;
  gap: var(--theme-space-xs);
  padding: var(--theme-space-xs) var(--theme-space-sm);
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-primary);
  font-size: var(--theme-font-sm);
  cursor: pointer;
}

.escrow-modal__rate-value:hover {
  border-color: var(--theme-primary);
}

.escrow-modal__rate-approx {
  color: var(--theme-text-muted);
  margin: 0 var(--theme-space-xs);
}

.escrow-modal__rate-icon {
  font-size: 1rem;
  color: var(--theme-text-muted);
}

.escrow-modal__insufficient {
  margin: 0 auto var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
  text-align: center;
  width: 30%;
}

.escrow-modal__fill-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: var(--theme-space-md);
}

.escrow-modal__fill-btn {
  width: 30%;
  min-width: 8rem;
}

.escrow-modal__cannot-fill {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  text-align: center;
  width: 30%;
}

.escrow-modal__pay-receive {
  background: var(--theme-bg-secondary);
  border-radius: var(--theme-radius-sm);
  padding: var(--theme-space-md);
  margin-bottom: var(--theme-space-md);
}

.escrow-modal__pay-receive-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: var(--theme-font-sm);
}

.escrow-modal__pay-receive-row + .escrow-modal__pay-receive-row {
  margin-top: var(--theme-space-xs);
}

.escrow-modal__pay-receive-label {
  color: var(--theme-text-secondary);
}

.escrow-modal__pay-receive-value {
  font-weight: 600;
  color: var(--theme-text-primary);
}

.escrow-modal__pay-receive-token {
  font-weight: 400;
  color: var(--theme-text-muted);
  margin-left: var(--theme-space-xs);
}

.escrow-modal__details {
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  overflow: hidden;
}

.escrow-modal__details-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--theme-space-md) var(--theme-space-lg);
  background: var(--theme-bg-secondary);
  border: none;
  color: var(--theme-text-primary);
  font-size: var(--theme-font-sm);
  font-weight: 500;
  cursor: pointer;
}

.escrow-modal__details-toggle:hover {
  background: var(--theme-bg-card);
}

.escrow-modal__details-content {
  padding: var(--theme-space-lg);
  background: var(--theme-bg-primary);
}

.escrow-modal__details-list {
  margin: 0;
  font-size: var(--theme-font-sm);
}

.escrow-modal__details-list dt {
  margin-top: var(--theme-space-sm);
  color: var(--theme-text-muted);
  font-weight: 500;
}

.escrow-modal__details-list dt:first-child {
  margin-top: 0;
}

.escrow-modal__details-list dd {
  margin: var(--theme-space-xs) 0 0;
  color: var(--theme-text-primary);
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
}

.escrow-modal__details-list code {
  font-family: ui-monospace, monospace;
  font-size: var(--theme-font-xs);
}

.escrow-modal__link {
  color: var(--theme-primary);
  padding: var(--theme-space-xs);
}

.escrow-modal__link:hover {
  color: var(--theme-primary-hover);
}

.escrow-modal__copy {
  padding: var(--theme-space-xs);
  background: none;
  border: none;
  color: var(--theme-text-secondary);
  cursor: pointer;
}

.escrow-modal__copy:hover {
  color: var(--theme-text-primary);
}
</style>
