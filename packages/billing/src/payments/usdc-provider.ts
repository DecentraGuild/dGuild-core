/**
 * USDC transfer payment provider. Wraps verifyBillingPayment from Edge Function.
 * Create via createUSDCTransferProvider(verifyBillingPayment).
 */
import type { PaymentProvider } from '../types.js'

export interface VerifyBillingPaymentFn {
  (params: {
    txSignature: string
    expectedAmountUsdc: number
    expectedMemo: string
  }): Promise<{ valid: boolean; error?: string }>
}

export function createUSDCTransferProvider(verify: VerifyBillingPaymentFn): PaymentProvider {
  return {
    id: 'usdc',
    async verify(params) {
      const amt = params.expectedAmountUsdc
      if (typeof amt !== 'number' || !Number.isFinite(amt) || amt < 0) {
        return { valid: false, error: 'Missing or invalid expectedAmountUsdc' }
      }
      const memo = params.expectedMemo
      if (memo == null || String(memo).trim() === '') {
        return { valid: false, error: 'Missing expectedMemo' }
      }
      return verify({
        txSignature: params.txSignature,
        expectedAmountUsdc: amt,
        expectedMemo: memo,
      })
    },
  }
}
