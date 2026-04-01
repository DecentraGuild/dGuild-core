<template>
  <form class="raffle-add-reward-form" @submit.prevent="$emit('submit')">
    <div v-if="rpcError" class="raffle-add-reward-form__rpc-err">
      <p>{{ rpcError }}</p>
      <p class="raffle-add-reward-form__hint">Configure NUXT_PUBLIC_HELIUS_RPC (or your RPC) to load wallet balances.</p>
    </div>
    <template v-else>
      <div class="raffle-add-reward-form__field">
        <span class="raffle-add-reward-form__label">Prize token</span>
        <p class="raffle-add-reward-form__hint raffle-add-reward-form__hint--tight">
          Only tokens you hold in this wallet — you deposit the prize on-chain when adding the reward.
        </p>
        <OptionsSelect
          v-model="selectedWalletMint"
          :option-groups="prizeOptionGroups"
          placeholder="Select from your wallet balances..."
          :disabled="loadingBalances || !walletAddress || !hasRpc"
          content-class="z-[9999]"
        />
        <p v-if="loadingBalances" class="raffle-add-reward-form__field-hint">Loading wallet balances…</p>
        <p v-else-if="!hasRpc" class="raffle-add-reward-form__field-hint">RPC not configured.</p>
        <p v-else-if="!walletAddress" class="raffle-add-reward-form__field-hint">
          Connect the wallet that will pay the prize to see balances.
        </p>
        <p
          v-else-if="prizeOptionCount === 0 && !loadingBalances"
          class="raffle-add-reward-form__field-hint"
        >
          No SPL tokens with balance in this wallet. Fund it with the prize token, then try again.
        </p>
      </div>
    </template>
    <FormInput
      v-model="form.amountDisplay"
      type="number"
      :label="prizeMintMeta.label"
      :placeholder="prizeMintMeta.placeholder"
      required
    />
    <p v-if="prizeMintMeta.hint" class="raffle-add-reward-form__hint">{{ prizeMintMeta.hint }}</p>
    <FormInput
      v-model="form.imageUrl"
      label="Image URL (optional)"
      placeholder="https://..."
    />
    <p v-if="error" class="raffle-add-reward-form__error">{{ error }}</p>
    <div class="raffle-add-reward-form__actions">
      <Button variant="secondary" type="button" @click="$emit('cancel')">
        Cancel
      </Button>
      <Button
        variant="default"
        type="submit"
        :disabled="submitting || !canSubmitPrize"
      >
        {{ submitting ? 'Adding...' : 'Add reward' }}
      </Button>
    </div>
  </form>
</template>

<script setup lang="ts">
import {
  formatRawTokenAmount,
  sanitizeTokenLabel,
  truncateAddress,
} from '@decentraguild/display'
import { useAuth } from '@decentraguild/auth'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import { Button } from '~/components/ui/button'
import OptionsSelect from '~/components/ui/options-select/OptionsSelect.vue'
import { fetchWalletTokenBalances, type TokenBalance } from '~/composables/core/useWalletTokenBalances'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { useMintLabels } from '~/composables/mint/useMintLabels'
import { buildTokenOptionGroups, type TokenKind } from '~/utils/buildTokenOptionGroups'

const form = defineModel<{
  prizeMint: string
  amountDisplay: string
  imageUrl: string
}>('form', { required: true })

defineProps<{
  prizeMintMeta: { label: string; placeholder: string; hint?: string }
  submitting: boolean
  error: string | null
}>()

defineEmits<{ submit: []; cancel: [] }>()

const auth = useAuth()
const { rpcUrl, hasRpc, rpcError } = useSolanaConnection()

const walletAddress = computed(() => auth.connectorState.value?.account ?? null)
const walletBalances = ref<TokenBalance[]>([])
const loadingBalances = ref(false)
const selectedWalletMint = ref('')

const offerMints = computed(() => new Set(walletBalances.value.map((b) => b.mint)))
const { labelByMint } = useMintLabels(offerMints)

function classifyPrizeBalance(b: TokenBalance): TokenKind {
  if (b.decimals > 0) return 'Currency'
  return 'NFT'
}

function balanceLabel(b: TokenBalance): string {
  const labels = labelByMint.value
  const name = sanitizeTokenLabel(labels.get(b.mint) ?? truncateAddress(b.mint, 8, 4))
  const bal = formatRawTokenAmount(b.amount, b.decimals, b.decimals === 0 ? 'NFT' : 'SPL')
  return `${name} (${bal})`
}

const prizeOptionGroups = computed(() =>
  buildTokenOptionGroups(walletBalances.value, classifyPrizeBalance, balanceLabel),
)

const prizeOptionCount = computed(() =>
  prizeOptionGroups.value.reduce((n, g) => n + g.options.length, 0),
)

const canSubmitPrize = computed(() => {
  if (rpcError.value) return false
  if (!hasRpc || !walletAddress.value) return false
  return Boolean(selectedWalletMint.value.trim())
})

watch(selectedWalletMint, (mint) => {
  form.value.prizeMint = mint
})

watch(
  () => form.value.prizeMint,
  (v) => {
    if (!v.trim()) {
      selectedWalletMint.value = ''
    }
  },
)

watch(
  [walletAddress, rpcUrl, hasRpc],
  async () => {
    if (!hasRpc || !rpcUrl.value || !walletAddress.value) {
      walletBalances.value = []
      return
    }
    loadingBalances.value = true
    try {
      walletBalances.value = await fetchWalletTokenBalances(
        rpcUrl.value,
        walletAddress.value,
        new Set(),
        { allHeldMints: true },
      )
    } catch {
      walletBalances.value = []
    } finally {
      loadingBalances.value = false
    }
  },
  { immediate: true },
)

watch(walletBalances, (balances) => {
  const m = form.value.prizeMint.trim()
  if (m && balances.some((b) => b.mint === m)) {
    selectedWalletMint.value = m
  }
})
</script>

<style scoped>
.raffle-add-reward-form {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
  min-width: 0;
  max-width: 100%;
  overflow-x: hidden;
  overflow-wrap: break-word;
}
.raffle-add-reward-form :deep(input) {
  max-width: 100%;
  box-sizing: border-box;
}
.raffle-add-reward-form__hint {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
.raffle-add-reward-form__hint--tight {
  margin-top: calc(-1 * var(--theme-space-xs));
}
.raffle-add-reward-form__field-hint {
  margin: var(--theme-space-xs) 0 0;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
}
.raffle-add-reward-form__rpc-err {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}
.raffle-add-reward-form__error {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}
.raffle-add-reward-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--theme-space-sm);
  margin-top: var(--theme-space-sm);
}

.raffle-add-reward-form__field {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
}

.raffle-add-reward-form__label {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  color: var(--theme-text-primary);
}
</style>
