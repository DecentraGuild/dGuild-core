-- Covering indexes for foreign keys (Supabase performance advisor: unindexed_foreign_keys).
-- Speeds FK checks on parent UPDATE/DELETE and common join paths.

CREATE INDEX IF NOT EXISTS idx_billing_payments_bundle_id ON public.billing_payments(bundle_id);
CREATE INDEX IF NOT EXISTS idx_billing_payments_quote_id ON public.billing_payments(quote_id);

CREATE INDEX IF NOT EXISTS idx_crafter_pending_tenant_id ON public.crafter_pending(tenant_id);

CREATE INDEX IF NOT EXISTS idx_crafter_tokens_billing_payment_id ON public.crafter_tokens(billing_payment_id);

CREATE INDEX IF NOT EXISTS idx_discord_role_rules_condition_set_id ON public.discord_role_rules(condition_set_id);

CREATE INDEX IF NOT EXISTS idx_entitlement_expiry_queue_entitlement_id ON public.entitlement_expiry_queue(entitlement_id);

CREATE INDEX IF NOT EXISTS idx_granted_entitlements_payment_id ON public.granted_entitlements(payment_id);
CREATE INDEX IF NOT EXISTS idx_granted_entitlements_bundle_id ON public.granted_entitlements(bundle_id);

CREATE INDEX IF NOT EXISTS idx_individual_voucher_entitlements_meter_key ON public.individual_voucher_entitlements(meter_key);

CREATE INDEX IF NOT EXISTS idx_individual_voucher_redemption_totals_voucher_mint
  ON public.individual_voucher_redemption_totals(voucher_mint);

CREATE INDEX IF NOT EXISTS idx_individual_voucher_redemptions_payment_id ON public.individual_voucher_redemptions(payment_id);

CREATE INDEX IF NOT EXISTS idx_meter_dependencies_requires_meter ON public.meter_dependencies(requires_meter);

CREATE INDEX IF NOT EXISTS idx_tenant_gate_lists_address ON public.tenant_gate_lists(address);

CREATE INDEX IF NOT EXISTS idx_tenant_voucher_redemption_totals_bundle_id ON public.tenant_voucher_redemption_totals(bundle_id);

CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_bundle_id ON public.voucher_redemptions(bundle_id);
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_payment_id ON public.voucher_redemptions(payment_id);
