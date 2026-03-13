import {
  Transaction,
  PublicKey,
  type Connection,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { createMemoInstruction } from '../escrow/memo.js'

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
const USDC_DECIMALS = 6

export interface BuildBillingTransferParams {
  payer: PublicKey
  amountUsdc: number
  /** The recipient's USDC token account (ATA). Pass explicitly; do not derive. */
  recipientAta: PublicKey
  memo: string
  connection: Connection
  /**
   * Instruction order. Default 'transferFirst' (TransferChecked then Memo).
   * Use 'memoFirst' for Backpack so the value-transfer is the second instruction;
   * some wallets show the first instruction as the "main" one and may display SOL otherwise.
   */
  instructionOrder?: 'transferFirst' | 'memoFirst'
}

/**
 * Build a USDC SPL transfer transaction with a memo instruction for billing.
 * Uses TransferChecked so the mint and decimals are in the instruction; wallets
 * (e.g. Phantom) can display "USDC" correctly. For Backpack, pass instructionOrder: 'memoFirst'.
 * Returns an unsigned transaction; caller signs via sendAndConfirmTransaction.
 */
export function buildBillingTransfer(params: BuildBillingTransferParams): Transaction {
  const { payer, amountUsdc, recipientAta, memo, instructionOrder = 'transferFirst' } = params

  const senderAta = getAssociatedTokenAddressSync(USDC_MINT, payer)

  const amount = BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS))

  const transferIx = createTransferCheckedInstruction(
    senderAta,
    USDC_MINT,
    recipientAta,
    payer,
    amount,
    USDC_DECIMALS,
    [],
    TOKEN_PROGRAM_ID,
  )
  const memoIx = createMemoInstruction(memo)

  const tx = new Transaction()
  if (instructionOrder === 'memoFirst') {
    tx.add(memoIx, transferIx)
  } else {
    tx.add(transferIx, memoIx)
  }

  return tx
}

export { USDC_MINT, USDC_DECIMALS }
