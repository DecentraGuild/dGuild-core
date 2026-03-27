ALTER TABLE public.tenant_config
  ADD COLUMN IF NOT EXISTS welcome_message TEXT NULL;

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
  tc.admins,
  tc.treasury,
  tc.created_at,
  tc.updated_at,
  ms.settings AS marketplace_settings,
  rs.settings AS raffle_settings,
  tc.homepage,
  tc.x_link,
  tc.telegram_link,
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
