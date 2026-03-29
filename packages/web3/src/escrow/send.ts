import type { Connection } from '@solana/web3.js'
import { SendTransactionError, Transaction, type PublicKey } from '@solana/web3.js'
import type { Keypair } from '@solana/web3.js'
import type { Wallet } from './types.js'

export interface SendAndConfirmOptions {
  /** Run simulation before sending; throw on simulation error. Default true. */
  simulate?: boolean
  /** Called with status updates during the transaction lifecycle. */
  onStatus?: (status: 'signing' | 'sending' | 'confirming') => void
  /**
   * Extra signers (e.g. mint keypair for CreateMint). These are partialSigned before
   * the wallet signs. Use when the transaction requires signers the wallet doesn't control.
   */
  signers?: Keypair[]
}

type RpcSimulateResponse = {
  error?: { message: string; data?: { logs?: string[] } }
  result?: { value?: { err?: unknown; logs?: string[] | null } }
}

type ConnectionWithRpc = Connection & {
  _rpcRequest?: (method: string, args: unknown[]) => Promise<RpcSimulateResponse>
}

function looksLikeUserRejectedWalletSign(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return (
    msg.includes('user rejected') ||
    msg.includes('user denied') ||
    msg.includes('rejected the request') ||
    msg.includes('user cancelled') ||
    msg.includes('user canceled')
  )
}

function legacyWireToBase64(wire: Uint8Array): string {
  const u8 = wire instanceof Uint8Array ? wire : new Uint8Array(wire)
  let binary = ''
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]!)
  return btoa(binary)
}

function throwIfSimValueFailed(value: { err?: unknown; logs?: string[] | null } | undefined): void {
  if (!value?.err) return
  const logs = (value.logs ?? []).join('\n')
  const msg = logs
    ? `Simulation failed:\n${logs}`
    : `Simulation failed: ${JSON.stringify(value.err)}`
  throw new Error(msg)
}

/**
 * RPC `simulateTransaction` with `replaceRecentBlockhash` (legacy `Connection.simulateTransaction`
 * only passes that for `VersionedTransaction`). Used for unsigned preflight and for signed txs
 * after a wallet prompt so we do not hit "Blockhash not found" on a slightly stale hash.
 */
async function rpcSimulateLegacyWire(connection: Connection, wire: Uint8Array): Promise<void> {
  const rpc = (connection as ConnectionWithRpc)._rpcRequest
  if (!rpc) {
    const tx = Transaction.from(wire)
    const sim = await connection.simulateTransaction(tx)
    throwIfSimValueFailed(sim.value)
    return
  }

  const encoded = legacyWireToBase64(wire)
  const commitment = connection.commitment ?? 'confirmed'

  const unsafeRes = await rpc('simulateTransaction', [
    encoded,
    {
      encoding: 'base64',
      commitment,
      replaceRecentBlockhash: true,
      sigVerify: false,
    },
  ])

  if (unsafeRes.error) {
    const logs = unsafeRes.error.data?.logs
    throw new SendTransactionError({
      action: 'simulate',
      signature: '',
      transactionMessage: unsafeRes.error.message,
      logs: logs ?? undefined,
    })
  }

  throwIfSimValueFailed(unsafeRes.result?.value)
}

async function simulateUnsignedLegacyTransaction(
  connection: Connection,
  transaction: Transaction
): Promise<void> {
  const wire = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  })
  await rpcSimulateLegacyWire(connection, wire)
}

async function simulateSignedLegacyTransaction(
  connection: Connection,
  signed: Transaction
): Promise<void> {
  const wire = signed.serialize()
  await rpcSimulateLegacyWire(connection, wire)
}

/**
 * Sets recent blockhash and fee payer on the transaction, optionally partialSigns with
 * extra signers, then signs with the wallet, optionally simulates, sends, and confirms.
 * Call this after building a transaction (builders no longer set blockhash/feePayer).
 *
 * **Wallet Standard / ConnectorKit:** `createTransactionSigner` serializes your tx and calls
 * the wallet with `transactions: [bytes]` first (then falls back to singular `transaction`).
 * Some wallets render that one-element array like a nested or “batch” transaction — that is
 * upstream behavior, not an extra instruction in your transaction.
 *
 * When `wallet.signAndSendTransaction` exists and there are no extra keypair signers, we delegate
 * broadcast to the wallet (Phantom, Solflare, …). Backpack omits that hook in
 * `getEscrowWalletFromConnector` and uses sign + `sendRawTransaction` plus RPC simulation here.
 * If sign-and-send throws for non-user-reject reasons (e.g. some Ledger paths), we fall back to
 * sign + `sendRawTransaction` the same way.
 */
export async function sendAndConfirmTransaction(
  connection: Connection,
  transaction: Transaction,
  wallet: Wallet,
  feePayer: PublicKey,
  options: SendAndConfirmOptions = {}
): Promise<string> {
  const { simulate = true, onStatus, signers = [] } = options
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  transaction.recentBlockhash = blockhash
  transaction.feePayer = feePayer
  if (lastValidBlockHeight != null) {
    ;(transaction as Transaction & { lastValidBlockHeight?: number }).lastValidBlockHeight =
      lastValidBlockHeight
  }

  if (simulate) {
    await simulateUnsignedLegacyTransaction(connection, transaction)
  }

  if (typeof wallet.signAndSendTransaction === 'function' && signers.length === 0) {
    onStatus?.('signing')
    try {
      const sig = await wallet.signAndSendTransaction(transaction)
      onStatus?.('confirming')
      await connection.confirmTransaction(sig)
      return sig
    } catch (e) {
      if (looksLikeUserRejectedWalletSign(e)) throw e
      // Ledger / some extensions: sign-and-send fails even when `signAndSend` exists; use sign + RPC send.
    }
  }

  const { blockhash: signBlockhash, lastValidBlockHeight: signLastValid } =
    await connection.getLatestBlockhash()
  transaction.recentBlockhash = signBlockhash
  if (signLastValid != null) {
    ;(transaction as Transaction & { lastValidBlockHeight?: number }).lastValidBlockHeight =
      signLastValid
  }

  onStatus?.('signing')
  const signed = await wallet.signTransaction(transaction)
  for (const kp of signers) {
    signed.partialSign(kp)
  }
  if (simulate) {
    await simulateSignedLegacyTransaction(connection, signed)
  }
  try {
    onStatus?.('sending')
    const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false })
    onStatus?.('confirming')
    await connection.confirmTransaction(sig)
    return sig
  } catch (sendErr: unknown) {
    if (sendErr instanceof Error) {
      const errObj = sendErr as Error & { logs?: string[]; data?: { logs?: string[] } }
      const logs = errObj.logs ?? errObj.data?.logs
      if (Array.isArray(logs) && logs.length) {
        errObj.message = `${errObj.message}\n${logs.join('\n')}`
      }
      throw errObj
    }
    throw sendErr
  }
}
