/**
 * Crafter composable: list tokens, create (single-tx flow), update metadata, mint, burn, edit, close.
 * Admin-only. Requires tenant admin auth.
 */

import { ref, computed } from 'vue'
import { Keypair, PublicKey, Transaction } from '@solana/web3.js'
import {
  getMint,
  getAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
  buildCreateMintAndBillingTransaction,
  buildCreateMintWithMemoTransaction,
  buildCreateMetadataTransaction,
  buildMintTransaction,
  buildBurnTransaction,
  buildUpdateMetadataTransaction,
  buildCloseMintTransaction,
  sendAndConfirmTransaction,
  getEscrowWalletFromConnector,
  metaplexTokenSymbolValidationError,
} from '@decentraguild/web3'
import { invokeEdgeFunction, useSubmitInFlightLock } from '@decentraguild/nuxt-composables'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantStore } from '~/stores/tenant'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'

export interface CrafterToken {
  id: number
  mint: string
  name: string
  symbol: string
  decimals: number
  description: string | null
  image_url: string | null
  metadata_uri: string
  storage_backend?: 'api' | 'selfhost'
  seller_fee_basis_points?: number
  authority: string
  created_at: string
}

export interface CrafterCreateForm {
  decimals: number | string
}

export interface CrafterPublishMetadataForm {
  metadataUri: string
  name?: string
  symbol?: string
  description?: string
  imageUrl?: string
  sellerFeeBasisPoints?: number
}

