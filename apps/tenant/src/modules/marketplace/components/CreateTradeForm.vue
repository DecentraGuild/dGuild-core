<template>
  <div v-if="rpcError" class="create-trade-form__error">
    <p>{{ rpcError }}</p>
    <p class="create-trade-form__hint">Add NUXT_PUBLIC_HELIUS_RPC to your .env or deploy environment.</p>
  </div>
  <div v-else>
    <p class="create-trade-form__hint">Select what you offer from your wallet and what you want in return.</p>

    <div class="create-trade-form__field">
      <label class="create-trade-form__label">Offer (from wallet)</label>
      <OptionsSelect
        v-model="selectedDepositKey"
        :option-groups="depositSelectOptionGroups"
        placeholder="Select token to offer..."
        :disabled="loadingBalances"
        content-class="z-[9999]"
      />
      <p v-if="scopeLoading" class="create-trade-form__field-hint">Loading store scope...</p>
      <p v-else-if="loadingBalances" class="create-trade-form__field-hint">Loading wallet balances...</p>
      <p v-else-if="prefillPrompt && initialOfferInWallet && selectedDepositKey !== initialOfferMint" class="create-trade-form__field-hint">
        You have this asset. Select it above to offer.
      </p>
      <p v-else-if="depositOptionCount === 0 && !loadingBalances && !scopeLoading" class="create-trade-form__field-hint">
        No tokens or NFTs from your wallet match this store.
      </p>
    </div>

    <div class="create-trade-form__field">
      <TokenAmountInput
        v-model="depositAmount"
        label="Offer amount"
        type="text"
        :placeholder="selectedDepositBalance ? `Max: ${formatUiAmount(selectedDepositBalance.uiAmount, selectedDepositBalance.decimals)}` : '0'"
        :show-quick-amounts="isOfferFungible && (selectedDepositBalance?.uiAmount ?? 0) > 0"
        :hint="selectedDepositBalance && isOfferFungible ? `Balance: ${formatUiAmount(selectedDepositBalance.uiAmount, selectedDepositBalance.decimals)}` : undefined"
        @set-percent="setDepositPercent"
      />
    </div>

    <div class="create-trade-form__field">
      <label class="create-trade-form__label">Request (what you want)</label>
      <OptionsSelect
        v-model="requestMint"
        :option-groups="requestSelectOptionGroups"
        placeholder="Select token you want..."
        content-class="z-[9999]"
      />
      <div v-if="isRequestCollection && requestMint" class="create-trade-form__nft-pick">
        <button type="button" class="create-trade-form__nft-pick-btn" @click="nftSelectorOpen = true">
          {{ requestNftName ? 'Change' : 'Select specific NFT from collection' }}
        </button>
        <span v-if="requestNftName" class="create-trade-form__nft-pick-name">{{ requestNftName }}</span>
        <p v-else class="create-trade-form__field-hint">Required: pick a specific NFT to complete the trade.</p>
      </div>
    </div>
    <NftInstanceSelectorModal
      v-model="nftSelectorOpen"
      :collection-mint="isRequestCollection ? requestMint : null"
      :collection-name="requestCollectionName"
      :slug="tenantSlugRef"
      @select="onRequestNftSelect"
    />

    <FormInput
      v-model="requestAmount"
      type="text"
      label="Request amount"
      placeholder="Amount or price per unit"
    />

    <CreateTradeSettings
      :slug="tenantSlugRef"
      :effective-module-gate="effectiveModuleGate"
      :expanded="settingsExpanded"
      :direct="settingsDirect"
      :direct-address="settingsDirectAddress"
      :gate="settingsGate"
      :expire="settingsExpire"
      :expire-date="settingsExpireDate"
      :partial-fill="settingsPartialFill"
      :slippage="settingsSlippage"
      @update:expanded="settingsExpanded = $event"
      @update:direct="settingsDirect = $event"
      @update:direct-address="settingsDirectAddress = $event"
      @update:gate="settingsGate = $event"
      @update:expire="settingsExpire = $event"
      @update:expire-date="settingsExpireDate = $event"
      @update:partial-fill="settingsPartialFill = $event"
      @update:slippage="settingsSlippage = $event"
    />

    <div class="create-trade-form__actions">
      <Button variant="default" :disabled="creating || !canCreate" @click="create">
        {{ creating ? 'Creating...' : 'Create escrow' }}
      </Button>
      <p v-if="createError" class="create-trade-form__error">{{ createError }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatUiAmount, truncateAddress } from '@decentraguild/display'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import { Button } from '~/components/ui/button'
