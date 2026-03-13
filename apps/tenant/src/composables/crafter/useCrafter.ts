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
  buildCreateMetadataTransaction,
  buildMintTransaction,
  buildBurnTransaction,
  buildUpdateMetadataTransaction,
  buildCloseMintTransaction,
  sendAndConfirmTransaction,
  getEscrowWalletFromConnector,
} from '@decentraguild/web3'
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
  authority: string
  created_at: string
}

export interface CrafterCreateForm {
  name: string
  symbol: string
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
      const { data, error } = await supabase.functions.invoke('crafter', {
        body: { action: 'list', tenantId: id },
        headers,
      })
      if (error) throw error
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

    createSubmitting.value = true
    createError.value = null
    createTxStatus.value = null

    try {
      const mintKeypair = Keypair.generate()
      const mintPubkey = mintKeypair.publicKey.toBase58()

      const headers = await getAuthHeaders()
      if (!headers) return { success: false, error: 'Sign in required' }
      const { data: createData, error: createErr } = await supabase.functions.invoke('crafter', {
        body: {
          action: 'create',
          tenantId: id,
          mint: mintPubkey,
          name: form.name.trim(),
          symbol: form.symbol.trim(),
          decimals: form.decimals,
        },
        headers,
      })

      if (createErr) throw createErr
      if (!createData?.memo || createData?.recipientAta == null) {
        throw new Error('Invalid response from crafter create')
      }

      const memo = createData.memo as string
      const amountUsdc = (createData.amountUsdc as number) ?? 5
      const recipientAta = new PublicKey(createData.recipientAta as string)

      const tx = await buildCreateMintAndBillingTransaction({
        mintKeypair,
        decimals: form.decimals,
        memo,
        amountUsdc,
        recipientAta,
        payer: wallet.publicKey,
        connection: conn,
      })

      const TX_LABELS: Record<string, string> = {
        signing: 'Signing...',
        sending: 'Sending...',
        confirming: 'Confirming...',
      }
      createTxStatus.value = 'Signing...'
      const txSignature = await sendAndConfirmTransaction(conn, tx, wallet, wallet.publicKey, {
        signers: [mintKeypair],
        onStatus: (s) => {
          createTxStatus.value = TX_LABELS[s] ?? s
        },
      })

      createTxStatus.value = 'Confirming payment...'
      const confirmHeaders = await getAuthHeaders()
      if (!confirmHeaders) throw new Error('Session expired')
      const { data: confirmData, error: confirmErr } = await supabase.functions.invoke('crafter', {
        body: {
          action: 'confirm',
          tenantId: id,
          mint: mintPubkey,
          txSignature,
          memo,
        },
        headers: confirmHeaders,
      })

      if (confirmErr) throw confirmErr
      if (!confirmData?.success) throw new Error('Confirm failed')

      createTxStatus.value = null
      createError.value = null
      await list()
      return { success: true, mint: mintPubkey }
    } catch (e) {
      createError.value = e instanceof Error ? e.message : 'Create failed'
      return { success: false, error: createError.value }
    } finally {
      createSubmitting.value = false
      createTxStatus.value = null
    }
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

    try {
      const name = (form.name?.trim() || token.name) || 'Token'
      const symbol = (form.symbol?.trim() || token.symbol) || 'TKN'
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
      const { data, error } = await supabase.functions.invoke('crafter', {
        body: {
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
        headers,
      })
      if (error) throw error
      if (!data?.success) throw new Error('Publish failed')

      await list()
      return { success: true }
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Publish metadata failed',
      }
    }
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

    try {
      const headers = await getAuthHeaders()
      if (!headers) return { error: 'Sign in required' }
      const { data, error } = await supabase.functions.invoke('crafter', {
        body: {
          action: 'prepare-metadata',
          tenantId: id,
          name: form.name.trim(),
          symbol: form.symbol.trim(),
          decimals: form.decimals,
          description: form.description.trim() || null,
          imageUrl: form.imageUrl.trim() || null,
          sellerFeeBasisPoints: form.sellerFeeBasisPoints,
        },
        headers,
      })
      if (error) throw error
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
      return { success: true }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Mint failed' }
    }
  }

  async function burn(mint: string, amountRaw: bigint): Promise<{ success: boolean; error?: string }> {
    const conn = connection.value
    const wallet = getEscrowWalletFromConnector()
    if (!conn || !wallet?.publicKey) {
      return { success: false, error: 'Connect your wallet' }
    }
    try {
      const ata = getAssociatedTokenAddressSync(new PublicKey(mint), wallet.publicKey)
      const tx = buildBurnTransaction({
        mint,
        account: ata,
        authority: wallet.publicKey,
        amount: amountRaw,
      })
      await sendAndConfirmTransaction(conn, tx, wallet, wallet.publicKey)
      return { success: true }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Burn failed' }
    }
  }

  async function editMetadata(
    mint: string,
    newName: string,
    newSymbol: string,
    newUri: string
  ): Promise<{ success: boolean; error?: string }> {
    const id = tenantId.value
    const conn = connection.value
    const wallet = getEscrowWalletFromConnector()
    if (!id || !conn || !wallet?.publicKey) {
      return { success: false, error: 'Connect your wallet' }
    }
    try {
      const tx = buildUpdateMetadataTransaction({
        mint,
        updateAuthority: wallet.publicKey,
        newName,
        newSymbol,
        newUri,
      })
      await sendAndConfirmTransaction(conn, tx, wallet, wallet.publicKey)
      const headers = await getAuthHeaders()
      if (headers) {
        await supabase.functions.invoke('crafter', {
          body: { action: 'update-metadata', tenantId: id, mint, name: newName, symbol: newSymbol, metadataUri: newUri },
          headers,
        })
      }
      await list()
      return { success: true }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Edit failed' }
    }
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
    try {
      const tx = buildCloseMintTransaction({
        mint,
        authority: wallet.publicKey,
        accountToClose,
        destination,
      })
      await sendAndConfirmTransaction(conn, tx, wallet, wallet.publicKey)
      return { success: true }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Close failed' }
    }
  }

  async function remove(mint: string): Promise<{ success: boolean; error?: string }> {
    const id = tenantId.value
    if (!id) return { success: false, error: 'No tenant' }
    try {
      const headers = await getAuthHeaders()
      if (!headers) return { success: false, error: 'Sign in required' }
      const { error } = await supabase.functions.invoke('crafter', {
        body: { action: 'remove', tenantId: id, mint },
        headers,
      })
      if (error) throw error
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
