import { Keypair, PublicKey } from '@solana/web3.js'
import { useAuth } from '@decentraguild/auth'
import {
  buildCreateMintOnlyTransaction,
  buildCreateMetadataTransaction,
  buildUpdateMetadataTransaction,
  hasMetaplexMetadataAccount,
  sendAndConfirmTransaction,
  getEscrowWalletFromConnector,
  createConnection,
} from '@decentraguild/web3'
import { useSupabase, invokeEdgeFunction, useSubmitInFlightLock } from '@decentraguild/nuxt-composables'
import { useRpc } from '~/composables/useRpc'
import { useTransactionNotificationsStore } from '~/stores/transactionNotifications'

export function useOpsVouchers() {
  const auth = useAuth()
  const toastStore = useTransactionNotificationsStore()
  const opsVoucherTxLock = useSubmitInFlightLock()

  const voucherWallet = computed(() => {
    const w = auth.wallet.value
    if (!w) return null
    return typeof w === 'string' ? w : (w as { toBase58?: () => string })?.toBase58?.() ?? null
  })

  const existingMintForDraft = ref('')
  const voucherDrafts = ref<Array<{ mint: string; created_at: string }>>([])
  const voucherLinked = ref<Array<{ mint: string; type: string; bundleId?: string; label?: string }>>([])
  const voucherMintLoading = ref(false)
  const voucherMintError = ref<string | null>(null)
  const voucherMintSuccess = ref<string | null>(null)

  const metadataModalMint = ref<string | null>(null)
  const metadataForm = reactive({
    type: 'bundle' as 'bundle' | 'individual',
    bundleId: '',
    name: '',
    symbol: '',
    imageUrl: '',
    sellerFeeBasisPoints: 0,
    label: '',
    tokensRequired: 1,
    maxRedemptionsPerTenant: null as number | null,
    entitlements: [] as Array<{ meter_key: string; quantity: number; duration_days: number }>,
  })
  const voucherMetadataLoading = ref<string | false>(false)
  const metadataFormError = ref<string | null>(null)

  watch(
    () => metadataForm.type,
    (type) => { if (type === 'individual' && metadataForm.entitlements.length === 0) addMetadataEntitlement() },
  )

  async function loadVoucherList() {
    try {
      const supabase = useSupabase()
      const r = await invokeEdgeFunction<{
        drafts?: Array<{ mint: string; created_at: string }>
        linked?: Array<{ mint: string; type: string; bundleId?: string; label?: string }>
      }>(supabase, 'platform', { action: 'voucher-list' })
      voucherDrafts.value = r.drafts ?? []
      voucherLinked.value = r.linked ?? []
    } catch {
      voucherDrafts.value = []
      voucherLinked.value = []
    }
  }

  function openMetadataModal(mint: string) {
    metadataModalMint.value = mint
    Object.assign(metadataForm, { type: 'bundle', bundleId: '', name: '', symbol: '', imageUrl: '', sellerFeeBasisPoints: 0, label: '', tokensRequired: 1, maxRedemptionsPerTenant: null, entitlements: [] })
    metadataFormError.value = null
  }

  function addMetadataEntitlement() {
    metadataForm.entitlements.push({ meter_key: '', quantity: 1, duration_days: 30 })
  }

  function removeMetadataEntitlement(i: number) {
    metadataForm.entitlements.splice(i, 1)
  }

  function isValidSolanaMint(mint: string): boolean {
    const trimmed = mint.trim()
    if (trimmed.length < 32 || trimmed.length > 44) return false
    return /^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)
  }

  async function createVoucherMint() {
    const wallet = getEscrowWalletFromConnector()
    const supabase = useSupabase()
    const { rpcUrl } = useRpc()
    if (!wallet?.publicKey || !rpcUrl.value) { voucherMintError.value = 'Connect wallet and ensure RPC is configured'; return }
    const exclusive = await opsVoucherTxLock.runExclusive(async () => {
      const toastId = `voucher-mint-${Date.now()}`
      toastStore.add(toastId, { status: 'pending', message: 'Creating mint…' })
      voucherMintLoading.value = true; voucherMintError.value = null; voucherMintSuccess.value = null
      try {
        const mintKeypair = Keypair.generate()
        const mint = mintKeypair.publicKey.toBase58()
        const connection = createConnection(rpcUrl.value)
        const tx = await buildCreateMintOnlyTransaction({ mintKeypair, decimals: 0, payer: wallet.publicKey, connection })
        const sig = await sendAndConfirmTransaction(connection, tx, wallet, wallet.publicKey, { signers: [mintKeypair] })
        await invokeEdgeFunction(supabase, 'platform', { action: 'voucher-register-draft', mint })
        toastStore.add(toastId, { status: 'success', message: `Mint created: ${mint.slice(0, 8)}…`, signature: sig })
        voucherMintSuccess.value = `Mint created: ${mint.slice(0, 8)}…`
        await loadVoucherList()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to create mint'
        voucherMintError.value = msg; toastStore.add(toastId, { status: 'error', message: msg })
      } finally { voucherMintLoading.value = false }
    })
    if (!exclusive.ok) return
  }

  async function registerExistingMintAsDraft(mint: string) {
    const supabase = useSupabase()
    if (!mint) { voucherMintError.value = 'Enter a mint address'; return }
    if (!isValidSolanaMint(mint)) { voucherMintError.value = 'Invalid mint: use a base58 address (32–44 characters)'; return }
    const toastId = `voucher-draft-${Date.now()}`
    toastStore.add(toastId, { status: 'pending', message: 'Adding mint as draft…' })
    voucherMintLoading.value = true; voucherMintError.value = null; voucherMintSuccess.value = null
    try {
      await invokeEdgeFunction(supabase, 'platform', { action: 'voucher-register-draft', mint: mint.trim() })
      toastStore.add(toastId, { status: 'success', message: `Mint added as draft: ${mint.slice(0, 8)}…` })
      voucherMintSuccess.value = `Mint added as draft: ${mint.slice(0, 8)}…`
      existingMintForDraft.value = ''
      await loadVoucherList()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add draft'
      voucherMintError.value = msg; toastStore.add(toastId, { status: 'error', message: msg })
    } finally { voucherMintLoading.value = false }
  }

  async function submitMetadataAndLink() {
    const mint = metadataModalMint.value
    if (!mint) return
    const wallet = getEscrowWalletFromConnector()
    const supabase = useSupabase()
    const { rpcUrl } = useRpc()
    if (!wallet?.publicKey || !rpcUrl.value) { metadataFormError.value = 'Connect wallet and ensure RPC is configured'; return }
    if (metadataForm.type === 'individual' && metadataForm.entitlements.length === 0) { metadataFormError.value = 'Add at least one entitlement'; return }
    if (metadataForm.type === 'bundle' && !metadataForm.bundleId?.trim()) { metadataFormError.value = 'Select a bundle'; return }

    const exclusive = await opsVoucherTxLock.runExclusive(async () => {
      const toastId = `voucher-metadata-${mint}-${Date.now()}`
      toastStore.add(toastId, { status: 'pending', message: 'Adding metadata & linking…' })
      voucherMetadataLoading.value = mint; metadataFormError.value = null
      try {
        const connection = createConnection(rpcUrl.value)
        const mintInfo = await connection.getAccountInfo(new PublicKey(mint))
        if (!mintInfo) throw new Error('Mint account not found on chain. Ensure the mint was created and confirmed.')

        const metaData = await invokeEdgeFunction<{ metadataUri?: string }>(supabase, 'platform', {
          action: 'voucher-prepare-metadata',
          mint,
          name: metadataForm.name.trim(),
          symbol: metadataForm.symbol.trim(),
          imageUrl: metadataForm.imageUrl?.trim() || undefined,
          sellerFeeBasisPoints: Math.max(0, Math.min(10000, metadataForm.sellerFeeBasisPoints ?? 0)),
          voucherType: metadataForm.type,
          bundleId: metadataForm.type === 'bundle' ? metadataForm.bundleId.trim() : undefined,
        })
        const metadataUri = metaData?.metadataUri
        if (!metadataUri || typeof metadataUri !== 'string' || !metadataUri.trim()) throw new Error('No metadata URI returned from server')
        const uri = metadataUri.trim()
        if (uri.length > 200) throw new Error('Metadata URI too long (max 200 chars). Use a shorter storage path.')

        const name = metadataForm.name.trim().slice(0, 32)
        const symbol = metadataForm.symbol.trim().slice(0, 10)
        const sellerFeeBasisPoints = Math.max(0, Math.min(10000, metadataForm.sellerFeeBasisPoints ?? 0))
        const metadataOnChain = await hasMetaplexMetadataAccount(connection, mint)
        const metaTx = metadataOnChain
          ? buildUpdateMetadataTransaction({ mint, updateAuthority: wallet.publicKey, newName: name, newSymbol: symbol, newUri: uri, sellerFeeBasisPoints })
          : buildCreateMetadataTransaction({ mint, name, symbol, uri, updateAuthority: wallet.publicKey, payer: wallet.publicKey, sellerFeeBasisPoints })
        const metaSig = await sendAndConfirmTransaction(connection, metaTx, wallet, wallet.publicKey)

        if (metadataForm.type === 'bundle') {
          await invokeEdgeFunction(supabase, 'platform', {
            action: 'voucher-create-bundle',
            mint,
            bundleId: metadataForm.bundleId.trim(),
            tokensRequired: metadataForm.tokensRequired,
            maxRedemptionsPerTenant: metadataForm.maxRedemptionsPerTenant ?? undefined,
          })
        } else {
          await invokeEdgeFunction(supabase, 'platform', {
            action: 'voucher-create-individual',
            mint,
            label: metadataForm.label?.trim() || undefined,
            maxRedemptionsPerTenant: metadataForm.maxRedemptionsPerTenant ?? undefined,
            entitlements: metadataForm.entitlements.filter((e) => e.meter_key?.trim()),
          })
        }

        await invokeEdgeFunction(supabase, 'platform', {
          action: 'voucher-sync-mint-metadata',
          mint,
          name: metadataForm.name.trim(),
          symbol: metadataForm.symbol.trim(),
          image: metadataForm.imageUrl?.trim() || null,
          metadataUri: uri,
          sellerFeeBasisPoints,
        })

        toastStore.add(toastId, { status: 'success', message: `${metadataOnChain ? 'Metadata updated' : 'Metadata created'} & voucher linked: ${mint.slice(0, 8)}…`, signature: metaSig })
        metadataModalMint.value = null
        await loadVoucherList()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to add metadata & link'
        metadataFormError.value = msg; toastStore.add(toastId, { status: 'error', message: msg })
      } finally { voucherMetadataLoading.value = false }
    })
    if (!exclusive.ok) return
  }

  return {
    voucherWallet, existingMintForDraft,
    voucherDrafts, voucherLinked, voucherMintLoading, voucherMintError, voucherMintSuccess,
    metadataModalMint, metadataForm, voucherMetadataLoading, metadataFormError,
    loadVoucherList, openMetadataModal, addMetadataEntitlement, removeMetadataEntitlement,
    createVoucherMint, registerExistingMintAsDraft, submitMetadataAndLink,
  }
}