export function useCrafter() {
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId)
  const { connection } = useSolanaConnection()
  const supabase = useSupabase()

  const tokens = ref<CrafterToken[]>([])
  const loading = ref(false)
  const createSubmitting = ref(false)
  const createError = ref<string | null>(null)
  const createTxStatus = ref<string | null>(null)
  const crafterTxLock = useSubmitInFlightLock()

  const TX_BUSY = 'Please wait for the current transaction to finish'

  async function getAuthHeaders(): Promise<Record<string, string> | null> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return null
    return { Authorization: `Bearer ${session.access_token}` }
  }

  async function list() {
    const id = tenantId.value
    if (!id) return
    loading.value = true
    try {
      const headers = await getAuthHeaders()
      if (!headers) throw new Error('Sign in required')
      const data = await invokeEdgeFunction<{ tokens?: Array<Record<string, unknown>> }>(
        supabase,
        'crafter',
        { action: 'list', tenantId: id },
        { headers },
      )
      tokens.value = (data?.tokens ?? []).map((t: Record<string, unknown>) => ({
        id: t.id as number,
        mint: t.mint as string,
        name: (t.name as string) ?? '',
        symbol: (t.symbol as string) ?? '',
        decimals: (t.decimals as number) ?? 6,
        description: (t.description as string) ?? null,
        image_url: (t.image_url as string) ?? null,
        metadata_uri: (t.metadata_uri as string) ?? '',
        authority: (t.authority as string) ?? '',
        created_at: (t.created_at as string) ?? '',
      }))
    } catch (e) {
      tokens.value = []
      throw e
    } finally {
      loading.value = false
    }
  }

  async function create(form: CrafterCreateForm): Promise<{ success: boolean; mint?: string; error?: string }> {
    const id = tenantId.value
    const conn = connection.value
    const wallet = getEscrowWalletFromConnector()
    if (!id || !conn || !wallet?.publicKey) {
      return { success: false, error: 'Connect your wallet and ensure you are signed in' }
    }

    const exclusive = await crafterTxLock.runExclusive(async () => {
      createSubmitting.value = true
      createError.value = null
      createTxStatus.value = 'Getting quote...'

      try {
        const currentCount = tokens.value.length
        const quoteData = await invokeEdgeFunction<{ quoteId?: string; priceUsdc?: number }>(
          supabase,
          'billing',
          {
            action: 'quote',
            tenantId: id,
            productKey: 'crafter',
            meterOverrides: { crafter_tokens: currentCount + 1 },
          },
          { errorFallback: 'Quote failed' },
        )
        const quote = quoteData
        if (!quote?.quoteId) throw new Error('No quote returned')

        createTxStatus.value = 'Charging...'
        const payerWallet = wallet.publicKey.toBase58()
        const chargeData = await invokeEdgeFunction<{ paymentId?: string; amountUsdc?: number; memo?: string; recipientAta?: string }>(
          supabase,
          'billing',
          {
            action: 'charge',
            quoteId: quote.quoteId,
            payerWallet,
            paymentMethod: 'usdc',
          },
          { errorFallback: 'Charge failed' },
        )
        const charge = chargeData
        if (!charge?.paymentId || !charge?.memo) throw new Error('Invalid charge response')
        const amountUsdc = charge.amountUsdc ?? 0
        if (amountUsdc > 0 && !charge.recipientAta) throw new Error('Invalid charge response')

        const mintKeypair = Keypair.generate()
        const decimals = typeof form.decimals === 'number' ? form.decimals : parseInt(String(form.decimals), 10) || 6
        const headers = await getAuthHeaders()
        if (!headers) throw new Error('Sign in required')

        createTxStatus.value = 'Creating pending...'
        await invokeEdgeFunction(
          supabase,
          'crafter',
          {
            action: 'create',
            tenantId: id,
            mint: mintKeypair.publicKey.toBase58(),
            decimals,
            memo: charge.memo,
          },
          { headers, errorFallback: 'Create pending failed' },
        )

        createTxStatus.value = 'Sending transaction...'
        const tx =
          amountUsdc > 0
            ? await buildCreateMintAndBillingTransaction({
                mintKeypair,
                decimals,
                memo: charge.memo,
                amountUsdc,
                recipientAta: new PublicKey(charge.recipientAta as string),
                payer: wallet.publicKey,
                connection: conn,
              })
            : await buildCreateMintWithMemoTransaction({
                mintKeypair,
                decimals,
                memo: charge.memo,
                payer: wallet.publicKey,
                connection: conn,
              })
        const txSignature = await sendAndConfirmTransaction(conn, tx, wallet, wallet.publicKey, {
          signers: [mintKeypair],
        })

        createTxStatus.value = 'Confirming payment...'
        await invokeEdgeFunction(
          supabase,
          'billing',
          { action: 'confirm', paymentId: charge.paymentId, txSignature },
          { errorFallback: 'Confirm failed' },
        )

        createTxStatus.value = 'Confirming token...'
        await invokeEdgeFunction(
          supabase,
          'crafter',
          {
            action: 'confirm',
            tenantId: id,
            mint: mintKeypair.publicKey.toBase58(),
            txSignature,
            memo: charge.memo,
          },
          { headers, errorFallback: 'Token confirm failed' },
        )

        await list()
        return { success: true, mint: mintKeypair.publicKey.toBase58() } as const
      } catch (e) {
        createError.value = e instanceof Error ? e.message : 'Create failed'
        return { success: false, error: createError.value }
      } finally {
        createSubmitting.value = false
        createTxStatus.value = null
      }
    })
    if (!exclusive.ok) return { success: false, error: TX_BUSY }
    return exclusive.value
  }

  async function publishMetadata(
    mint: string,
    form: CrafterPublishMetadataForm,
  ): Promise<{ success: boolean; error?: string }> {
    const id = tenantId.value
    const conn = connection.value
    const wallet = getEscrowWalletFromConnector()
    if (!id || !conn || !wallet?.publicKey) {
      return { success: false, error: 'Connect your wallet and ensure you are signed in' }
    }

    const token = tokens.value.find((t) => t.mint === mint)
    if (!token) return { success: false, error: 'Token not found' }

    const name = (form.name?.trim() || token.name) || 'Token'
    const symbol = (form.symbol?.trim() || token.symbol) || 'TKN'
    const symErr = metaplexTokenSymbolValidationError(symbol)
    if (symErr) return { success: false, error: symErr }

    const exclusive = await crafterTxLock.runExclusive(async () => {
      try {
        const tx = buildCreateMetadataTransaction({
          mint,
          name,
          symbol,
          uri: form.metadataUri.trim(),
          updateAuthority: wallet.publicKey,
          payer: wallet.publicKey,
          sellerFeeBasisPoints: form.sellerFeeBasisPoints,
        })
        await sendAndConfirmTransaction(conn, tx, wallet, wallet.publicKey)

        const headers = await getAuthHeaders()
        if (!headers) throw new Error('Sign in required')
        const data = await invokeEdgeFunction<{ success?: boolean }>(
          supabase,
          'crafter',
          {
            action: 'publish-metadata',
            tenantId: id,
            mint,
            metadataUri: form.metadataUri.trim(),
            name: form.name?.trim() || null,
            symbol: form.symbol?.trim() || null,
            description: form.description?.trim() || null,
            imageUrl: form.imageUrl?.trim() || null,
            sellerFeeBasisPoints: form.sellerFeeBasisPoints,
          },
          { headers },
        )
        if (!data?.success) throw new Error('Publish failed')

        await list()
        return { success: true } as const
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Publish metadata failed',
        }
      }
    })
    if (!exclusive.ok) return { success: false, error: TX_BUSY }
    return exclusive.value
  }

  async function prepareMetadata(form: {
    name: string
    symbol: string
    decimals: number
    description: string
    imageUrl: string
    sellerFeeBasisPoints: number
  }): Promise<{ metadataUri?: string; error?: string }> {
    const id = tenantId.value
    if (!id) return { error: 'No tenant' }

    const prepSymErr = metaplexTokenSymbolValidationError(form.symbol.trim())
    if (prepSymErr) return { error: prepSymErr }

    try {
      const headers = await getAuthHeaders()
      if (!headers) return { error: 'Sign in required' }
      const data = await invokeEdgeFunction<{ metadataUri?: string }>(
        supabase,
        'crafter',
        {
          action: 'prepare-metadata',
          tenantId: id,
          name: form.name.trim(),
          symbol: form.symbol.trim(),
          decimals: form.decimals,
          description: form.description.trim() || null,
          imageUrl: form.imageUrl.trim() || null,
          sellerFeeBasisPoints: form.sellerFeeBasisPoints,
        },
        { headers },
      )
      const uri = data?.metadataUri as string | undefined
      if (!uri) throw new Error('No metadata URI returned')
      return { metadataUri: uri }
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : 'Upload failed',
      }
    }
  }

  async function fetchSupplyAndBalance(
    mint: string,
    decimals: number,
    walletAddress: string | null
  ): Promise<{ supply: string; walletBalance: string; ataExists: boolean }> {
    const conn = connection.value
    if (!conn) return { supply: '?', walletBalance: '?', ataExists: false }
    try {
      const mintPk = new PublicKey(mint)
      const mintInfo = await getMint(conn, mintPk)
      const supply = mintInfo.supply.toString()
      let walletBalance = '0'
      let ataExists = false
      if (walletAddress) {
        try {
          const ata = getAssociatedTokenAddressSync(mintPk, new PublicKey(walletAddress))
          const acc = await getAccount(conn, ata)
          walletBalance = acc.amount.toString()
          ataExists = true
        } catch {
          /* ATA may not exist (closed or never created) */
        }
      }
      return { supply, walletBalance, ataExists }
    } catch {
      return { supply: '?', walletBalance: '?', ataExists: false }
    }
  }

  async function mint(
    mint: string,
    destinationWallet: string,
    amountRaw: bigint
  ): Promise<{ success: boolean; error?: string }> {
    const conn = connection.value
    const wallet = getEscrowWalletFromConnector()
    if (!conn || !wallet?.publicKey) {
      return { success: false, error: 'Connect your wallet' }
    }
    const exclusive = await crafterTxLock.runExclusive(async () => {
      try {
        const mintPk = new PublicKey(mint)
        const destPk = new PublicKey(destinationWallet)
        const ata = getAssociatedTokenAddressSync(mintPk, destPk)
        const instructions = []
        try {
          await getAccount(conn, ata)
        } catch {
          instructions.push(
            createAssociatedTokenAccountInstruction(
              wallet.publicKey,
              ata,
              destPk,
              mintPk,
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID
            )
          )
        }
        const mintTx = buildMintTransaction({
          mint,
          destination: ata,
          authority: wallet.publicKey,
          amount: amountRaw,
        })
        const tx = new Transaction()
        tx.add(...instructions, ...mintTx.instructions)
        await sendAndConfirmTransaction(conn, tx, wallet, wallet.publicKey)
        return { success: true } as const
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Mint failed' }
      }
    })
    if (!exclusive.ok) return { success: false, error: TX_BUSY }
    return exclusive.value
  }

  async function burn(mint: string, amountRaw: bigint): Promise<{ success: boolean; error?: string }> {
    const conn = connection.value
    const wallet = getEscrowWalletFromConnector()
    if (!conn || !wallet?.publicKey) {
      return { success: false, error: 'Connect your wallet' }
    }
    const exclusive = await crafterTxLock.runExclusive(async () => {
      try {
        const ata = getAssociatedTokenAddressSync(new PublicKey(mint), wallet.publicKey)
        const tx = buildBurnTransaction({
          mint,
          account: ata,
          authority: wallet.publicKey,
          amount: amountRaw,
        })
        await sendAndConfirmTransaction(conn, tx, wallet, wallet.publicKey)
        return { success: true } as const
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Burn failed' }
      }
    })
    if (!exclusive.ok) return { success: false, error: TX_BUSY }
    return exclusive.value
  }

  async function editMetadata(
    mint: string,
    form: {
      name: string
      symbol: string
      description?: string
      imageUrl?: string
      sellerFeeBasisPoints?: number
      metadataUri: string
    }
  ): Promise<{ success: boolean; error?: string }> {
    const id = tenantId.value
    const conn = connection.value
    const wallet = getEscrowWalletFromConnector()
    if (!id || !conn || !wallet?.publicKey) {
      return { success: false, error: 'Connect your wallet' }
    }
    const name = form.name.trim()
    const symbol = form.symbol.trim()
    const uri = form.metadataUri.trim()
    if (!name || !symbol || !uri) {
      return { success: false, error: 'Name, symbol, and metadata URI required' }
    }
    const editSymErr = metaplexTokenSymbolValidationError(symbol)
    if (editSymErr) return { success: false, error: editSymErr }
    const exclusive = await crafterTxLock.runExclusive(async () => {
      try {
        const tx = buildUpdateMetadataTransaction({
          mint,
          updateAuthority: wallet.publicKey,
          newName: name,
          newSymbol: symbol,
          newUri: uri,
          sellerFeeBasisPoints: form.sellerFeeBasisPoints,
        })
        await sendAndConfirmTransaction(conn, tx, wallet, wallet.publicKey)
        const headers = await getAuthHeaders()
        if (headers) {
          await invokeEdgeFunction(
            supabase,
            'crafter',
            {
              action: 'update-metadata',
              tenantId: id,
              mint,
              name,
              symbol,
              description: form.description?.trim() || null,
              imageUrl: form.imageUrl?.trim() || null,
              sellerFeeBasisPoints: form.sellerFeeBasisPoints ?? 0,
              metadataUri: uri,
            },
            { headers },
          )
        }
        await list()
        return { success: true } as const
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Edit failed' }
      }
    })
    if (!exclusive.ok) return { success: false, error: TX_BUSY }
    return exclusive.value
  }

  async function closeAccount(
    mint: string,
    accountToClose: string,
    destination: string
  ): Promise<{ success: boolean; error?: string }> {
    const conn = connection.value
    const wallet = getEscrowWalletFromConnector()
    if (!conn || !wallet?.publicKey) {
      return { success: false, error: 'Connect your wallet' }
    }
    const exclusive = await crafterTxLock.runExclusive(async () => {
      try {
        const tx = buildCloseMintTransaction({
          mint,
          authority: wallet.publicKey,
          accountToClose,
          destination,
        })
        await sendAndConfirmTransaction(conn, tx, wallet, wallet.publicKey)
        return { success: true } as const
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Close failed' }
      }
    })
    if (!exclusive.ok) return { success: false, error: TX_BUSY }
    return exclusive.value
  }

  async function remove(mint: string): Promise<{ success: boolean; error?: string }> {
    const id = tenantId.value
    if (!id) return { success: false, error: 'No tenant' }
    try {
      const headers = await getAuthHeaders()
      if (!headers) return { success: false, error: 'Sign in required' }
      await invokeEdgeFunction(supabase, 'crafter', { action: 'remove', tenantId: id, mint }, { headers })
      tokens.value = tokens.value.filter((t) => t.mint !== mint)
      return { success: true }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Remove failed' }
    }
  }

  return {
    tokens,
    loading,
    createSubmitting,
    createError,
    createTxStatus,
    list,
    create,
    publishMetadata,
    prepareMetadata,
    fetchSupplyAndBalance,
    mint,
    burn,
    editMetadata,
    closeAccount,
    remove,
  }
}
