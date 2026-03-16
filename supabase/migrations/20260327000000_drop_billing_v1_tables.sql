-- Pricing engine v2: drop legacy billing_subscriptions and tenant_module_billing_state.
-- Source of truth moves to granted_entitlements / tenant_meter_limits (Phase 4).

DROP POLICY IF EXISTS "billing_subscriptions_admin_read" ON public.billing_subscriptions;
DROP POLICY IF EXISTS "tenant_module_billing_state_admin_read" ON public.tenant_module_billing_state;

DROP TABLE IF EXISTS public.billing_subscriptions;
DROP TABLE IF EXISTS public.tenant_module_billing_state;
