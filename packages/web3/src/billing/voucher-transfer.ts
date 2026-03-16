/**
 * Voucher token transfer for billing redemption.
 */
import {
  Transaction,
  PublicKey,
  type Connection,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { createMemoInstruction } from '../escrow/memo.js'

export interface BuildVoucherTransferParams {
  payer: PublicKey
  mint: PublicKey | string
  amount: number
  decimals: number
  recipientAta: PublicKey | string
  /** Owner of the recipient ATA (voucher wallet). Required when connection is provided for create-if-needed */
  recipientOwner?: PublicKey | string
  memo: string
  /** Pass to add createAssociatedTokenAccountInstruction when recipient ATA does not exist */
  connection?: Connection
  instructionOrder?: 'transferFirst' | 'memoFirst'
}

/**
 * Build a voucher SPL token transfer with memo for billing redemption.
 * Uses TransferChecked. Optionally adds createAssociatedTokenAccountInstruction when connection
 * is provided and recipient ATA does not exist.
 */
export async function buildVoucherTransfer(
  params: BuildVoucherTransferParams,
): Promise<Transaction> {
  const {
    payer,
    mint,
    amount,
    decimals,
    recipientAta,
    recipientOwner,
    memo,
    connection,
    instructionOrder = 'transferFirst',
  } = params

  const mintKey = typeof mint === 'string' ? new PublicKey(mint) : mint
  const recipientAtaKey =
    typeof recipientAta === 'string' ? new PublicKey(recipientAta) : recipientAta

  const senderAta = getAssociatedTokenAddressSync(mintKey, payer)
  const amountBigInt = BigInt(Math.floor(amount))

  const instructions: Parameters<Transaction['add']>[0][] = []

  if (connection && recipientOwner) {
    const ownerKey =
      typeof recipientOwner === 'string' ? new PublicKey(recipientOwner) : recipientOwner
    try {
      const accountInfo = await connection.getAccountInfo(recipientAtaKey)
      if (!accountInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            payer,
            recipientAtaKey,
            ownerKey,
            mintKey,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
        )
      }
    } catch {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          payer,
          recipientAtaKey,
          ownerKey,
          mintKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      )
    }
  }

  const transferIx = createTransferCheckedInstruction(
    senderAta,
    mintKey,
    recipientAtaKey,
    payer,
    amountBigInt,
    decimals,
    [],
    TOKEN_PROGRAM_ID,
  )
  const memoIx = createMemoInstruction(memo)

  if (instructionOrder === 'memoFirst') {
    instructions.push(transferIx, memoIx)
  } else {
    instructions.push(transferIx, memoIx)
  }

  const tx = new Transaction()
  tx.add(...instructions)
  return tx
}
