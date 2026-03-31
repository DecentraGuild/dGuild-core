import { PublicKey, Transaction } from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
  createConnection,
  buildMintTransaction,
  buildBurnTransaction,
  buildCreateMetadataTransaction,
  buildUpdateMetadataTransaction,
  hasMetaplexMetadataAccount,
  sendAndConfirmTransaction,
  getEscrowWalletFromConnector,
  fetchMintMetadataFromChain,
} from '@decentraguild/web3'
import { useAuth } from '@decentraguild/auth'
import { useSupabase, invokeEdgeFunction, useSubmitInFlightLock } from '@decentraguild/nuxt-composables'
import { useRpc } from '~/composables/useRpc'
import { useTransactionNotificationsStore } from '~/stores/transactionNotifications'

const VOUCHER_WALLET = '89s4gjt2STRy83XQrxmYrWRkQBH3CL228BRVs6Qbed2Q'

interface VoucherDetail {
  type: 'bundle' | 'individual'
  voucher: {
    mint: string
    bundle_id?: string
    tokens_required?: number
    label?: string | null
    max_redemptions_per_tenant?: number | null
  }
  bundle?: { id: string; label: string; product_key: string } | null
  entitlements?: Array<{ meter_key: string; quantity: number; duration_days: number }>
  redemptions: Array<{
    tenant_id: string
    voucher_mint: string
    bundle_id?: string
    quantity: number
    redeemed_at: string
    payer_wallet: string | null
    status: string | null
  }>
}

