/**
 * Voucher token transfer verification for billing.
 */
import { PublicKey } from 'npm:@solana/web3.js@1'
import { getAssociatedTokenAddressSync } from 'npm:@solana/spl-token@0.4'
import { TOKEN_PROGRAM_ID } from 'npm:@solana/spl-token@0.4'
import { getSolanaConnection } from './solana-connection.ts'

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

const VOUCHER_WALLET_DEFAULT = '89s4gjt2STRy83XQrxmYrWRkQBH3CL228BRVs6Qbed2Q'

function getVoucherWallet(): PublicKey {
  const addr = Deno.env.get('VOUCHER_WALLET') ?? VOUCHER_WALLET_DEFAULT
  return new PublicKey(addr)
}

export function getVoucherRecipientAta(voucherMint: string): string {
  const wallet = getVoucherWallet()
  const mint = new PublicKey(voucherMint)
  const ata = getAssociatedTokenAddressSync(mint, wallet)
  return ata.toBase58()
}

export async function verifyVoucherPayment(params: {
  txSignature: string
  expectedMemo: string
  voucherMint: string
  tokensRequired?: number
}): Promise<{ valid: boolean; error?: string }> {
  const { txSignature, expectedMemo, voucherMint, tokensRequired = 1 } = params
  try {
    const connection = getSolanaConnection()
    const tx = await connection.getParsedTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })
    if (!tx) return { valid: false, error: 'Transaction not found or not yet confirmed' }
    if (tx.meta?.err) return { valid: false, error: 'Transaction failed on-chain' }

    const expectedAta = getVoucherRecipientAta(voucherMint)
    const expectedAmount = BigInt(tokensRequired)
    let transferFound = false
    let memoFound = false

    function scanInstructions(instructions: unknown[]) {
      for (const ix of instructions) {
        const i = ix as Record<string, unknown>
        if ('parsed' in i && (i.programId as PublicKey)?.equals?.(TOKEN_PROGRAM_ID)) {
          const parsed = i.parsed as {
            type?: string
            info?: { destination?: string; tokenAmount?: { amount?: string }; amount?: string }
          }
          if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
            const dest = parsed.info?.destination
            const amount = parsed.info?.tokenAmount?.amount ?? parsed.info?.amount
            if (dest === expectedAta && amount != null && BigInt(amount) >= expectedAmount) {
              transferFound = true
            }
          }
        }
        if ('parsed' in i && (i.programId as PublicKey)?.equals?.(MEMO_PROGRAM_ID)) {
          const memoData = typeof i.parsed === 'string' ? i.parsed : ''
          if (memoData === expectedMemo) memoFound = true
        }
        if (!('parsed' in i) && (i.programId as PublicKey)?.equals?.(MEMO_PROGRAM_ID)) {
          try {
            const raw = (i as { data?: string }).data ?? ''
            const decoded = new TextDecoder().decode(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)))
            if (decoded === expectedMemo) memoFound = true
          } catch {
            /* ignore */
          }
        }
      }
    }

    scanInstructions(tx.transaction.message.instructions as unknown[])
    for (const inner of tx.meta?.innerInstructions ?? []) {
      scanInstructions(inner.instructions as unknown[])
    }

    if (!transferFound) return { valid: false, error: 'Voucher token transfer not found in transaction' }
    if (!memoFound) return { valid: false, error: 'Payment memo not found in transaction' }
    return { valid: true }
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : 'Verification failed' }
  }
}
