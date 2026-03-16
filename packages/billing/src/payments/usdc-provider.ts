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
      if (!params.expectedAmountUsdc || !params.expectedMemo) {
        return { valid: false, error: 'Missing expectedAmountUsdc or expectedMemo' }
      }
      return verify({
        txSignature: params.txSignature,
        expectedAmountUsdc: params.expectedAmountUsdc,
        expectedMemo: params.expectedMemo,
      })
    },
  }
}
