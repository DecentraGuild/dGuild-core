-- RLS for tables exposed to PostgREST without policies.
-- gate_lists view: use security_invoker so RLS on underlying tables applies.

-- cron_edge_config: stores service_role_key; only backend/cron should access.
-- Enable RLS; anon/authenticated get no rows. Superuser and service_role bypass.
ALTER TABLE public.cron_edge_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cron_edge_config_no_direct_access"
  ON public.cron_edge_config
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- discord_member_roles: populated by discord-bot, read by qualification.
-- Backend-only; anon/authenticated get no rows.
ALTER TABLE public.discord_member_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discord_member_roles_no_direct_access"
  ON public.discord_member_roles
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- gate_lists view: run as invoking user so RLS on tenant_gate_lists applies.
-- PostgreSQL 15+ supports security_invoker.
ALTER VIEW public.gate_lists SET (security_invoker = on);
