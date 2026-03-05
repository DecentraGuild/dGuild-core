/**
 * Shared validation for periodEnd (ops: PATCH modules, set-period-end, extend).
 * Reject past dates; optional minimum period for new subscriptions.
 */

const MIN_DAYS_FOR_NEW_SUBSCRIPTION = 30

export interface ValidatePeriodEndOptions {
  /** When true, require periodEnd to be at least MIN_DAYS_FOR_NEW_SUBSCRIPTION from now. */
  forNewSubscription?: boolean
  /** When set, periodEnd must be after this date (for extending existing subscription). */
  existingPeriodEnd?: Date
}

export interface ValidatePeriodEndResult {
  ok: true
  date: Date
}

export interface ValidatePeriodEndError {
  ok: false
  error: string
  code: string
}

export function validatePeriodEnd(
  periodEndInput: string,
  options: ValidatePeriodEndOptions = {},
): ValidatePeriodEndResult | ValidatePeriodEndError {
  const parsed = new Date(periodEndInput)
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: 'Invalid periodEnd', code: 'BAD_REQUEST' }
  }

  const now = new Date()
  if (parsed <= now) {
    return { ok: false, error: 'periodEnd must be in the future', code: 'BAD_REQUEST' }
  }

  if (options.existingPeriodEnd != null && parsed <= options.existingPeriodEnd) {
    return { ok: false, error: 'periodEnd must be after current period end', code: 'BAD_REQUEST' }
  }

  if (options.forNewSubscription) {
    const minEnd = new Date(now)
    minEnd.setDate(minEnd.getDate() + MIN_DAYS_FOR_NEW_SUBSCRIPTION)
    if (parsed < minEnd) {
      return {
        ok: false,
        error: `periodEnd must be at least ${MIN_DAYS_FOR_NEW_SUBSCRIPTION} days from now`,
        code: 'BAD_REQUEST',
      }
    }
  }

  return { ok: true, date: parsed }
}
