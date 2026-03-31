-- Persist payment intent (slug, onboarding org) and support USDC reconciliation.
-- RLS: billing_payments remains tenant-admin SELECT only; pre-org rows have no tenant admin
-- until register hook runs — same as before (no broadened client read of sensitive columns).

ALTER TABLE public.billing_payments
  ADD COLUMN IF NOT EXISTS slug_to_claim TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_org JSONB;

COMMENT ON COLUMN public.billing_payments.slug_to_claim IS 'Lowercase slug to set on tenant_config after USDC confirm; frozen at charge.';
COMMENT ON COLUMN public.billing_payments.onboarding_org IS 'PII: org fields for server-side tenant insert after registration payment confirms; cleared after use.';

CREATE INDEX IF NOT EXISTS idx_billing_payments_pending_usdc_reconcile
  ON public.billing_payments (status, payment_method, created_at)
  WHERE status = 'pending' AND payment_method = 'usdc';
