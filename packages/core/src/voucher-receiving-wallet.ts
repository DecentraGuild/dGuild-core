/**
 * Solana address that receives minted voucher / coupon SPL tokens by default.
 * Ops mints from a separate wallet; tenants redeem into this vault — two distinct keys.
 * Override per deployment with Edge `VOUCHER_WALLET` or Nuxt `NUXT_PUBLIC_VOUCHER_WALLET`.
 */
export const VOUCHER_RECEIVING_WALLET_DEFAULT =
  '89s4gjt2STRy83XQrxmYrWRkQBH3CL228BRVs6Qbed2Q'

export function resolveVoucherReceivingWallet(override?: string | null): string {
  const t = (override ?? '').trim()
  return t || VOUCHER_RECEIVING_WALLET_DEFAULT
}
