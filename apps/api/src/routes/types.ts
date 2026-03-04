/**
 * Shared request/response types for core API routes. Use these to keep
 * validation and response shapes consistent. Validation remains inline in
 * handlers; these types document the contract.
 */

/** POST /billing/payment-intent body */
export interface BillingPaymentIntentBody {
  moduleId: string
  billingPeriod?: string
  conditions?: Record<string, unknown>
  slug?: string
}

/** POST /billing/confirm-payment body */
export interface BillingConfirmBody {
  paymentId: string
  txSignature: string
}

/** POST /billing/extend body */
export interface BillingExtendBody {
  moduleId: string
  billingPeriod?: string
}

/** POST /whitelist/lists body */
export interface WhitelistCreateListBody {
  address: string
  name: string
  authority: string
  imageUrl?: string | null
}

/** PATCH /whitelist/lists/:address body */
export interface WhitelistUpdateListBody {
  imageUrl?: string | null
}

/** GET /whitelist/my-memberships query */
export interface WhitelistMyMembershipsQuery {
  wallet?: string
}

/** GET /whitelist/check query */
export interface WhitelistCheckQuery {
  wallet: string
  list: string
}

/** GET /whitelist/is-listed query */
export interface WhitelistIsListedQuery {
  wallet: string
  list: string
}
