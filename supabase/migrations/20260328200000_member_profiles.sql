-- ---------------------------------------------------------------------------
-- Member profiles: is_primary on gate lists + tenant_member_profiles table
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenant_gate_lists
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_gate_lists_one_primary
  ON public.tenant_gate_lists (tenant_id)
  WHERE is_primary = true;

-- Recreate the gate_lists view to expose is_primary
DROP VIEW IF EXISTS public.gate_lists CASCADE;

CREATE VIEW public.gate_lists AS
SELECT twl.tenant_id, twl.address, wm.name, wm.authority, wm.image_url, twl.is_primary
FROM public.tenant_gate_lists twl
JOIN public.gate_metadata wm ON wm.address = twl.address;

GRANT SELECT ON public.gate_lists TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.gate_lists_insert_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.gate_metadata (address, name, authority, image_url, updated_at)
  VALUES (NEW.address, NEW.name, COALESCE(NEW.authority, ''), NEW.image_url, NOW())
  ON CONFLICT (address) DO UPDATE SET name = EXCLUDED.name, image_url = EXCLUDED.image_url, updated_at = NOW();
  INSERT INTO public.tenant_gate_lists (tenant_id, address, is_primary)
  VALUES (NEW.tenant_id, NEW.address, COALESCE(NEW.is_primary, false))
  ON CONFLICT (tenant_id, address) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER gate_lists_insert_trg
  INSTEAD OF INSERT ON public.gate_lists
  FOR EACH ROW EXECUTE FUNCTION public.gate_lists_insert_fn();

CREATE OR REPLACE FUNCTION public.gate_lists_update_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.gate_metadata SET name = NEW.name, image_url = NEW.image_url, updated_at = NOW()
  WHERE address = NEW.address;
  UPDATE public.tenant_gate_lists SET is_primary = COALESCE(NEW.is_primary, false)
  WHERE tenant_id = NEW.tenant_id AND address = NEW.address;
  RETURN NEW;
END;
$$;
CREATE TRIGGER gate_lists_update_trg
  INSTEAD OF UPDATE ON public.gate_lists
  FOR EACH ROW EXECUTE FUNCTION public.gate_lists_update_fn();

CREATE OR REPLACE FUNCTION public.gate_lists_delete_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.tenant_gate_lists WHERE tenant_id = OLD.tenant_id AND address = OLD.address;
  RETURN OLD;
END;
$$;
CREATE TRIGGER gate_lists_delete_trg
  INSTEAD OF DELETE ON public.gate_lists
  FOR EACH ROW EXECUTE FUNCTION public.gate_lists_delete_fn();

ALTER VIEW public.gate_lists SET (security_invoker = on);

-- ---------------------------------------------------------------------------
-- tenant_member_profiles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_member_profiles (
  tenant_id       TEXT NOT NULL REFERENCES public.tenant_config(id),
  wallet_address  TEXT NOT NULL,
  member_id       TEXT NOT NULL UNIQUE,
  nickname        TEXT CHECK (char_length(nickname) <= 32),
  description     TEXT CHECK (char_length(description) <= 500),
  avatar_url      TEXT,
  x_handle        TEXT,
  telegram_handle TEXT,
  email           TEXT,
  phone           TEXT,
  linked_wallets  TEXT[] DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_tenant_member_profiles_tenant
  ON public.tenant_member_profiles(tenant_id);

ALTER TABLE public.tenant_member_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_public_read" ON public.tenant_member_profiles
  FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- profile_fields on tenant_config
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenant_config
  ADD COLUMN IF NOT EXISTS profile_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Recreate tenant_context_view to include profile_fields
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
