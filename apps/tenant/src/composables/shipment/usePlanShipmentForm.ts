/**
 * Form logic for Plan Shipment: JSON parsing, balance refresh, register, ship.
 */
import type { Ref } from 'vue'
import { ref, computed, watch } from 'vue'
import { formatRawTokenAmount } from '@decentraguild/display'
import {
  compressAndSend,
  REGISTER_ALREADY_DONE,
  registerMintForCompression,
} from '@decentraguild/shipment'
import { fetchMintMetadataFromChain } from '@decentraguild/web3'
import { getAssociatedTokenAddressSync, getAccount } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import type { Connection } from '@solana/web3.js'

export const JSON_PLACEHOLDER = '{"mint":"...","recipients":[{"address":"...","amount":100}]}'

export interface LoadedShipmentJson {
  mint: string
  recipients: Array<{ address: string; amount: number }>
  totalAmount?: number
}

function parseShipmentJson(raw: string): LoadedShipmentJson | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed) as {
      mint?: string
      recipients?: Array<{ address: string; amount: number }>
      totalAmount?: number
    }
    if (parsed.mint && Array.isArray(parsed.recipients)) {
      return {
        mint: parsed.mint,
        recipients: parsed.recipients,
        ...(parsed.totalAmount != null && { totalAmount: parsed.totalAmount }),
      }
    }
  } catch {
    // ignore
  }
  return null
}

export interface UsePlanShipmentFormOptions {
  connection: Ref<Connection | null>
  rpcUrl: Ref<string>
  tenantId: Ref<string | undefined>
  shipWalletAddress: Ref<string | null>
  hasWallet: Ref<boolean>
  getKeypair: () => Promise<{ publicKey: PublicKey } | null>
  recordShipment: (params: {
    mint: string
    recipientCount: number
    totalAmount: number
    txSignature: string
    leaves?: Array<{
      recipientWallet: string
      leafHashDecimal: string
      amountRaw: string
    }>
  }) => Promise<unknown>
}

export function usePlanShipmentForm(options: UsePlanShipmentFormOptions) {
  const {
    connection,
    rpcUrl,
    tenantId: _tenantId,
    shipWalletAddress,
    hasWallet,
    getKeypair,
    recordShipment,
  } = options

  const importKey = ref('')
  const jsonInput = ref('')
  const loadedJson = ref<LoadedShipmentJson | null>(null)
  const solBalance = ref<string | null>(null)
  const tokenBalance = ref<string | null>(null)
  const balanceLoading = ref(false)
  const shipping = ref(false)
  const registering = ref(false)
  const registerMessage = ref<string | null>(null)
  const shipError = ref<string | null>(null)
  const mintRegistered = ref(false)

  const mint = computed(() => loadedJson.value?.mint ?? null)

  watch(mint, () => {
    mintRegistered.value = false
  })

  const totalAmount = computed(() => {
    const j = loadedJson.value
    if (!j) return 0
    if (j.totalAmount != null) return j.totalAmount
    return j.recipients.reduce((sum, r) => sum + r.amount, 0)
  })

  const canShip = computed(
    () =>
      connection.value &&
      loadedJson.value &&
      loadedJson.value.recipients.length > 0 &&
      hasWallet.value &&
      mintRegistered.value &&
      !shipping.value
  )

  const canRegisterMint = computed(
    () =>
      connection.value &&
      loadedJson.value?.mint &&
      hasWallet.value &&
      !registering.value &&
      !shipping.value
  )

  function setJson(data: LoadedShipmentJson) {
    jsonInput.value = JSON.stringify(data, null, 2)
  }

  watch(jsonInput, (v) => {
    loadedJson.value = parseShipmentJson(v)
  })

  async function refreshBalance() {
    const conn = connection.value
    const addr = shipWalletAddress.value
    if (!conn || !addr) return
    balanceLoading.value = true
    try {
      const sol = await conn.getBalance(new PublicKey(addr)).then((r) => (r / 1e9).toFixed(4))
      solBalance.value = sol
      if (mint.value && conn) {
        try {
          const ata = getAssociatedTokenAddressSync(
            new PublicKey(mint.value),
            new PublicKey(addr)
          )
          const acc = await getAccount(conn, ata)
          const meta = await fetchMintMetadataFromChain(conn, mint.value)
          const decimals = meta?.decimals != null && Number.isFinite(meta.decimals) ? meta.decimals : null
          tokenBalance.value = formatRawTokenAmount(acc.amount.toString(), decimals, 'SPL')
        } catch {
          tokenBalance.value = '0'
        }
      } else {
        tokenBalance.value = null
      }
    } catch {
      solBalance.value = null
      tokenBalance.value = null
    } finally {
      balanceLoading.value = false
    }
  }

  async function registerMint() {
    const conn = connection.value
    const json = loadedJson.value
    const kp = await getKeypair()
    if (!conn || !json?.mint || !kp) return
    registering.value = true
    shipError.value = null
    registerMessage.value = null
    try {
      const result = await registerMintForCompression({
        connection: conn,
        payer: kp,
        mint: json.mint,
        rpcUrl: rpcUrl.value || undefined,
        createPayerAta: true,
      })
      mintRegistered.value = true
      if (result === REGISTER_ALREADY_DONE) {
        registerMessage.value = 'Mint already registered. Proceed to Ship.'
      } else {
        registerMessage.value = 'Mint registered. Proceed to Ship.'
      }
    } catch (e) {
      shipError.value = e instanceof Error ? e.message : 'Register failed'
    } finally {
      registering.value = false
    }
  }

  async function ship(onSuccess?: () => Promise<void>) {
    const conn = connection.value
    const json = loadedJson.value
    const kp = await getKeypair()
    if (!conn || !json || !kp) return
    shipping.value = true
    shipError.value = null
    registerMessage.value = null
    try {
      const meta = await fetchMintMetadataFromChain(conn, json.mint)
      const decimals = meta?.decimals != null && Number.isFinite(meta.decimals) ? meta.decimals : null
      if (decimals == null) throw new Error('Could not fetch token decimals from chain')
      const shipResult = await compressAndSend({
        connection: conn,
        payer: kp,
        mint: json.mint,
        recipients: json.recipients,
        decimals,
        rpcUrl: rpcUrl.value || undefined,
      })
      await recordShipment({
        mint: json.mint,
        recipientCount: json.recipients.length,
        totalAmount: totalAmount.value,
        txSignature: shipResult.txSignature,
        ...(shipResult.leavesComplete && shipResult.leaves.length > 0
          ? { leaves: shipResult.leaves }
          : {}),
      })
      if (!shipResult.leavesComplete) {
        registerMessage.value =
          'Shipment recorded. Claim leaf ids were not captured yet (indexer delay); recipients can still claim from wallet balances.'
      }
      loadedJson.value = null
      jsonInput.value = ''
      await refreshBalance()
      await onSuccess?.()
    } catch (e) {
      shipError.value = e instanceof Error ? e.message : 'Ship failed'
    } finally {
      shipping.value = false
    }
  }

  return {
    importKey,
    jsonInput,
    loadedJson,
    mint,
    totalAmount,
    canShip,
    canRegisterMint,
    solBalance,
    tokenBalance,
    balanceLoading,
    shipping,
    registering,
    registerMessage,
    shipError,
    setJson,
    refreshBalance,
    registerMint,
    ship,
  }
}