import OptionsSelect from '~/components/ui/options-select/OptionsSelect.vue'
import CreateTradeSettings from './CreateTradeSettings.vue'
import NftInstanceSelectorModal from './NftInstanceSelectorModal.vue'
import { useCollectionMembers } from '~/composables/mint/useCollectionMembers'
import { storeToRefs } from 'pinia'
import { useAuth } from '@decentraguild/auth'
import { useTenantStore } from '~/stores/tenant'
import { useEffectiveGate } from '~/composables/gates/useEffectiveGate'
import {
  buildInitializeTransaction,
  sendAndConfirmTransaction,
  getEscrowWalletFromConnector,
  deriveEscrowAccounts,
} from '@decentraguild/web3'
import { ESCROW_PROGRAM_ID, SLIPPAGE_DIVISOR } from '@decentraguild/contracts'
import { toRawUnits, sanitizeTokenLabel } from '@decentraguild/display'
import { PublicKey } from '@solana/web3.js'
import BN from 'bn.js'
import { fetchWalletTokenBalances, type TokenBalance } from '~/composables/core/useWalletTokenBalances'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { useMintMetadata } from '~/composables/mint/useMintMetadata'
import { useMintLabels } from '~/composables/mint/useMintLabels'
import { useStoreMints } from '~/composables/core/useStoreMints'
import { useTenantInLinks } from '~/composables/core/useTenantInLinks'
import { buildTokenOptionGroups, type TokenKind } from '~/utils/buildTokenOptionGroups'

const props = withDefaults(
  defineProps<{
    initialOfferMint?: string | null
    initialOfferType?: string | null
    initialRequestMint?: string | null
  }>(),
  {
    initialOfferMint: null,
    initialOfferType: null,
    initialRequestMint: null,
  }
)

const emit = defineEmits<{ success: [] }>()
const tenantStore = useTenantStore()
const { slug: tenantSlugRef } = storeToRefs(tenantStore)
const router = useRouter()

const { allowedMints, requestSelectorMints, scopeEntries, scopeLoading } = useStoreMints()
const tenantRef = computed(() => tenantStore.tenant)
const marketplaceSettingsRef = computed(() => tenantStore.marketplaceSettings)
const effectiveModuleGate = useEffectiveGate(tenantRef, 'marketplace', {
  marketplaceSettings: marketplaceSettingsRef,
  raffleSettings: computed(() => tenantStore.raffleSettings),
})
const auth = useAuth()
const { connection, rpcUrl, hasRpc, rpcError } = useSolanaConnection()
const { fetchMetadata } = useMintMetadata()

const walletAddress = computed(() => auth.connectorState.value?.account ?? null)

const walletBalances = ref<TokenBalance[]>([])
const loadingBalances = ref(false)

const offerMints = computed(() => new Set(walletBalances.value.map((b) => b.mint)))
const { labelByMint: offerLabelByMint } = useMintLabels(offerMints)
const { labelByMint: requestLabelByMint } = useMintLabels(requestSelectorMints)

const selectedDepositKey = ref('')
const selectedDepositBalance = computed(() =>
  walletBalances.value.find((b) => b.mint === selectedDepositKey.value)
)
const requestMint = ref('')
const requestPickedNftMint = ref<string | null>(null)
const requestPickedNftName = ref<string | null>(null)
const nftSelectorOpen = ref(false)
const depositAmount = ref('')
const requestAmount = ref('')
const creating = ref(false)
const createError = ref<string | null>(null)

const settingsExpanded = ref(true)
const settingsDirect = ref(false)
const settingsDirectAddress = ref('')
const settingsGate = ref<{ programId: string; account: string } | null | 'use-default'>(null)
const settingsExpire = ref(false)
const settingsExpireDate = ref('')
const settingsPartialFill = ref(false)
const settingsSlippage = ref(5000)

