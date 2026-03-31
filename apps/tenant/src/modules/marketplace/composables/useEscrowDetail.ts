/**
 * Composable for EscrowDetailModal: escrow fetch, display, fill/cancel logic.
 * Extracted from EscrowDetailModal to reduce component size.
 */
import { computed, ref, watch, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import { formatUiAmount, toRawUnits, escrowPriceToHuman, sanitizeTokenLabel } from '@decentraguild/display'
import { useEscrowDisplay } from '~/composables/marketplace/useEscrowDisplay'
import { useTenantStore } from '~/stores/tenant'
import { useMemberProfiles } from '~/composables/members/useMemberProfiles'
import { useSupabase } from '~/composables/core/useSupabase'
import { useMarketplaceEscrowLinks } from '~/composables/marketplace/useMarketplaceEscrowLinks'
import { useAuth } from '@decentraguild/auth'
import {
  fetchEscrowByAddress,
  buildCancelTransaction,
  buildExchangeTransaction,
  sendAndConfirmTransaction,
  getEscrowWalletFromConnector,
} from '@decentraguild/web3'
import { ESCROW_PROGRAM_ID } from '@decentraguild/contracts'
import { SystemProgram, PublicKey } from '@solana/web3.js'
import BN from 'bn.js'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { useSubmitInFlightLock } from '@decentraguild/nuxt-composables'
import { useExplorerLinks } from '~/composables/core/useExplorerLinks'
import { useTransactionNotificationsStore } from '~/stores/transactionNotifications'
import { fetchWalletTokenBalances, type TokenBalance } from '~/composables/core/useWalletTokenBalances'
import { useWalletOnList } from '~/composables/gates/useWalletOnList'
import { useEscrowPreload } from '~/composables/marketplace/useEscrowPreload'

const SYSTEM_PROGRAM = '11111111111111111111111111111111'

function apiEscrowToFull(e: { publicKey: string; account: Record<string, unknown> }): Awaited<ReturnType<typeof fetchEscrowByAddress>> {
  const acc = e.account
  return {
    publicKey: new PublicKey(e.publicKey),
    account: {
      maker: new PublicKey(acc.maker),
      depositToken: new PublicKey(acc.depositToken),
      requestToken: new PublicKey(acc.requestToken),
      tokensDepositInit: new BN(acc.tokensDepositInit),
      tokensDepositRemaining: new BN(acc.tokensDepositRemaining),
      price: escrowPriceToHuman(acc.price),
      decimals: acc.decimals as number,
      slippage: acc.slippage as number,
      seed: new BN(acc.seed),
      authBump: 0,
      vaultBump: 0,
      escrowBump: 0,
      expireTimestamp: new BN(acc.expireTimestamp),
      recipient: new PublicKey(acc.recipient),
      onlyRecipient: acc.onlyRecipient as boolean,
      onlyWhitelist: acc.onlyWhitelist as boolean,
      allowPartialFill: acc.allowPartialFill as boolean,
      whitelist: new PublicKey(acc.whitelist),
    },
  }
}

export function useEscrowDetail(props: {
  escrowId: Ref<string | null>
  fillDisabled?: Ref<boolean>
  modelValue: Ref<boolean>
}) {
  const tenantStore = useTenantStore()
  const { resolveWallet } = useMemberProfiles()
  const { slug } = storeToRefs(tenantStore)
  const { shareUrl: getShareUrl } = useMarketplaceEscrowLinks(slug)
  const auth = useAuth()
  const { connection, rpcUrl, hasRpc, rpcError } = useSolanaConnection()
  const txNotifications = useTransactionNotificationsStore()
  const explorerLinks = useExplorerLinks()
  const escrowActionLock = useSubmitInFlightLock()

  const escrow = ref<Awaited<ReturnType<typeof fetchEscrowByAddress>> | null>(null)
  const loading = ref(true)
  const filling = ref(false)
  const cancelling = ref(false)
  const detailsOpen = ref(false)
  const ownerFillOpen = ref(false)
  const ratioFlipped = ref(false)
  const fillPercent = ref(100)
  const fillAmountInput = ref('')
  const fillAmountInputFocused = ref(false)
  const walletBalances = ref<TokenBalance[]>([])
  const shareQrDataUrl = ref('')

  const config = useRuntimeConfig()
  const supabaseConfigured = Boolean(config.public.supabaseUrl && config.public.supabaseAnonKey)
  const apiAvailable = supabaseConfigured

  const shareUrlValue = computed(() =>
    props.escrowId.value ? getShareUrl(props.escrowId.value) : ''
  )

  const walletAddress = computed(() => auth.connectorState.value?.account ?? null)

  const escrowWhitelistAddress = computed(() =>
    escrow.value?.account.onlyWhitelist ? escrow.value.account.whitelist.toBase58() : null
  )
  const { isListed: isOnEscrowWhitelist } = useWalletOnList(escrowWhitelistAddress)

  const canSignTransactions = computed(() => getEscrowWalletFromConnector() != null)

  const isMaker = computed(
    () =>
      escrow.value &&
      walletAddress.value &&
      escrow.value.account.maker.toBase58() === walletAddress.value
  )

  const isPublicRecipient = computed(() => {
    if (!escrow.value) return true
    const rec = escrow.value.account.recipient.toBase58()
    return rec === SYSTEM_PROGRAM
  })

  const expireLabel = computed(() => {
    if (!escrow.value) return 'Never'
    const ts = escrow.value.account.expireTimestamp?.toNumber?.() ?? 0
    if (ts <= 0) return 'Never'
    const date = new Date(ts * 1000)
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  })

  const canFill = computed(() => {
    if (!escrow.value || !walletAddress.value) return false
    if (escrow.value.account.maker.toBase58() === walletAddress.value) return false
    if ((escrow.value.account.tokensDepositRemaining?.toNumber() ?? 0) <= 0) return false
    if (escrow.value.account.onlyWhitelist && isOnEscrowWhitelist.value !== true) return false
    if (escrow.value.account.onlyRecipient) {
      const rec = escrow.value.account.recipient.toBase58()
      if (rec !== SYSTEM_PROGRAM && rec !== walletAddress.value) return false
    }
    const ts = escrow.value.account.expireTimestamp?.toNumber?.() ?? 0
    if (ts > 0 && ts < Math.floor(Date.now() / 1000)) return false
    return true
  })

  const { data } = useEscrowDisplay(escrow)
  const display = computed(() => data.value)

  const chainPrice = computed(() => {
    const p = escrow.value?.account?.price
    return p != null && Number.isFinite(p) ? Number(p) : 0
  })

  function ensureDisplayString(val: unknown, fallback: string): string {
    if (val == null) return fallback
    if (typeof val === 'string') return sanitizeTokenLabel(val)
    return fallback
  }

  const depositSymbolDisplay = computed(() =>
    display.value ? ensureDisplayString(display.value.depositSymbol ?? display.value.depositMintShort, '') : ''
  )
  const priceSymbolDisplay = computed(() =>
    display.value ? ensureDisplayString(display.value.priceSymbol ?? display.value.requestMintShort, '') : ''
  )
  const depositNameDisplay = computed(() =>
    display.value ? ensureDisplayString(display.value.depositName ?? display.value.depositSymbol, 'Deposit') : 'Deposit'
  )
  const requestNameDisplay = computed(() =>
    display.value ? ensureDisplayString(display.value.requestName ?? display.value.priceSymbol, 'Request') : 'Request'
  )

  const fillDepositAmount = computed(() => {
    if (!display.value) return 0
    return (display.value.depositAmount * fillPercent.value) / 100
  })

  function formatFillAmountForInput(amount: number, decimals: number): string {
    if (amount === 0) return '0'
    if (decimals === 0) return String(Math.round(amount))
    return amount.toFixed(decimals).replace(/\.?0+$/, '')
  }

  function syncFillAmountInputFromPercent() {
    if (display.value) {
      fillAmountInput.value = formatFillAmountForInput(
        fillDepositAmount.value,
        display.value.depositDecimals
      )
    }
  }

  function onFillAmountInput(value: string) {
    fillAmountInput.value = value
    const d = display.value
    if (!d || d.depositAmount <= 0) return
    const parsed = parseFloat(value)
    if (Number.isNaN(parsed) || parsed < 0) return
    const pct = Math.min(100, Math.max(0, (parsed / d.depositAmount) * 100))
    fillPercent.value = pct
  }

  const fillRequestAmount = computed(() => {
    if (!display.value) return 0
    return fillDepositAmount.value * chainPrice.value
  })

  const fillRequestAmountDisplay = computed(() => formatUiAmount(fillRequestAmount.value, 6))
  const fillDepositAmountDisplay = computed(() => formatUiAmount(fillDepositAmount.value, 6))

  const requestTokenBalance = computed(() => {
    if (!escrow.value) return 0
    const mint = escrow.value.account.requestToken.toBase58()
    const b = walletBalances.value.find((x) => x.mint === mint)
    return b?.uiAmount ?? 0
  })

  const insufficientBalance = computed(() => {
    if (!canFill.value || !display.value) return false
    return requestTokenBalance.value < fillRequestAmount.value
  })

  /** For FILL: balance shown is the REQUEST token (what you pay). Fetch only that, same pattern as Create. */
  const requestMintForBalance = computed(() =>
    escrow.value?.account.requestToken.toBase58() ?? null
  )

  function notifyCopied(label: string) {
    const id = `copy-${Date.now()}`
    txNotifications.add(id, { status: 'success', message: `Copied: ${label}` })
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      notifyCopied(label)
    } catch {
      // ignore
    }
  }

  async function copyShareLinkAndNotify() {
    const url = shareUrlValue.value
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      notifyCopied('Link')
    } catch {
      // ignore
    }
  }

  async function handleFill(close: () => void) {
    const wallet = getEscrowWalletFromConnector()
    if (!wallet?.publicKey || !escrow.value || !props.escrowId.value) {
      const id = `fill-error-${Date.now()}`
      txNotifications.add(id, {
        status: 'error',
        message: walletAddress.value
          ? 'Wallet cannot sign transactions. Try reconnecting or use another wallet.'
          : 'Connect a wallet to fill this trade.',
      })
      return
    }
    const depDecimals = display.value?.depositDecimals ?? 0
    const amountRaw = toRawUnits(fillDepositAmount.value, depDecimals)
    const amountBN = new BN(amountRaw)
    if (amountBN.lte(new BN(0))) {
      txNotifications.add(`fill-amount-${Date.now()}`, {
        status: 'error',
        message: 'Enter a valid amount to fill.',
      })
      return
    }

    const exclusive = await escrowActionLock.runExclusive(async () => {
      filling.value = true
      const txId = `fill-${props.escrowId.value}-${Date.now()}`
      txNotifications.add(txId, { status: 'pending', message: 'Filling escrow...' })
      try {
        if (!connection.value) throw new Error('RPC not configured')
        const whitelistKey = escrow.value.account.whitelist
        const escrowProgramId = new PublicKey(ESCROW_PROGRAM_ID)
        const hasWhitelist =
          whitelistKey &&
          !whitelistKey.equals(SystemProgram.programId) &&
          !whitelistKey.equals(escrowProgramId)
        const tx = await buildExchangeTransaction({
          maker: escrow.value.account.maker,
          taker: wallet.publicKey,
          depositTokenMint: escrow.value.account.depositToken,
          requestTokenMint: escrow.value.account.requestToken,
          amount: amountBN,
          seed: escrow.value.account.seed,
          connection: connection.value,
          wallet,
          whitelist: hasWhitelist ? whitelistKey.toBase58() : null,
        })
        const sig = await sendAndConfirmTransaction(connection.value, tx, wallet, wallet.publicKey)
        txNotifications.update(txId, { status: 'success', message: 'Escrow filled', signature: sig })
        escrow.value = null
        close()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Fill failed'
        txNotifications.update(txId, {
          status: 'error',
          message: msg,
        })
      } finally {
        filling.value = false
      }
    })
    if (!exclusive.ok) return
  }

  async function handleCancel(close: () => void) {
    const wallet = getEscrowWalletFromConnector()
    if (!wallet || !escrow.value || !props.escrowId.value) return
    const exclusive = await escrowActionLock.runExclusive(async () => {
      cancelling.value = true
      const txId = `cancel-${props.escrowId.value}-${Date.now()}`
      txNotifications.add(txId, { status: 'pending', message: 'Cancelling escrow...' })
      try {
        if (!connection.value) throw new Error('RPC not configured')
        const tx = await buildCancelTransaction({
          maker: escrow.value!.account.maker,
          depositTokenMint: escrow.value!.account.depositToken,
          requestTokenMint: escrow.value!.account.requestToken,
          seed: escrow.value!.account.seed,
          connection: connection.value,
          wallet,
        })
        const sig = await sendAndConfirmTransaction(
          connection.value,
          tx,
          wallet,
          escrow.value!.account.maker
        )
        txNotifications.update(txId, { status: 'success', message: 'Escrow cancelled', signature: sig })
        escrow.value = null
        close()
      } catch (e) {
        txNotifications.update(txId, {
          status: 'error',
          message: e instanceof Error ? e.message : 'Cancel failed',
        })
      } finally {
        cancelling.value = false
      }
    })
    if (!exclusive.ok) return
  }

  const FETCH_TIMEOUT_MS = 15_000

  function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Escrow fetch timed out')), ms)
      ),
    ])
  }

  const { getAndClear } = useEscrowPreload()

  const inFlightId = ref<string | null>(null)

  async function loadEscrow(id: string) {
    if (!id) return
    if (inFlightId.value === id) return
    if (escrow.value?.publicKey.toBase58() === id) return
    inFlightId.value = id
    loading.value = true
    escrow.value = null
    fillPercent.value = 100
    try {
      const preloaded = getAndClear(id)
      if (preloaded) {
        escrow.value = preloaded
        return
      }
      if (supabaseConfigured) {
        try {
          const supabase = useSupabase()
          // Raw invoke (not invokeEdgeFunction): Promise.race timeout + soft fallback to RPC on any failure.
          const invokePromise = supabase.functions.invoke('marketplace', {
            body: { action: 'escrow', escrowId: id },
          })
          const { data, error } = await withTimeout(invokePromise, FETCH_TIMEOUT_MS)
          if (props.escrowId.value !== id) return
          if (!error && (data as { escrow?: unknown }).escrow) {
            const raw = (data as { escrow: { publicKey: string; account: Record<string, unknown> } }).escrow
            escrow.value = apiEscrowToFull(raw)
            return
          }
        } catch {
          /* fall through to RPC */
        }
      }
      if (connection.value) {
        try {
          const fetchPromise = fetchEscrowByAddress(connection.value, id)
          const fromChain = await withTimeout(fetchPromise, FETCH_TIMEOUT_MS)
          if (props.escrowId.value !== id) return
          escrow.value = fromChain
        } catch {
          if (props.escrowId.value === id) escrow.value = null
        }
      }
    } finally {
      const sameId = props.escrowId.value === id
      if (sameId) loading.value = false
      if (inFlightId.value === id) inFlightId.value = null
    }
  }

  watch(
    () => props.modelValue,
    (open) => {
      if (open) auth.refreshConnectorState()
    }
  )
  watchEffect(() => {
    const id = props.escrowId.value
    const open = props.modelValue.value
    if (id && open) void loadEscrow(id)
    else {
      inFlightId.value = null
      escrow.value = null
      loading.value = false
    }
  })

  watch(
    [fillPercent, display],
    () => {
      if (!fillAmountInputFocused.value && display.value) {
        syncFillAmountInputFromPercent()
      }
    },
    { immediate: true }
  )

  /** Same balance fetch pattern as CreateTradeForm. For FILL: fetch REQUEST token only (what you pay). */
  watch(
    () => [walletAddress.value, rpcUrl.value, requestMintForBalance.value] as const,
    async ([wallet, rpc, requestMint]) => {
      if (!hasRpc || !wallet || !requestMint) {
        walletBalances.value = []
        return
      }
      try {
        const mints = new Set<string>([requestMint])
        walletBalances.value = await fetchWalletTokenBalances(rpc, wallet, mints, {
          forceRefresh: true,
          skipCache: true,
        })
      } catch {
        walletBalances.value = []
      }
    },
    { immediate: true }
  )

  watch(
    () => [props.modelValue, props.escrowId.value, shareUrlValue.value] as const,
    async ([open, id, url]) => {
      if (!open || !id || !url) {
        shareQrDataUrl.value = ''
        return
      }
      try {
        const QRCode = await import('qrcode')
        shareQrDataUrl.value = await QRCode.toDataURL(url, { width: 200, margin: 1 })
      } catch {
        shareQrDataUrl.value = ''
      }
    },
    { immediate: true }
  )

  function setFillPercent(v: number) {
    fillPercent.value = v
  }

  function toggleRatio() {
    ratioFlipped.value = !ratioFlipped.value
  }

  function toggleOwnerFillOpen() {
    ownerFillOpen.value = !ownerFillOpen.value
  }

  function toggleDetailsOpen() {
    detailsOpen.value = !detailsOpen.value
  }

  function onFocusAmountInput(focused: boolean) {
    fillAmountInputFocused.value = focused
    if (!focused) syncFillAmountInputFromPercent()
  }

  return {
    escrow,
    loading,
    filling,
    cancelling,
    detailsOpen,
    ownerFillOpen,
    ratioFlipped,
    fillPercent,
    fillAmountInput,
    fillAmountInputFocused,
    shareQrDataUrl,
    shareUrlValue,
    apiAvailable,
    rpcError,
    walletAddress,
    isMaker,
    isPublicRecipient,
    expireLabel,
    canFill,
    canSignTransactions,
    display,
    chainPrice,
    depositSymbolDisplay,
    priceSymbolDisplay,
    depositNameDisplay,
    requestNameDisplay,
    fillDepositAmount,
    fillRequestAmount,
    fillRequestAmountDisplay,
    fillDepositAmountDisplay,
    requestTokenBalance,
    insufficientBalance,
    isOnEscrowWhitelist,
    syncFillAmountInputFromPercent,
    onFillAmountInput,
    setFillPercent,
    toggleRatio,
    toggleOwnerFillOpen,
    toggleDetailsOpen,
    onFocusAmountInput,
    copyToClipboard,
    copyShareLinkAndNotify,
    handleFill,
    handleCancel,
    walletLabel: resolveWallet,
    explorerLinks,
  }
}
