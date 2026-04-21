-- Hardening: remove world-readable shipment_records; strip admins/treasury from tenant_context_view;
-- remove direct PostgREST read of member PII (Edge uses service role).

DROP POLICY IF EXISTS "shipment_records_public_read" ON public.shipment_records;

-- Member profiles: only service_role / Edge should read; no anon/authenticated blanket SELECT.
DROP POLICY IF EXISTS "profiles_public_read" ON public.tenant_member_profiles;

-- Optional recipient self-read (authenticated wallet matches leaf) — complements admin-only policy.
DROP POLICY IF EXISTS "shipment_compressed_leaves_recipient_read" ON public.shipment_compressed_leaves;
CREATE POLICY "shipment_compressed_leaves_recipient_read"
  ON public.shipment_compressed_leaves
  FOR SELECT
  TO authenticated
  USING (
    NULLIF(trim(public.auth_wallet()), '') IS NOT NULL
    AND lower(trim(recipient_wallet)) = lower(trim(public.auth_wallet()))
  );

-- Public tenant SSR: exclude wallet lists and treasury (use member-profile Edge action tenant-sensitive).
DROP VIEW IF EXISTS public.tenant_context_view;

CREATE VIEW public.tenant_context_view AS
SELECT
  tc.id,
  tc.slug,
  tc.name,
  tc.description,
  tc.welcome_message,
  tc.discord_server_invite_link,
  tc.default_gate,
  tc.branding,
  tc.modules,
  tc.created_at,
  tc.updated_at,
  ms.settings AS marketplace_settings,
  rs.settings AS raffle_settings,
  tc.homepage,
  tc.x_link,
  tc.telegram_link,
  tc.profile_fields,
  (
    SELECT COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'mint', mc.mint,
            'groupPath', to_jsonb(mc.group_path)
          )
          ORDER BY mc.mint
        )
        FROM public.marketplace_currencies mc
        WHERE mc.tenant_id = tc.id
      ),
      '[]'::jsonb
    )
  ) AS currency_mints
FROM public.tenant_config tc
LEFT JOIN public.marketplace_settings ms ON ms.tenant_id = tc.id
LEFT JOIN public.raffle_settings rs ON rs.tenant_id = tc.id;

ALTER VIEW public.tenant_context_view SET (security_invoker = on);

GRANT SELECT ON public.tenant_context_view TO anon, authenticated, service_role;