export function useOpsVoucherDetail(mint: Ref<string>) {
  const auth = useAuth()
  const toastStore = useTransactionNotificationsStore()
  const opsVoucherDetailTxLock = useSubmitInFlightLock()

  const detail = ref<VoucherDetail | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const ourBalanceRaw = ref<string>('0')
  const ourBalanceLoading = ref(true)
  const holders = ref<Array<{ owner: string; amount: string }>>([])
  const holdersLoading = ref(true)
  const editExpanded = ref(false)
  const editSaving = ref(false)
  const editError = ref<string | null>(null)
  const editMetadata = ref<{ name: string; symbol: string; image: string | null; sellerFeeBasisPoints: number | null } | null>(null)
  const mintLoading = ref(false)
  const burnLoading = ref(false)
  const mintDialogOpen = ref(false)
  const burnDialogOpen = ref(false)
  const mintAmount = ref(1)
  const burnAmount = ref(1)
  const meters = ref<Array<{ meter_key: string; product_key: string }>>([])

  async function loadDetail() {
    if (!mint.value) return
    loading.value = true; error.value = null
    try {
      const supabase = useSupabase()
      const data = await invokeEdgeFunction<VoucherDetail>(supabase, 'platform', { action: 'voucher-detail', mint: mint.value })
      if (!data) throw new Error('No data')
      detail.value = data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load voucher'
    } finally { loading.value = false }
  }

  async function loadOurBalance() {
    if (!mint.value) return
    const wallet = auth.wallet.value
    const rpcUrl = useRpc().rpcUrl.value
    if (!wallet || !rpcUrl) { ourBalanceRaw.value = '0'; ourBalanceLoading.value = false; return }
    ourBalanceLoading.value = true
    try {
      const walletAddr = typeof wallet === 'string' ? wallet : (wallet as { toBase58?: () => string })?.toBase58?.()
      if (!walletAddr) { ourBalanceRaw.value = '0'; return }
      const connection = createConnection(rpcUrl)
      const mintPk = new PublicKey(mint.value)
      const ownerPk = new PublicKey(walletAddr)
      const ata = getAssociatedTokenAddressSync(mintPk, ownerPk)
      const balance = await connection.getTokenAccountBalance(ata)
      ourBalanceRaw.value = balance.value.amount
    } catch { ourBalanceRaw.value = '0' }
    finally { ourBalanceLoading.value = false }
  }

  async function loadHolders() {
    if (!mint.value) return
    holdersLoading.value = true
    try {
      const supabase = useSupabase()
      const data = await invokeEdgeFunction<{ holders?: Array<{ owner: string; amount: string }> }>(supabase, 'platform', {
        action: 'voucher-holders',
        mint: mint.value,
      })
      holders.value = data.holders ?? []
    } catch { holders.value = [] }
    finally { holdersLoading.value = false }
  }

  async function loadMeters() {
    try {
      const supabase = useSupabase()
      const data = await invokeEdgeFunction<{ meters?: Array<{ meter_key: string; product_key: string }> }>(supabase, 'platform', { action: 'meters-list' })
      meters.value = data.meters ?? []
    } catch { meters.value = [] }
  }

  async function confirmMint() {
    const amount = Math.max(1, Math.floor(mintAmount.value) || 1)
    if (!mint.value) return
    const wallet = getEscrowWalletFromConnector()
    const rpcUrl = useRpc().rpcUrl.value
    if (!wallet?.publicKey || !rpcUrl) {
      toastStore.add(`voucher-mint-${Date.now()}`, { status: 'error', message: 'Connect wallet and ensure RPC is configured' })
      return
    }
    mintDialogOpen.value = false
    const exclusive = await opsVoucherDetailTxLock.runExclusive(async () => {
      mintLoading.value = true
      const toastId = `voucher-mint-${mint.value}-${Date.now()}`
      toastStore.add(toastId, { status: 'pending', message: 'Minting…' })
      try {
        const connection = createConnection(rpcUrl)
        const mintPk = new PublicKey(mint.value)
        const destOwner = new PublicKey(VOUCHER_WALLET)
        const destAta = getAssociatedTokenAddressSync(mintPk, destOwner)
        const instructions: Parameters<Transaction['add']>[0][] = []
        try { await getAccount(connection, destAta) } catch {
          instructions.push(createAssociatedTokenAccountInstruction(
            wallet.publicKey, destAta, destOwner, mintPk, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
          ))
        }
        const mintTx = buildMintTransaction({ mint: mintPk, destination: destAta, authority: wallet.publicKey, amount: BigInt(amount) })
        const tx = new Transaction()
        tx.add(...instructions, ...mintTx.instructions)
        const sig = await sendAndConfirmTransaction(connection, tx, wallet, wallet.publicKey)
        toastStore.add(toastId, { status: 'success', message: `Minted ${amount} token${amount > 1 ? 's' : ''} to voucher wallet`, signature: sig })
        await Promise.all([loadOurBalance(), loadHolders()])
      } catch (e) {
        toastStore.add(toastId, { status: 'error', message: e instanceof Error ? e.message : 'Mint failed' })
      } finally { mintLoading.value = false }
    })
    if (!exclusive.ok) return
  }

  async function confirmBurn() {
    const amount = Math.max(1, Math.floor(burnAmount.value) || 1)
    if (!mint.value) return
    const wallet = getEscrowWalletFromConnector()
    const rpcUrl = useRpc().rpcUrl.value
    if (!wallet?.publicKey || !rpcUrl) {
      toastStore.add(`voucher-burn-${Date.now()}`, { status: 'error', message: 'Connect wallet and ensure RPC is configured' }); return
    }
    const bal = BigInt(ourBalanceRaw.value)
    if (bal === 0n) { toastStore.add(`voucher-burn-${Date.now()}`, { status: 'error', message: 'No balance to burn' }); return }
    if (BigInt(amount) > bal) { toastStore.add(`voucher-burn-${Date.now()}`, { status: 'error', message: 'Amount exceeds balance' }); return }
    burnDialogOpen.value = false
    const exclusive = await opsVoucherDetailTxLock.runExclusive(async () => {
      burnLoading.value = true
      const toastId = `voucher-burn-${mint.value}-${Date.now()}`
      toastStore.add(toastId, { status: 'pending', message: 'Burning…' })
      try {
        const connection = createConnection(rpcUrl)
        const ata = getAssociatedTokenAddressSync(new PublicKey(mint.value), wallet.publicKey)
        const tx = buildBurnTransaction({ mint: mint.value, account: ata, authority: wallet.publicKey, amount: BigInt(amount) })
        const sig = await sendAndConfirmTransaction(connection, tx, wallet, wallet.publicKey)
        toastStore.add(toastId, { status: 'success', message: `Burned ${amount} token${amount > 1 ? 's' : ''}`, signature: sig })
        await Promise.all([loadOurBalance(), loadHolders()])
      } catch (e) {
        toastStore.add(toastId, { status: 'error', message: e instanceof Error ? e.message : 'Burn failed' })
      } finally { burnLoading.value = false }
    })
    if (!exclusive.ok) return
  }

  async function saveEdit(payload: {
    name?: string; symbol?: string; imageUrl?: string; sellerFeeBasisPoints?: number | null
    tokensRequired?: number; label?: string; maxRedemptionsPerTenant?: number | null
    entitlements?: Array<{ meter_key: string; quantity: number; duration_days: number }>
  }) {
    if (!detail.value?.voucher?.mint) return
    const exclusive = await opsVoucherDetailTxLock.runExclusive(async () => {
      editSaving.value = true; editError.value = null
      try {
        const mintAddr = detail.value!.voucher.mint
        const wallet = getEscrowWalletFromConnector()
        const rpcUrl = useRpc().rpcUrl.value
        const supabase = useSupabase()

        const metadataChanged =
          (payload.name !== undefined && payload.name !== (editMetadata.value?.name ?? '')) ||
          (payload.symbol !== undefined && payload.symbol !== (editMetadata.value?.symbol ?? '')) ||
          (payload.imageUrl !== undefined && payload.imageUrl !== (editMetadata.value?.image ?? ''))

        const resolvedName = (payload.name ?? editMetadata.value?.name ?? '').trim()
        const resolvedSymbol = (payload.symbol ?? editMetadata.value?.symbol ?? '').trim()
        if (metadataChanged && resolvedName && resolvedSymbol && wallet?.publicKey && rpcUrl) {
          const sellerFeeBasisPoints = Math.max(0, Math.min(10000, payload.sellerFeeBasisPoints ?? editMetadata.value?.sellerFeeBasisPoints ?? 0))
          const metaData = await invokeEdgeFunction<{ metadataUri?: string }>(supabase, 'platform', {
            action: 'voucher-prepare-metadata',
            name: resolvedName,
            symbol: resolvedSymbol,
            imageUrl: payload.imageUrl?.trim() || undefined,
            sellerFeeBasisPoints,
            voucherType: detail.value!.type,
            bundleId: detail.value!.type === 'bundle' ? detail.value!.bundle?.id ?? detail.value!.voucher?.bundle_id : undefined,
          })
          const metadataUri = metaData?.metadataUri
          if (!metadataUri?.trim()) throw new Error('No metadata URI returned')
          const connection = createConnection(rpcUrl)
          const uri = metadataUri.trim()
          const onChainMeta = await hasMetaplexMetadataAccount(connection, mintAddr)
          const metaTx = onChainMeta
            ? buildUpdateMetadataTransaction({ mint: mintAddr, updateAuthority: wallet.publicKey, newName: resolvedName.slice(0, 32), newSymbol: resolvedSymbol.slice(0, 10), newUri: uri, sellerFeeBasisPoints })
            : buildCreateMetadataTransaction({ mint: mintAddr, name: resolvedName.slice(0, 32), symbol: resolvedSymbol.slice(0, 10), uri, updateAuthority: wallet.publicKey, payer: wallet.publicKey, sellerFeeBasisPoints })
          await sendAndConfirmTransaction(connection, metaTx, wallet, wallet.publicKey)
          const imageForSync = (payload.imageUrl !== undefined ? payload.imageUrl.trim() : (editMetadata.value?.image ?? '')) || null
          await invokeEdgeFunction(supabase, 'platform', {
            action: 'voucher-sync-mint-metadata',
            mint: mintAddr,
            name: resolvedName,
            symbol: resolvedSymbol,
            image: imageForSync,
          })
        }

        if (detail.value!.type === 'bundle') {
          await invokeEdgeFunction(supabase, 'platform', {
            action: 'bundle-voucher-update',
            mint: mintAddr,
            tokensRequired: payload.tokensRequired,
            maxRedemptionsPerTenant: payload.maxRedemptionsPerTenant ?? undefined,
          })
        } else {
          await invokeEdgeFunction(supabase, 'platform', {
            action: 'individual-voucher-update',
            mint: mintAddr,
            label: payload.label,
            maxRedemptionsPerTenant: payload.maxRedemptionsPerTenant ?? undefined,
            entitlements: payload.entitlements,
          })
        }
        editExpanded.value = false; editMetadata.value = null
        await loadDetail()
      } catch (e) {
        editError.value = e instanceof Error ? e.message : 'Failed to save'
      } finally { editSaving.value = false }
    })
    if (!exclusive.ok) return
  }

  watch(
    mint,
    async (m) => { if (m) await Promise.all([loadDetail(), loadMeters()]) },
    { immediate: true },
  )

  watch(mintDialogOpen, (open) => { if (open) mintAmount.value = 1 })
  watch(burnDialogOpen, (open) => { if (open) burnAmount.value = Math.min(1, parseInt(ourBalanceRaw.value, 10) || 1) })

  watch(
    [detail, mint],
    async ([d, m]) => {
      if (d && m) {
        const rpcUrl = useRpc().rpcUrl.value
        if (!rpcUrl) return
        try {
          const connection = createConnection(rpcUrl)
          const meta = await fetchMintMetadataFromChain(connection, m)
          editMetadata.value = { name: meta.name ?? '', symbol: meta.symbol ?? '', image: meta.image ?? null, sellerFeeBasisPoints: meta.sellerFeeBasisPoints ?? null }
        } catch { editMetadata.value = { name: '', symbol: '', image: null, sellerFeeBasisPoints: null } }
      } else { editMetadata.value = null }
    },
  )

  watch(
    [detail, () => auth.wallet.value],
    () => { if (detail.value && mint.value) { loadOurBalance(); loadHolders() } },
    { immediate: true },
  )

  return {
    detail, loading, error,
    ourBalanceRaw, ourBalanceLoading,
    holders, holdersLoading,
    editExpanded, editSaving, editError, editMetadata,
    mintLoading, burnLoading, mintDialogOpen, burnDialogOpen, mintAmount, burnAmount,
    meters,
    loadDetail, confirmMint, confirmBurn, saveEdit,
  }
}
