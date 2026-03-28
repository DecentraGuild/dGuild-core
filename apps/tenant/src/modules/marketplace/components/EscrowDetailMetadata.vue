<template>
  <div class="escrow-modal__details-cols">
    <div class="escrow-modal__details-col-left">
      <div v-if="display" class="escrow-modal__token-preview">
        <div class="escrow-modal__token-preview-item">
          <img v-if="display.depositImage" :src="display.depositImage" :alt="display.depositName ?? 'Deposit'" class="escrow-modal__token-img">
          <div v-else class="escrow-modal__token-placeholder"><Icon icon="lucide:coins" /></div>
          <span class="escrow-modal__token-label">{{ display.depositName ?? display.depositSymbol ?? 'Deposit' }}</span>
        </div>
        <Icon icon="lucide:arrow-right" class="escrow-modal__token-arrow" />
        <div class="escrow-modal__token-preview-item">
          <img v-if="display.requestImage" :src="display.requestImage" :alt="display.requestName ?? 'Request'" class="escrow-modal__token-img">
          <div v-else class="escrow-modal__token-placeholder"><Icon icon="lucide:image" /></div>
          <span class="escrow-modal__token-label">{{ display.requestName ?? display.priceSymbol ?? 'Request' }}</span>
        </div>
      </div>
      <dl class="escrow-modal__details-list">
        <dt>Escrow</dt>
        <dd>
          <code>{{ walletLabel(escrowId ?? '', 8, 8) }}</code>
          <a
            v-if="escrowId"
            :href="explorerLinks.accountUrl(escrowId)"
            target="_blank"
            rel="noopener"
            class="escrow-modal__link"
            title="View on Solscan"
          >
            <Icon icon="lucide:external-link" />
          </a>
          <button type="button" class="escrow-modal__copy" aria-label="Copy escrow address" @click="copyToClipboard(escrowId ?? '', 'Escrow address')">
            <Icon icon="lucide:copy" />
          </button>
        </dd>
        <dt>Maker</dt>
        <dd>
          <code>{{ walletLabel(escrow.account.maker.toBase58(), 8, 8) }}</code>
          <a :href="explorerLinks.accountUrl(escrow.account.maker.toBase58())" target="_blank" rel="noopener" class="escrow-modal__link" title="View on Solscan"><Icon icon="lucide:external-link" /></a>
          <button type="button" class="escrow-modal__copy" aria-label="Copy maker address" @click="copyToClipboard(escrow.account.maker.toBase58(), 'Maker address')"><Icon icon="lucide:copy" /></button>
        </dd>
        <dt>Deposit token</dt>
        <dd>
          <code>{{ walletLabel(escrow.account.depositToken.toBase58(), 8, 8) }}</code>
          <a :href="explorerLinks.tokenUrl(escrow.account.depositToken.toBase58())" target="_blank" rel="noopener" class="escrow-modal__link" title="View on Solscan"><Icon icon="lucide:external-link" /></a>
          <button type="button" class="escrow-modal__copy" aria-label="Copy mint" @click="copyToClipboard(escrow.account.depositToken.toBase58(), 'Deposit token mint')"><Icon icon="lucide:copy" /></button>
        </dd>
        <dt>Request token</dt>
        <dd>
          <code>{{ walletLabel(escrow.account.requestToken.toBase58(), 8, 8) }}</code>
          <a :href="explorerLinks.tokenUrl(escrow.account.requestToken.toBase58())" target="_blank" rel="noopener" class="escrow-modal__link" title="View on Solscan"><Icon icon="lucide:external-link" /></a>
          <button type="button" class="escrow-modal__copy" aria-label="Copy mint" @click="copyToClipboard(escrow.account.requestToken.toBase58(), 'Request token mint')"><Icon icon="lucide:copy" /></button>
        </dd>
        <dt>Price (chain)</dt>
        <dd><code>{{ priceDisplay }}</code></dd>
        <dt>Remaining (deposit)</dt>
        <dd>
          <TokenAmountWithLabel v-if="display" :amount="display.depositAmount" :decimals="display.depositDecimals" :symbol="display.depositSymbol" :name="display.depositName" :mint="escrow.account.depositToken.toBase58()" :show-mint-short="false" />
        </dd>
        <dt>Recipient</dt>
        <dd>{{ isPublicRecipient ? 'Any wallet' : walletLabel(escrow.account.recipient.toBase58(), 8, 8) }}</dd>
      </dl>
    </div>
    <div v-if="showQrAndLink" class="escrow-modal__details-col-right">
      <div v-if="shareUrlValue" class="escrow-modal__owner-qr">
        <img v-if="shareQrDataUrl" :src="shareQrDataUrl" alt="QR code" class="escrow-modal__owner-qr-img">
      </div>
      <div class="escrow-modal__owner-link-row">
        <input :value="shareUrlValue" type="text" readonly class="escrow-modal__owner-input">
        <button type="button" class="escrow-modal__owner-copy" aria-label="Copy link" @click="$emit('copyShareLink')">
          <Icon icon="lucide:copy" />
        </button>
      </div>
      <dl class="escrow-modal__details-list escrow-modal__details-list--rest">
        <dt>Whitelist only</dt>
        <dd>{{ escrow.account.onlyWhitelist ? 'Yes' : 'No' }}</dd>
        <dt>Partial fill</dt>
        <dd>{{ escrow.account.allowPartialFill ? 'Yes' : 'No' }}</dd>
        <dt>Expires</dt>
        <dd>{{ expireLabel }}</dd>
      </dl>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { formatUiAmount } from '@decentraguild/display'
import type { EscrowWithAddress } from '@decentraguild/web3'
import type { EscrowDisplayData } from '~/composables/marketplace/useEscrowDisplay'

const props = defineProps<{
  escrow: EscrowWithAddress
  escrowId: string | null
  display: EscrowDisplayData | null
  isPublicRecipient: boolean
  expireLabel: string
  shareUrlValue: string
  shareQrDataUrl: string
  showQrAndLink?: boolean
  walletLabel: (addr: string, a: number, b: number) => string
  explorerLinks: { accountUrl: (a: string) => string; tokenUrl: (a: string) => string }
  copyToClipboard: (text: string, label: string) => void
}>()

const priceDisplay = computed(() => {
  const p = props.display?.pricePerUnit
  if (p != null && Number.isFinite(p)) return formatUiAmount(p, 6)
  const raw = props.escrow?.account?.price
  if (raw != null && typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  return '–'
})

defineEmits<{
  copyShareLink: []
}>()
</script>
