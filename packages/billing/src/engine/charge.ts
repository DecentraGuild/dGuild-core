/**
 * charge(): Create pending payment from quote.
 */
import type { DbClient } from '../types.js'
import type { ChargeParams, ChargeResult, OnboardingOrgPayload } from '../types.js'
import {
  normalizeSlugClaim,
  quoteLineItemsIncludeRegistration,
  quoteLineItemsNeedSlugMeter,
  SLUG_CLAIM_REGEX,
  validateOnboardingOrgPayload,
} from './charge-intent.js'

interface QuoteRow {
  id: string
  tenant_id: string
  line_items: unknown[]
  price_usdc: number
  expires_at: string
}

export async function charge(params: ChargeParams, db: DbClient): Promise<ChargeResult> {
  const { quoteId, paymentMethod, payerWallet, voucherMint, slugToClaim: slugToClaimParam, onboardingOrg: onboardingOrgParam } =
    params

  const { data: quote, error: quoteError } = await db
    .from('billing_quotes')
    .select('id, tenant_id, line_items, price_usdc, expires_at')
    .eq('id', quoteId)
    .maybeSingle()

  if (quoteError || !quote) throw new Error('Quote not found')
  const q = quote as QuoteRow
  if (new Date(q.expires_at) < new Date()) throw new Error('Quote expired')

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const memo = `billing:${q.tenant_id}:${quoteId}`

  if (!payerWallet) throw new Error('payerWallet required for charge')

  const { data: tc } = await db.from('tenant_config').select('id, slug').eq('id', q.tenant_id).maybeSingle()
  const tenantExists = !!tc
  const existingSlug = ((tc as { slug?: string | null } | null)?.slug ?? '').trim()

  const needSlug = await quoteLineItemsNeedSlugMeter(db, q.line_items)
  let slugToClaimStored: string | null = null
  if (needSlug && !existingSlug) {
    const s = normalizeSlugClaim(slugToClaimParam)
    if (!s || !SLUG_CLAIM_REGEX.test(s)) {
      throw new Error(
        'slugToClaim is required for this quote: 1–63 characters, lowercase letters, numbers, hyphens, no leading/trailing hyphen.',
      )
    }
    slugToClaimStored = s
  } else if (slugToClaimParam != null && String(slugToClaimParam).trim() !== '') {
    throw new Error('slugToClaim must not be sent for this quote')
  }

  let onboardingStored: OnboardingOrgPayload | null = null
  if (quoteLineItemsIncludeRegistration(q.line_items)) {
    if (tenantExists) {
      if (onboardingOrgParam != null) throw new Error('onboardingOrg is only allowed before the organisation exists')
    } else {
      onboardingStored = validateOnboardingOrgPayload(onboardingOrgParam)
    }
  } else if (onboardingOrgParam != null) {
    throw new Error('onboardingOrg is not allowed for this quote')
  }

  const { data: payment, error: payError } = await db
    .from('billing_payments')
    .insert({
      tenant_id: q.tenant_id,
      amount_usdc: q.price_usdc,
      status: 'pending',
      memo,
      payer_wallet: payerWallet,
      expires_at: expiresAt,
      payment_method: paymentMethod,
      voucher_mint: voucherMint ?? null,
      quote_id: quoteId,
      slug_to_claim: slugToClaimStored,
      onboarding_org: onboardingStored,
    })
    .select('id')
    .single()

  if (payError || !payment) throw new Error(payError?.message ?? 'Failed to create payment')
  const paymentId = (payment as { id: string }).id

  return {
    paymentId,
    amountUsdc: q.price_usdc,
    memo,
    expiresAt,
  }
}
