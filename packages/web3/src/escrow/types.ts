import type { PublicKey } from '@solana/web3.js'
import type { Transaction, VersionedTransaction } from '@solana/web3.js'

/** Anchor-compatible wallet interface for escrow transactions */
export interface Wallet {
  publicKey: PublicKey
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>
  /**
   * Optional: sign and send in one operation (wallet handles preflight + broadcast).
   * When present, sendAndConfirmTransaction uses this path so the wallet can display
   * balance changes (preflight simulation) before the user confirms — important on mobile.
   * Only used when there are no extra keypair signers.
   */
  signAndSendTransaction?(tx: Transaction | VersionedTransaction): Promise<string>
}
