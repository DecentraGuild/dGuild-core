-- =============================================================================
-- Revert Crafter billing state for one tenant (e.g. after deleting tokens in ops
-- left granted_entitlements / tenant_meter_limits out of sync).
--
-- Run in Supabase SQL Editor as postgres (or any role that bypasses RLS).
-- Set `tid` to your tenant_config.id (default: internal dev 0000000).
--
-- Deletes:
--   - crafter_pending (stuck create flows)
--   - granted_entitlements for meter crafter_tokens only (triggers update tenant_meter_limits)
--   - crafter_tokens rows (if any remain)
--
-- Does NOT remove: other meters' grants, voucher redemptions, billing_payments history.
-- If you need a full tenant wipe, use reset-single-tenant.sql instead.
-- =============================================================================

BEGIN;

SET LOCAL statement_timeout = '120s';

DO $$
DECLARE
  tid text := '0000000';
BEGIN
  RAISE NOTICE 'revert-crafter-tenant: tenant_id=%', tid;

  DELETE FROM public.crafter_pending WHERE tenant_id = tid;
  DELETE FROM public.crafter_tokens WHERE tenant_id = tid;
  DELETE FROM public.granted_entitlements
  WHERE tenant_id = tid AND meter_key = 'crafter_tokens';

  RAISE NOTICE 'revert-crafter-tenant: done (crafter_tokens grants + rows cleared)';
END $$;

COMMIT;