const SYSTEM_PROGRAM = '11111111111111111111111111111111'

function validateRecipientAddress(addr: string): { valid: boolean; pubkey?: PublicKey; error?: string } {
  const trimmed = addr?.trim()
  if (!trimmed) return { valid: false, error: 'Address required' }
  try {
    const pk = new PublicKey(trimmed)
    if (pk.toBase58() === SYSTEM_PROGRAM) {
      return { valid: false, error: 'Cannot use system program. Use a valid wallet address.' }
    }
    return { valid: true, pubkey: pk }
  } catch {
    return { valid: false, error: 'Invalid Solana address' }
  }
}

const initialOfferInWallet = computed(() => {
  if (!props.initialOfferMint) return false
  return walletBalances.value.some((b) => b.mint === props.initialOfferMint)
})

const prefillPrompt = computed(() => Boolean(props.initialOfferMint && props.initialOfferType))

const isOfferFungible = computed(() => {
  const b = selectedDepositBalance.value
  return b != null && b.decimals > 0
})

const depositSelectOptionGroups = computed(() => {
  const settings = tenantStore.marketplaceSettings
  const labels = offerLabelByMint.value
  const baseLabel = (b: TokenBalance) => {
    const name = sanitizeTokenLabel(labels.get(b.mint) ?? truncateAddress(b.mint, 8, 4))
    return `${name} (${formatUiAmount(b.uiAmount, b.decimals)})`
  }
  const classify = (b: TokenBalance): TokenKind => {
    if (b.decimals > 0) return 'Currency'
    const entry = scopeEntries.value.find((e) => e.mint === b.mint)
    if (entry?.collectionMint && settings) return 'NFT'
    return 'SPL'
  }
  const getLabel = (b: TokenBalance) => {
    const entry = scopeEntries.value.find((e) => e.mint === b.mint)
    const coll = entry?.collectionMint && settings
      ? settings.collectionMints?.find((c) => c.mint === entry.collectionMint)
      : null
    return coll?.name ? `${sanitizeTokenLabel(coll.name)}: ${baseLabel(b)}` : baseLabel(b)
  }
  return buildTokenOptionGroups(walletBalances.value, classify, getLabel)
})

const depositOptionCount = computed(() =>
  depositSelectOptionGroups.value.reduce((sum, g) => sum + g.options.length, 0)
)

const collectionMints = computed(() => tenantStore.marketplaceSettings?.collectionMints?.map((c) => c.mint) ?? [])

const isRequestCollection = computed(() => {
  if (!requestMint.value) return false
  return collectionMints.value.includes(requestMint.value)
})

const requestMintForMembers = computed(() => (isRequestCollection.value ? requestMint.value : null))
const { assets: collectionMemberAssets } = useCollectionMembers(requestMintForMembers)

const requestCollectionName = computed(() => {
  if (!requestMint.value) return ''
  const c = tenantStore.marketplaceSettings?.collectionMints?.find((x) => x.mint === requestMint.value)
  return c?.name ?? requestLabelByMint.value.get(requestMint.value) ?? ''
})

const requestSelectOptionGroups = computed(() => {
  const settings = tenantStore.marketplaceSettings
  const labels = requestLabelByMint.value
  if (!settings) return []
  const getLabel = (mint: string, name?: string | null, _symbol?: string | null) =>
    sanitizeTokenLabel(name ?? labels.get(mint) ?? truncateAddress(mint, 8, 4))
  const items: Array<{ mint: string; _kind: TokenKind; name?: string | null; symbol?: string | null }> = []
  for (const c of settings.collectionMints ?? []) {
    items.push({ mint: c.mint, _kind: 'NFT', name: c.name })
  }
  for (const c of settings.currencyMints ?? []) {
    items.push({ mint: c.mint, _kind: 'Currency', name: c.name, symbol: c.symbol })
  }
  for (const s of settings.splAssetMints ?? []) {
    items.push({ mint: s.mint, _kind: 'SPL', name: s.name ?? s.symbol })
  }
  const groups = buildTokenOptionGroups(
    items,
    (item) => item._kind,
    (item) => {
      const name = getLabel(item.mint, item.name, item.symbol)
      if (item._kind === 'Currency' && item.symbol) {
        return `${name} (${sanitizeTokenLabel(item.symbol)})`
      }
      return name || truncateAddress(item.mint, 8, 4)
    }
  )
  if (isRequestCollection.value && collectionMemberAssets.value.length > 0) {
    const collName = requestCollectionName.value || truncateAddress(requestMint.value, 8, 4)
    const memberOptions = collectionMemberAssets.value.map((a) => ({
      value: a.mint,
      label: sanitizeTokenLabel(a.metadata?.name ?? truncateAddress(a.mint, 8, 4)),
    }))
    memberOptions.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    groups.push({ groupLabel: `Collection: ${collName}`, options: memberOptions })
  }
  return groups
})

