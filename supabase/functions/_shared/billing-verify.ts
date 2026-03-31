/**
 * Shared USDC payment verification for billing and crafter.
 */
import { PublicKey } from 'npm:@solana/web3.js@1'
import { TOKEN_PROGRAM_ID } from 'npm:@solana/spl-token@0.4'
import { getSolanaConnection } from './solana-connection.ts'

export const BILLING_WALLET = new PublicKey('4CJYmVAcBrgYL6iX4gUKSMeJxTm4hK3eNAzuzaYBZMCv')
export const BILLING_WALLET_ATA = new PublicKey('FoxSYPF93hPnpNoZ3eUjEAii3p6fdEESNZJe6fHbRUxr')
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
const USDC_DECIMALS = 6

const BILLING_MEMO_RE = /^billing:[^:]+:[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$/i

function scanMemoStrings(instructions: unknown[]): string[] {
  const out: string[] = []
  for (const ix of instructions) {
    const i = ix as Record<string, unknown>
    if ('parsed' in i && (i.programId as PublicKey)?.equals?.(MEMO_PROGRAM_ID)) {
      const memoData = typeof i.parsed === 'string' ? i.parsed : ''
      if (memoData) out.push(memoData)
    }
    if (!('parsed' in i) && (i.programId as PublicKey)?.equals?.(MEMO_PROGRAM_ID)) {
      try {
        const raw = (i as { data?: string }).data ?? ''
        const decoded = new TextDecoder().decode(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)))
        if (decoded) out.push(decoded)
      } catch { /* ignore */ }
    }
  }
  return out
}

/** First memo matching billing:{tenantId}:{quoteUuid}. */
export function extractBillingMemoFromParsedTransaction(tx: {
  transaction?: { message?: { instructions?: unknown[] } }
  meta?: { innerInstructions?: Array<{ instructions?: unknown[] }> }
} | null): string | null {
  if (!tx?.transaction?.message?.instructions) return null
  const top = scanMemoStrings(tx.transaction.message.instructions as unknown[])
  for (const m of top) {
    if (BILLING_MEMO_RE.test(m.trim())) return m.trim()
  }
  for (const inner of tx.meta?.innerInstructions ?? []) {
    const found = scanMemoStrings((inner.instructions ?? []) as unknown[])
    for (const m of found) {
      if (BILLING_MEMO_RE.test(m.trim())) return m.trim()
    }
  }
  return null
}

export async function verifyBillingPayment(params: {
  txSignature: string
  expectedAmountUsdc: number
  expectedMemo: string
  /** When set, SPL transfer authority for the credit to billing ATA must match this wallet (base58). */
  expectedPayerWallet?: string
}): Promise<{ valid: boolean; error?: string }> {
  const { txSignature, expectedAmountUsdc, expectedMemo, expectedPayerWallet } = params
  try {
    const connection = getSolanaConnection()
    const tx = await connection.getParsedTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })
    if (!tx) return { valid: false, error: 'Transaction not found or not yet confirmed' }
    if (tx.meta?.err) return { valid: false, error: `Transaction failed on-chain` }

    const zeroUsdc = expectedAmountUsdc <= 0
    const expectedBaseUnits = BigInt(Math.round(expectedAmountUsdc * 10 ** USDC_DECIMALS))
    const expectedAta = BILLING_WALLET_ATA.toBase58()
    let transferFound = false
    let memoFound = false
    let transferAuthority: string | null = null

    function scanInstructions(instructions: unknown[]) {
      for (const ix of instructions) {
        const i = ix as Record<string, unknown>
        if ('parsed' in i && (i.programId as PublicKey)?.equals?.(TOKEN_PROGRAM_ID)) {
          const parsed = i.parsed as {
            type?: string
            info?: {
              amount?: string
              destination?: string
              authority?: string
              tokenAmount?: { amount?: string }
            }
          }
          if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
            const dest = parsed.info?.destination
            const amount = parsed.info?.tokenAmount?.amount ?? parsed.info?.amount
            if (dest === expectedAta && amount != null && BigInt(amount) >= expectedBaseUnits) {
              transferFound = true
              const auth = parsed.info?.authority
              if (typeof auth === 'string' && auth.length > 0) transferAuthority = auth
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

    if (!zeroUsdc && !transferFound) {
      return { valid: false, error: `USDC transfer not found in transaction` }
    }
    if (!memoFound) return { valid: false, error: 'Payment memo not found in transaction' }

    const wantPayer = (expectedPayerWallet ?? '').trim()
    if (wantPayer && !zeroUsdc) {
      if (!transferAuthority) {
        return { valid: false, error: 'Could not verify payer wallet for this transfer' }
      }
      if (transferAuthority.toLowerCase() !== wantPayer.toLowerCase()) {
        return { valid: false, error: 'Payment signer does not match payer wallet on file' }
      }
    }

    return { valid: true }
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : 'Verification failed' }
  }
}
