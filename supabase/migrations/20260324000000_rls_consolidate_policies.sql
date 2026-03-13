-- Consolidate overlapping RLS policies: avoid multiple permissive policies for same role/action.
-- Tables with public_read (SELECT) + admin_write (FOR ALL) cause both to apply to SELECT.
-- Fix: restrict admin policies to INSERT, UPDATE, DELETE only (PostgreSQL requires separate FOR per command).

-- marketplace_settings
DROP POLICY IF EXISTS "marketplace_settings_admin_write" ON public.marketplace_settings;
CREATE POLICY "marketplace_settings_admin_insert" ON public.marketplace_settings
  FOR INSERT WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "marketplace_settings_admin_update" ON public.marketplace_settings
  FOR UPDATE USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "marketplace_settings_admin_delete" ON public.marketplace_settings
  FOR DELETE USING (public.is_tenant_admin(tenant_id));

-- tenant_gate_lists
DROP POLICY IF EXISTS "tenant_gate_lists_admin_write" ON public.tenant_gate_lists;
CREATE POLICY "tenant_gate_lists_admin_insert" ON public.tenant_gate_lists
  FOR INSERT WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant_gate_lists_admin_update" ON public.tenant_gate_lists
  FOR UPDATE USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant_gate_lists_admin_delete" ON public.tenant_gate_lists
  FOR DELETE USING (public.is_tenant_admin(tenant_id));

-- raffle_settings
DROP POLICY IF EXISTS "raffle_settings_admin_write" ON public.raffle_settings;
CREATE POLICY "raffle_settings_admin_insert" ON public.raffle_settings
  FOR INSERT WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "raffle_settings_admin_update" ON public.raffle_settings
  FOR UPDATE USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "raffle_settings_admin_delete" ON public.raffle_settings
  FOR DELETE USING (public.is_tenant_admin(tenant_id));

-- tenant_mint_catalog
DROP POLICY IF EXISTS "tenant_mint_catalog_admin_write" ON public.tenant_mint_catalog;
CREATE POLICY "tenant_mint_catalog_admin_insert" ON public.tenant_mint_catalog
  FOR INSERT WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant_mint_catalog_admin_update" ON public.tenant_mint_catalog
  FOR UPDATE USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant_mint_catalog_admin_delete" ON public.tenant_mint_catalog
  FOR DELETE USING (public.is_tenant_admin(tenant_id));
