/**
 * Shared USDC payment verification for billing and crafter.
 */
import { Connection, PublicKey } from 'npm:@solana/web3.js@1'
import { TOKEN_PROGRAM_ID } from 'npm:@solana/spl-token@0.4'

export const BILLING_WALLET = new PublicKey('4CJYmVAcBrgYL6iX4gUKSMeJxTm4hK3eNAzuzaYBZMCv')
export const BILLING_WALLET_ATA = new PublicKey('FoxSYPF93hPnpNoZ3eUjEAii3p6fdEESNZJe6fHbRUxr')
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
const USDC_DECIMALS = 6

function getSolanaConnection(): Connection {
  const rpcUrl =
    Deno.env.get('HELIUS_RPC_URL') ??
    Deno.env.get('SOLANA_RPC_URL') ??
    'https://api.mainnet-beta.solana.com'
  return new Connection(rpcUrl, 'confirmed')
}

export async function verifyBillingPayment(params: {
  txSignature: string
  expectedAmountUsdc: number
  expectedMemo: string
}): Promise<{ valid: boolean; error?: string }> {
  const { txSignature, expectedAmountUsdc, expectedMemo } = params
  try {
    const connection = getSolanaConnection()
    const tx = await connection.getParsedTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })
    if (!tx) return { valid: false, error: 'Transaction not found or not yet confirmed' }
    if (tx.meta?.err) return { valid: false, error: `Transaction failed on-chain` }

    const expectedBaseUnits = BigInt(Math.round(expectedAmountUsdc * 10 ** USDC_DECIMALS))
    const expectedAta = BILLING_WALLET_ATA.toBase58()
    let transferFound = false
    let memoFound = false

    function scanInstructions(instructions: unknown[]) {
      for (const ix of instructions) {
        const i = ix as Record<string, unknown>
        if ('parsed' in i && (i.programId as PublicKey)?.equals?.(TOKEN_PROGRAM_ID)) {
          const parsed = i.parsed as { type?: string; info?: { amount?: string; destination?: string; tokenAmount?: { amount?: string } } }
          if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
            const dest = parsed.info?.destination
            const amount = parsed.info?.tokenAmount?.amount ?? parsed.info?.amount
            if (dest === expectedAta && amount != null && BigInt(amount) >= expectedBaseUnits) {
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
          } catch { /* ignore */ }
        }
      }
    }

    scanInstructions(tx.transaction.message.instructions as unknown[])
    for (const inner of tx.meta?.innerInstructions ?? []) {
      scanInstructions(inner.instructions as unknown[])
    }

    if (!transferFound) return { valid: false, error: `USDC transfer not found in transaction` }
    if (!memoFound) return { valid: false, error: 'Payment memo not found in transaction' }
    return { valid: true }
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : 'Verification failed' }
  }
}
