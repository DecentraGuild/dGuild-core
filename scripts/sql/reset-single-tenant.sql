-- =============================================================================
-- Reset ONE tenant: remove all tenant-scoped rows for a single tenant_config.id.
--
-- Use case: wipe internal dev tenant 0000000 (or any id) before re-applying
-- configs/tenants/<id>.json via `pnpm db:sync` (service role).
--
-- Run in Supabase Dashboard → SQL Editor as a privileged role (postgres bypasses RLS).
-- Review `tid` below, then run the whole script once (BEGIN … COMMIT).
--
-- Does NOT touch: mint_metadata, collection_members, holder_current, gate_metadata
-- (shared/global). Does NOT touch other tenants. Does NOT touch auth.users.
--
-- Optional: uncomment platform_audit_log cleanup at the end of the DO block.
-- =============================================================================

BEGIN;

SET LOCAL statement_timeout = '300s';

DO $$
DECLARE
  tid text := '0000000'; -- change only here when reusing for another tenant
BEGIN
  RAISE NOTICE 'reset-single-tenant: starting deletes for tenant_id=%', tid;

  -- ---------------------------------------------------------------------------
  -- Billing / entitlements (respect FKs to billing_payments)
  -- ---------------------------------------------------------------------------
  DELETE FROM public.individual_voucher_redemptions WHERE tenant_id = tid;
  DELETE FROM public.voucher_redemptions WHERE tenant_id = tid;
  DELETE FROM public.crafter_tokens WHERE tenant_id = tid;
  -- entitlement_expiry_queue rows CASCADE when granted_entitlements are deleted
  DELETE FROM public.granted_entitlements WHERE tenant_id = tid;
  DELETE FROM public.billing_payments WHERE tenant_id = tid;
  DELETE FROM public.billing_quotes WHERE tenant_id = tid;
  DELETE FROM public.tenant_meter_limits WHERE tenant_id = tid;
  DELETE FROM public.tenant_voucher_redemption_totals WHERE tenant_id = tid;
  DELETE FROM public.individual_voucher_redemption_totals WHERE tenant_id = tid;

  -- ---------------------------------------------------------------------------
  -- Discord: condition_sets CASCADE removes condition_set_conditions + discord_role_rules
  -- ---------------------------------------------------------------------------
  DELETE FROM public.condition_sets WHERE tenant_id = tid;
  DELETE FROM public.discord_servers WHERE tenant_id = tid;

  -- ---------------------------------------------------------------------------
  -- Marketplace (explicit; some FKs CASCADE only on tenant_config delete)
  -- ---------------------------------------------------------------------------
  DELETE FROM public.marketplace_currencies WHERE tenant_id = tid;
  DELETE FROM public.marketplace_mint_scope WHERE tenant_id = tid;
  DELETE FROM public.marketplace_settings WHERE tenant_id = tid;

  -- ---------------------------------------------------------------------------
  -- Crafter / shipments
  -- ---------------------------------------------------------------------------
  DELETE FROM public.shipment_records WHERE tenant_id = tid;
  DELETE FROM public.crafter_pending WHERE tenant_id = tid;

  -- ---------------------------------------------------------------------------
  -- Gates, profiles, catalog, raffles, watchtower, tracker snapshots
  -- ---------------------------------------------------------------------------
  DELETE FROM public.tenant_gate_lists WHERE tenant_id = tid;
  DELETE FROM public.tenant_member_profiles WHERE tenant_id = tid;
  DELETE FROM public.tenant_mint_catalog WHERE tenant_id = tid;
  DELETE FROM public.tenant_collection_scope WHERE tenant_id = tid;
  DELETE FROM public.tenant_raffles WHERE tenant_id = tid;
  DELETE FROM public.raffle_settings WHERE tenant_id = tid;
  DELETE FROM public.watchtower_watches WHERE tenant_id = tid;
  DELETE FROM public.tracker_holder_snapshots WHERE tenant_id = tid;

  -- ---------------------------------------------------------------------------
  -- Optional: platform audit rows pointing at this tenant (tutorial / demo noise)
  -- ---------------------------------------------------------------------------
  -- DELETE FROM public.platform_audit_log
  -- WHERE target_type = 'tenant' AND target_id = tid;

  -- ---------------------------------------------------------------------------
  -- Tenant row: remove so the next db:sync INSERT gets DB defaults for columns
  -- not present in JSON (welcome_message, profile_fields, links, etc.).
  -- Comment out this line if you must keep the same tenant_config row identity
  -- without a brief window where the id is missing.
  -- ---------------------------------------------------------------------------
  DELETE FROM public.tenant_config WHERE id = tid;

  RAISE NOTICE 'reset-single-tenant: finished for tenant_id=%', tid;
END $$;

COMMIT;