const requestNftName = computed(() => requestPickedNftName.value)

const effectiveRequestMint = computed(() => requestPickedNftMint.value ?? requestMint.value)

const canCreate = computed(() => {
  const hasOffer = selectedDepositKey.value.trim()
  const hasRequest = effectiveRequestMint.value.trim()
  const hasDepositAmount = depositAmount.value.trim()
  const hasRequestAmount = requestAmount.value.trim()
  if (!hasOffer || !hasDepositAmount || !hasRequestAmount) return false
  if (isRequestCollection.value) {
    return Boolean(requestPickedNftMint.value?.trim())
  }
  return Boolean(hasRequest)
})

function onRequestNftSelect(mint: string, name?: string | null) {
  requestPickedNftMint.value = mint
  requestPickedNftName.value = name ?? null
  nftSelectorOpen.value = false
}

watch(requestMint, (mint) => {
  requestPickedNftMint.value = null
  requestPickedNftName.value = null
  if (mint && collectionMints.value.includes(mint)) {
    nftSelectorOpen.value = true
  }
})

function setDepositPercent(pct: number) {
  const b = selectedDepositBalance.value
  if (!b?.uiAmount) return
  const amt = b.decimals === 0 ? Math.floor(b.uiAmount * pct) : Number((b.uiAmount * pct).toFixed(b.decimals))
  depositAmount.value = String(amt)
}

watch(
  [() => props.initialOfferMint, walletBalances],
  () => {
    if (!props.initialOfferMint || walletBalances.value.length === 0) return
    const hasIt = walletBalances.value.some((b) => b.mint === props.initialOfferMint)
    if (!hasIt) return
    selectedDepositKey.value = props.initialOfferMint
    const b = walletBalances.value.find((x) => x.mint === props.initialOfferMint)
    if (b) {
      if (b.decimals === 0) depositAmount.value = '1'
      else depositAmount.value = formatUiAmount(b.uiAmount, b.decimals)
    }
  },
  { immediate: true }
)

watch(
  [() => props.initialRequestMint],
  () => {
    if (props.initialRequestMint) requestMint.value = props.initialRequestMint
  },
  { immediate: true }
)

watch(selectedDepositKey, () => {
  const b = walletBalances.value.find((x) => x.mint === selectedDepositKey.value)
  if (b?.decimals === 0 && !depositAmount.value) depositAmount.value = '1'
})

watch(
  [walletAddress, rpcUrl, allowedMints],
  async () => {
    if (!hasRpc || !walletAddress.value || allowedMints.value.size === 0) {
      walletBalances.value = []
      return
    }
    loadingBalances.value = true
    try {
      walletBalances.value = await fetchWalletTokenBalances(
        rpcUrl.value,
        walletAddress.value,
        allowedMints.value
      )
    } catch {
      walletBalances.value = []
    } finally {
      loadingBalances.value = false
    }
  },
  { immediate: true }
)

