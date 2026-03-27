-- Marketplace: per-tenant store bps (reserved), currency group_path, currency_mints as jsonb in tenant_context_view

ALTER TABLE public.tenant_mint_catalog
  ADD COLUMN IF NOT EXISTS store_bps integer NULL;

ALTER TABLE public.tenant_mint_catalog DROP CONSTRAINT IF EXISTS tenant_mint_catalog_store_bps_check;
ALTER TABLE public.tenant_mint_catalog
  ADD CONSTRAINT tenant_mint_catalog_store_bps_check
  CHECK (store_bps IS NULL OR (store_bps >= 0 AND store_bps <= 10000));

ALTER TABLE public.marketplace_currencies
  ADD COLUMN IF NOT EXISTS group_path text[] NULL;

-- Cannot change currency_mints column type (text[] -> jsonb) with CREATE OR REPLACE VIEW; drop and recreate.
DROP VIEW IF EXISTS public.tenant_context_view;

CREATE VIEW public.tenant_context_view AS
SELECT
  tc.id,
  tc.slug,
  tc.name,
  tc.description,
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
