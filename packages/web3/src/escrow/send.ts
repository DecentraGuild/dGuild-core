import type { Connection } from '@solana/web3.js'
import { Transaction, type PublicKey } from '@solana/web3.js'
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

/**
 * Sets recent blockhash and fee payer on the transaction, optionally partialSigns with
 * extra signers, then signs with the wallet, optionally simulates, sends, and confirms.
 * Call this after building a transaction (builders no longer set blockhash/feePayer).
 *
 * When the wallet exposes signAndSendTransaction and there are no extra keypair signers,
 * that path is used instead so the wallet runs preflight simulation internally and can
 * display balance changes to the user (especially on mobile via MWA). Backpack omits that
 * hook in getEscrowWalletFromConnector because its sign-and-send broadcast often fails
 * while sign + sendRawTransaction via the app Connection succeeds.
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

  onStatus?.('signing')
  const signed = await wallet.signTransaction(transaction)
  for (const kp of signers) {
    signed.partialSign(kp)
  }
  if (simulate) {
    const sim = await connection.simulateTransaction(signed)
    if (sim.value.err) {
      const logs = sim.value.logs?.join('\n') ?? ''
      const msg = logs
        ? `Simulation failed:\n${logs}`
        : `Simulation failed: ${JSON.stringify(sim.value.err)}`
      throw new Error(msg)
    }
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
