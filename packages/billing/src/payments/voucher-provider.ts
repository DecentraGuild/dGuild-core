/**
 * Voucher token transfer payment provider.
 * Create via createVoucherTransferProvider(verifyVoucherPayment).
 */
import type { PaymentProvider } from '../types.js'

export interface VerifyVoucherPaymentFn {
  (params: {
    txSignature: string
    expectedMemo: string
    voucherMint: string
    tokensRequired?: number
  }): Promise<{ valid: boolean; error?: string }>
}

export function createVoucherTransferProvider(
  verify: VerifyVoucherPaymentFn,
  voucherMint: string,
  tokensRequired?: number,
): PaymentProvider {
  return {
    id: 'voucher',
    async verify(params) {
      if (!params.expectedMemo || !voucherMint) {
        return { valid: false, error: 'Missing expectedMemo or voucherMint' }
      }
      return verify({
        txSignature: params.txSignature,
        expectedMemo: params.expectedMemo,
        voucherMint,
        tokensRequired,
      })
    },
  }
}
