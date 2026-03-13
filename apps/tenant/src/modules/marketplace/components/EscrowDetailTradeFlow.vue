<template>
  <div class="escrow-modal__fill-content">
    <div class="escrow-modal__rate">
      <span class="escrow-modal__rate-label">Rate</span>
      <button
        type="button"
        class="escrow-modal__rate-value"
        :title="ratioFlipped ? 'Show 1 deposit per X request' : 'Show 1 request per X deposit'"
        @click="$emit('toggleRatio')"
      >
        <template v-if="!ratioFlipped">
          1 {{ depositSymbolDisplay }}
          <span class="escrow-modal__rate-approx">≈</span>
          {{ chainPriceFormatted }}
          {{ priceSymbolDisplay }}
        </template>
        <template v-else>
          1 {{ priceSymbolDisplay }}
          <span class="escrow-modal__rate-approx">≈</span>
          {{ chainPriceInvertedFormatted }}
          {{ depositSymbolDisplay }}
        </template>
        <Icon icon="lucide:arrow-left-right" class="escrow-modal__rate-icon" />
      </button>
    </div>
    <div v-if="showAmountControls" class="escrow-modal__fill-amount">
      <div class="escrow-modal__fill-amount-header">
        <label class="escrow-modal__label">Amount to fill</label>
        <div class="escrow-modal__balance-inline">
          <span class="escrow-modal__balance-label">Balance</span>
          <template v-if="walletAddress">
            <TokenAmountWithLabel
              :amount="requestTokenBalance"
              :decimals="display.requestDecimals"
              :symbol="display.priceSymbol"
              :name="display.requestName"
              :mint="escrow.account.requestToken.toBase58()"
              :show-mint-short="false"
            />
          </template>
          <span v-else class="escrow-modal__balance-placeholder">Connect to see</span>
        </div>
      </div>
      <div class="escrow-modal__slider-row">
        <input
          :model-value="fillPercent"
          type="range"
          min="0"
          max="100"
          step="1"
          class="escrow-modal__range"
          :disabled="!escrow.account.allowPartialFill || !walletAddress"
          @input="$emit('update:fillPercent', Number(($event.target as HTMLInputElement).value))"
        >
        <span class="escrow-modal__slider-value">{{ fillPercent }}%</span>
      </div>
      <div class="escrow-modal__fill-amount-input-row">
        <input
          :value="fillAmountInput"
          type="text"
          inputmode="decimal"
          class="escrow-modal__fill-amount-input"
          :disabled="!escrow.account.allowPartialFill || !walletAddress"
          @input="$emit('fillAmountInput', ($event.target as HTMLInputElement).value)"
          @focus="$emit('focusAmountInput', true)"
          @blur="$emit('focusAmountInput', false)"
        >
        <span class="escrow-modal__fill-amount-token">
          ({{ depositSymbolDisplay }}) {{ depositNameDisplaySafe }}
        </span>
      </div>
    </div>
    <div class="escrow-modal__pay-receive">
      <div class="escrow-modal__pay-receive-row">
        <span class="escrow-modal__pay-receive-label">You pay</span>
        <span class="escrow-modal__pay-receive-value">
          {{ fillRequestAmountDisplay }}
          <span class="escrow-modal__pay-receive-token">({{ priceSymbolDisplay }}) {{ requestNameDisplaySafe }}</span>
        </span>
      </div>
      <div class="escrow-modal__pay-receive-row">
        <span class="escrow-modal__pay-receive-label">You receive</span>
        <span class="escrow-modal__pay-receive-value">
          {{ fillDepositAmountDisplay }}
          <span class="escrow-modal__pay-receive-token">({{ depositSymbolDisplay }}) {{ depositNameDisplaySafe }}</span>
        </span>
      </div>
    </div>
    <div v-if="showFillActions" class="escrow-modal__fill-actions">
      <Button
        v-if="walletAddress && canFill && canSignTransactions"
        variant="default"
        class="escrow-modal__fill-btn"
        :disabled="filling || insufficientBalance"
        @click="$emit('fill')"
      >
        {{ filling ? 'Processing...' : 'Fill' }}
      </Button>
      <template v-else-if="walletAddress && canFill && !canSignTransactions">
        <p class="escrow-modal__cannot-fill">
          Your wallet does not support signing transactions. Try another wallet.
        </p>
        <Button variant="default" class="escrow-modal__fill-btn" @click="$emit('connectWallet')">
          Change wallet
        </Button>
      </template>
      <p v-else-if="walletAddress && !canFill" class="escrow-modal__cannot-fill">
        {{ cannotFillReason }}
      </p>
      <Button v-else variant="default" class="escrow-modal__fill-btn" @click="$emit('connectWallet')">
        Connect wallet
      </Button>
    </div>
    <div v-if="walletAddress && insufficientBalance" class="escrow-modal__insufficient">
      Insufficient balance to fill this amount.
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { formatUiAmount, sanitizeTokenLabel } from '@decentraguild/display'
import { Button } from '~/components/ui/button'
import type { EscrowWithAddress } from '@decentraguild/web3'
import type { EscrowDisplayData } from '~/composables/marketplace/useEscrowDisplay'

const props = defineProps<{
  escrow: EscrowWithAddress
  display: EscrowDisplayData
  showAmountControls: boolean
  showFillActions: boolean
  walletAddress: string | null
  canFill: boolean
  canSignTransactions: boolean
  insufficientBalance: boolean
  filling: boolean
  fillPercent: number
  fillAmountInput: string
  ratioFlipped: boolean
  chainPrice: number
  depositSymbolDisplay: string
  priceSymbolDisplay: string
  depositNameDisplay: string
  requestNameDisplay: string
  fillRequestAmountDisplay: string
  fillDepositAmountDisplay: string
  requestTokenBalance: number
  cannotFillReason: string
}>()

const chainPriceFormatted = computed(() => {
  const p = props.chainPrice
  if (p == null || !Number.isFinite(p) || p <= 0) return '–'
  return formatUiAmount(p, 6)
})

const chainPriceInvertedFormatted = computed(() => {
  const p = props.chainPrice
  if (p == null || !Number.isFinite(p) || p <= 0) return '–'
  const inv = 1 / p
  return Number.isFinite(inv) ? formatUiAmount(inv, 6) : '–'
})

function ensureString(val: unknown, fallback: string): string {
  if (val == null) return fallback
  if (typeof val === 'string') return sanitizeTokenLabel(val)
  return fallback
}

const depositNameDisplaySafe = computed(() =>
  ensureString(props.depositNameDisplay, 'Deposit')
)
const requestNameDisplaySafe = computed(() =>
  ensureString(props.requestNameDisplay, 'Request')
)

defineEmits<{
  'update:fillPercent': [value: number]
  fillAmountInput: [value: string]
  focusAmountInput: [value: boolean]
  toggleRatio: []
  fill: []
  connectWallet: []
}>()
</script>
