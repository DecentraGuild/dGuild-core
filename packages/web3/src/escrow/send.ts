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

function legacySignedWireToBase64(wire: Uint8Array): string {
  const u8 = wire instanceof Uint8Array ? wire : new Uint8Array(wire)
  let binary = ''
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]!)
  return btoa(binary)
}

/**
 * Legacy `Transaction` + `Connection.simulateTransaction` does not support
 * `replaceRecentBlockhash` (only the `VersionedTransaction` overload does). After the user
 * spends time in the wallet, the signed message's blockhash can be unknown → "Blockhash not
 * found". This calls the same RPC the wallet would use for simulation, with a fresh blockhash
 * for the sim only (`sigVerify: false` so the stale hash in signatures is acceptable).
 */
async function simulateSignedLegacyTransaction(
  connection: Connection,
  signed: Transaction
): Promise<void> {
  const rpc = (connection as ConnectionWithRpc)._rpcRequest
  if (!rpc) {
    const sim = await connection.simulateTransaction(signed)
    if (sim.value.err) {
      const logs = sim.value.logs?.join('\n') ?? ''
      const msg = logs
        ? `Simulation failed:\n${logs}`
        : `Simulation failed: ${JSON.stringify(sim.value.err)}`
      throw new Error(msg)
    }
    return
  }

  const wire = signed.serialize()
  const encoded = legacySignedWireToBase64(wire)
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

  const value = unsafeRes.result?.value
  if (value?.err) {
    const logs = (value.logs ?? []).join('\n')
    const msg = logs
      ? `Simulation failed:\n${logs}`
      : `Simulation failed: ${JSON.stringify(value.err)}`
    throw new Error(msg)
  }
}

/**
 * Sets recent blockhash and fee payer on the transaction, optionally partialSigns with
 * extra signers, then signs with the wallet, optionally simulates, sends, and confirms.
 * Call this after building a transaction (builders no longer set blockhash/feePayer).
 *
 * **ConnectorKit / Wallet Standard:** When `wallet.signAndSendTransaction` exists (from
 * `createTransactionSigner` → `solana:signAndSendTransaction`) and there are no extra keypair
 * signers, we delegate broadcast to the wallet so it can run preflight and show balance
 * changes before confirmation — same path Phantom/Solflare/Backpack expose when `canSend`.
 *
 * Otherwise we `signTransaction` and send via this `Connection`; blockhash is refreshed
 * immediately before opening the wallet to limit expiry, and post-sign simulation uses RPC
 * `replaceRecentBlockhash` (see `simulateSignedLegacyTransaction`).
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

  // When wallet can sign-and-send and there are no extra keypair signers, delegate fully to
  // the wallet so it runs preflight simulation and shows balance changes before confirmation.
  if (typeof wallet.signAndSendTransaction === 'function' && signers.length === 0) {
    onStatus?.('signing')
    const sig = await wallet.signAndSendTransaction(transaction)
    onStatus?.('confirming')
    await connection.confirmTransaction(sig)
    return sig
  }

  // Refresh blockhash immediately before the wallet prompt — the signed message will carry
  // this hash through to send; minimizing time from fetch → sign → submit reduces expiry.
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
