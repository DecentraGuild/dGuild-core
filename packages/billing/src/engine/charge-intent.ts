/**
 * Charge-time intent: which optional fields are required from quote + tenant state.
 */
import type { DbClient, OnboardingOrgPayload, QuoteLineItem } from '../types.js'

export const SLUG_CLAIM_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

export function normalizeSlugClaim(raw: string | undefined): string {
  return (raw ?? '').trim().toLowerCase()
}

function tierLineItems(lineItems: unknown[]): QuoteLineItem[] {
  return (lineItems ?? []).filter((x): x is QuoteLineItem => {
    const o = x as QuoteLineItem
    return o != null && typeof o === 'object' && o.source === 'tier'
  })
}

export async function quoteLineItemsNeedSlugMeter(db: DbClient, lineItems: unknown[]): Promise<boolean> {
  for (const item of lineItems ?? []) {
    const li = item as QuoteLineItem
    if (li.source === 'tier' && li.meter_key === 'slug') return true
    if (li.source === 'bundle' && li.bundleId) {
      const { data: ents } = await db
        .from('bundle_entitlements')
        .select('meter_key')
        .eq('bundle_id', li.bundleId)
      for (const e of ents ?? []) {
        const row = e as { meter_key: string }
        if (row.meter_key === 'slug') return true
      }
    }
  }
  return false
}

export function quoteLineItemsIncludeRegistration(lineItems: unknown[]): boolean {
  return tierLineItems(lineItems).some((li) => li.meter_key === 'registration')
}

export function validateOnboardingOrgPayload(raw: unknown): OnboardingOrgPayload {
  if (raw == null || typeof raw !== 'object') throw new Error('onboardingOrg must be an object')
  const o = raw as Record<string, unknown>
  const name = typeof o.name === 'string' ? o.name.trim() : ''
  const description = typeof o.description === 'string' ? o.description.trim() : ''
  if (!name) throw new Error('onboardingOrg.name is required')
  if (!description) throw new Error('onboardingOrg.description is required')
  const logo = typeof o.logo === 'string' ? o.logo.trim() : ''
  const discordInviteLink = typeof o.discordInviteLink === 'string' ? o.discordInviteLink.trim() : ''
  return {
    name,
    description,
    logo: logo || undefined,
    discordInviteLink: discordInviteLink || undefined,
  }
}