async function create() {
  const wallet = getEscrowWalletFromConnector()
  if (!wallet?.publicKey) {
    createError.value = 'Wallet not connected'
    return
  }
  const dm = selectedDepositKey.value.trim()
  const rm = effectiveRequestMint.value.trim()
  const da = depositAmount.value.trim()
  const ra = requestAmount.value.trim()
  if (!dm || !da || !ra) {
    createError.value = 'Fill all fields'
    return
  }
  if (isRequestCollection.value && !requestPickedNftMint.value?.trim()) {
    createError.value = 'Select a specific NFT from the collection'
    return
  }
  if (!rm) {
    createError.value = 'Fill all fields'
    return
  }
  if (settingsDirect.value && settingsDirectAddress.value.trim()) {
    const recipientCheck = validateRecipientAddress(settingsDirectAddress.value)
    if (!recipientCheck.valid) {
      createError.value = recipientCheck.error ?? 'Invalid recipient'
      return
    }
  }

  creating.value = true
  createError.value = null
  try {
    const [depMeta, reqMeta] = await Promise.all([fetchMetadata(dm), fetchMetadata(rm)])
    const depDecimals = depMeta?.decimals ?? 0
    const reqDecimals = reqMeta?.decimals ?? 0
    const daNum = parseFloat(da)
    const raNum = parseFloat(ra)
    if (!Number.isFinite(daNum) || daNum <= 0 || !Number.isFinite(raNum) || raNum <= 0) {
      createError.value = 'Invalid amounts'
      creating.value = false
      return
    }
    const depositRaw = toRawUnits(daNum, depDecimals)
    const requestRaw = toRawUnits(raNum, reqDecimals)

    if (!connection.value) {
      createError.value = 'Solana RPC not configured'
      creating.value = false
      return
    }

    const resolvedWhitelist = resolveWhitelistForEscrow(
      effectiveModuleWhitelist.value,
      settingsWhitelist.value
    )
    const _hasWhitelist = Boolean(resolvedWhitelist?.account?.trim())

    let recipientAddr: string | null = null
    if (settingsDirect.value && settingsDirectAddress.value.trim()) {
      const v = validateRecipientAddress(settingsDirectAddress.value)
      if (v.valid && v.pubkey) recipientAddr = v.pubkey.toBase58()
    }

    const expireTimestamp =
      settingsExpire.value && settingsExpireDate.value
        ? Math.floor(new Date(settingsExpireDate.value).getTime() / 1000)
        : 0

    const slippageDecimal = (settingsSlippage.value ?? 5000) / SLIPPAGE_DIVISOR
    const shopFee = tenantStore.marketplaceSettings?.shopFee
    const seed = new BN(Date.now())

    const tx = await buildInitializeTransaction({
      maker: wallet.publicKey,
      depositTokenMint: dm,
      requestTokenMint: rm,
      depositAmount: new BN(depositRaw),
      requestAmount: new BN(requestRaw),
      seed,
      expireTimestamp,
      allowPartialFill: settingsPartialFill.value,
      onlyWhitelist: hasGate,
      slippage: slippageDecimal,
      recipient: recipientAddr,
      connection: connection.value,
      wallet,
      shopFee: shopFee ?? null,
      whitelistProgram: hasGate && resolvedGate?.programId ? resolvedGate.programId : null,
      whitelist: hasGate && resolvedGate?.account ? resolvedGate.account : null,
    })

    await sendAndConfirmTransaction(connection.value, tx, wallet, wallet.publicKey)

    const programId = new PublicKey(ESCROW_PROGRAM_ID)
    const { escrow } = deriveEscrowAccounts(wallet.publicKey, seed, programId)
    const { shouldAppendTenantToLinks } = useTenantInLinks()
    const query: Record<string, string> = { tab: 'open-trades', escrow: escrow.toBase58() }
    if (tenantStore.slug && shouldAppendTenantToLinks.value) query.tenant = tenantStore.slug
    await router.replace({ path: '/market', query })
    emit('success')
  } catch (e) {
    createError.value = e instanceof Error ? e.message : 'Failed to create escrow'
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
.create-trade-form__error {
  background: var(--theme-status-error, #fcc);
  color: var(--theme-status-error, #111);
}

.create-trade-form__hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary, #c8c8d1);
  margin-bottom: var(--theme-space-md);
}

.create-trade-form__field {
  margin-bottom: var(--theme-space-md);
}

.create-trade-form__label {
  display: block;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-primary, #ffffff);
  margin-bottom: var(--theme-space-xs);
}

.create-trade-form__field-hint {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary, #c8c8d1);
  margin-top: var(--theme-space-xs);
}

.create-trade-form__actions {
  margin-top: var(--theme-space-lg);
}

.create-trade-form__error {
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
  margin-top: var(--theme-space-sm);
}
</style>
