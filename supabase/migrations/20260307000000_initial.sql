-- DecentraGuild schema (consolidated).
-- All tables use tenant_id (tenant_config.id) as canonical FK. Slugs are display/routing only.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "cron";

-- ---------------------------------------------------------------------------
-- Tenant config
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_config (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  discord_server_invite_link TEXT,
  default_gate JSONB,
  branding JSONB NOT NULL DEFAULT '{}',
  modules JSONB NOT NULL DEFAULT '{}',
  admins JSONB NOT NULL DEFAULT '[]',
  treasury TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_config_slug ON public.tenant_config(slug);

-- ---------------------------------------------------------------------------
-- Mint metadata (global cache)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mint_metadata (
  mint TEXT PRIMARY KEY,
  name TEXT,
  symbol TEXT,
  image TEXT,
  decimals INTEGER,
  traits JSONB,
  trait_index JSONB,
  seller_fee_basis_points INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mint_metadata_updated_at ON public.mint_metadata(updated_at);

-- ---------------------------------------------------------------------------
-- Tenant mint catalog (slim: mint, kind, label only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_mint_catalog (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id),
  mint TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('SPL', 'NFT')),
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, mint)
);

CREATE INDEX IF NOT EXISTS idx_tenant_mint_catalog_tenant ON public.tenant_mint_catalog(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_mint_catalog_kind ON public.tenant_mint_catalog(tenant_id, kind);

-- ---------------------------------------------------------------------------
-- Collection members (platform-wide)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.collection_members (
  collection_mint TEXT NOT NULL,
  mint TEXT NOT NULL,
  name TEXT,
  image TEXT,
  traits JSONB,
  owner TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection_mint, mint)
);

CREATE INDEX IF NOT EXISTS idx_collection_members_collection ON public.collection_members(collection_mint);

CREATE TABLE IF NOT EXISTS public.tenant_collection_scope (
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id),
  collection_mint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, collection_mint)
);

CREATE INDEX IF NOT EXISTS idx_tenant_collection_scope_tenant ON public.tenant_collection_scope(tenant_id);

CREATE VIEW public.tenant_collection_members AS
SELECT tcs.tenant_id, cm.collection_mint, cm.mint, cm.name, cm.image, cm.traits, cm.owner
FROM public.tenant_collection_scope tcs
JOIN public.collection_members cm ON cm.collection_mint = tcs.collection_mint;

GRANT SELECT ON public.tenant_collection_members TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tenant_collection_members_insert_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_tenant_admin(NEW.tenant_id) THEN
    RAISE EXCEPTION 'Not tenant admin';
  END IF;
  INSERT INTO public.tenant_collection_scope (tenant_id, collection_mint)
  VALUES (NEW.tenant_id, NEW.collection_mint)
  ON CONFLICT (tenant_id, collection_mint) DO NOTHING;
  INSERT INTO public.collection_members (collection_mint, mint, name, image, traits, owner, updated_at)
  VALUES (NEW.collection_mint, NEW.mint, NEW.name, NEW.image, NEW.traits, NEW.owner, NOW())
  ON CONFLICT (collection_mint, mint) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, collection_members.name),
    image = COALESCE(EXCLUDED.image, collection_members.image),
    traits = COALESCE(EXCLUDED.traits, collection_members.traits),
    owner = COALESCE(EXCLUDED.owner, collection_members.owner),
    updated_at = NOW();
  RETURN NEW;
END;
$$;
CREATE TRIGGER tenant_collection_members_insert_trg
  INSTEAD OF INSERT ON public.tenant_collection_members
  FOR EACH ROW EXECUTE FUNCTION public.tenant_collection_members_insert_fn();

CREATE OR REPLACE FUNCTION public.tenant_collection_members_delete_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_tenant_admin(OLD.tenant_id) THEN
    RAISE EXCEPTION 'Not tenant admin';
  END IF;
  DELETE FROM public.tenant_collection_scope
  WHERE tenant_id = OLD.tenant_id AND collection_mint = OLD.collection_mint;
  RETURN OLD;
END;
$$;
CREATE TRIGGER tenant_collection_members_delete_trg
  INSTEAD OF DELETE ON public.tenant_collection_members
  FOR EACH ROW EXECUTE FUNCTION public.tenant_collection_members_delete_fn();

-- ---------------------------------------------------------------------------
-- Holder snapshots (platform-wide)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.holder_snapshots (
  mint TEXT NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL,
  holder_wallets JSONB NOT NULL DEFAULT '[]',
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mint, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_holder_snapshots_mint ON public.holder_snapshots(mint);
CREATE INDEX IF NOT EXISTS idx_holder_snapshots_mint_at ON public.holder_snapshots(mint, snapshot_at DESC);

-- ---------------------------------------------------------------------------
-- Marketplace
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.marketplace_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES public.tenant_config(id),
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marketplace_mint_scope (
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id),
  mint TEXT NOT NULL,
  source TEXT NOT NULL,
  collection_mint TEXT,
  PRIMARY KEY (tenant_id, mint)
);

CREATE INDEX IF NOT EXISTS idx_mint_scope_tenant ON public.marketplace_mint_scope(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mint_scope_collection
  ON public.marketplace_mint_scope(tenant_id, collection_mint)
  WHERE collection_mint IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Discord
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.discord_servers (
  tenant_id TEXT PRIMARY KEY REFERENCES public.tenant_config(id),
  discord_guild_id TEXT NOT NULL UNIQUE,
  guild_name TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bot_invite_state TEXT,
  bot_role_position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discord_servers_guild_id ON public.discord_servers(discord_guild_id);

CREATE TABLE IF NOT EXISTS public.wallet_discord_links (
  wallet_address TEXT PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_discord_links_discord_user ON public.wallet_discord_links(discord_user_id);

CREATE TABLE IF NOT EXISTS public.discord_role_rules (
  id SERIAL PRIMARY KEY,
  discord_guild_id TEXT NOT NULL,
  discord_role_id TEXT NOT NULL,
  operator TEXT NOT NULL DEFAULT 'AND' CHECK (operator IN ('AND', 'OR')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (discord_guild_id, discord_role_id)
);

CREATE INDEX IF NOT EXISTS idx_discord_role_rules_guild ON public.discord_role_rules(discord_guild_id);

CREATE TABLE IF NOT EXISTS public.discord_role_conditions (
  id SERIAL PRIMARY KEY,
  role_rule_id INTEGER NOT NULL REFERENCES public.discord_role_rules(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('HOLDING', 'TRAIT', 'DISCORD', 'WHITELIST')),
  payload JSONB NOT NULL DEFAULT '{}',
  logic_to_next TEXT CHECK (logic_to_next IS NULL OR logic_to_next IN ('AND', 'OR')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discord_role_conditions_rule ON public.discord_role_conditions(role_rule_id);

CREATE TABLE IF NOT EXISTS public.discord_holder_snapshots (
  asset_id TEXT PRIMARY KEY,
  holder_wallets JSONB NOT NULL DEFAULT '[]',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discord_holder_snapshots_updated ON public.discord_holder_snapshots(last_updated);

CREATE TABLE IF NOT EXISTS public.discord_audit_log (
  id SERIAL PRIMARY KEY,
  discord_guild_id TEXT,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discord_audit_log_guild ON public.discord_audit_log(discord_guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_audit_log_created ON public.discord_audit_log(created_at);

CREATE TABLE IF NOT EXISTS public.discord_verify_sessions (
  token TEXT PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  discord_guild_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discord_verify_sessions_expires ON public.discord_verify_sessions(expires_at);

CREATE TABLE IF NOT EXISTS public.discord_role_removal_queue (
  id SERIAL PRIMARY KEY,
  discord_guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  discord_role_id TEXT NOT NULL,
  scheduled_remove_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discord_removal_queue_guild_scheduled
  ON public.discord_role_removal_queue(discord_guild_id, scheduled_remove_at);

CREATE TABLE IF NOT EXISTS public.discord_guild_roles (
  discord_guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  color INTEGER,
  icon TEXT,
  unicode_emoji TEXT,
  PRIMARY KEY (discord_guild_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_discord_guild_roles_guild ON public.discord_guild_roles(discord_guild_id);

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id),
  module_id TEXT NOT NULL,
  scope_key TEXT NOT NULL DEFAULT '',
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'yearly')),
  recurring_amount_usdc NUMERIC(12,6) NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  conditions_snapshot JSONB NOT NULL DEFAULT '{}',
  price_snapshot JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, module_id, scope_key)
);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_tenant ON public.billing_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_period_end ON public.billing_subscriptions(period_end);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_scope ON public.billing_subscriptions(tenant_id, module_id);

CREATE TABLE IF NOT EXISTS public.billing_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  scope_key TEXT NOT NULL DEFAULT '',
  payment_type TEXT NOT NULL CHECK (payment_type IN ('initial', 'upgrade_prorate', 'renewal', 'extend', 'registration', 'add_unit')),
  amount_usdc NUMERIC(12,6) NOT NULL,
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'yearly')),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  tx_signature TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'expired')),
  memo TEXT NOT NULL,
  payer_wallet TEXT NOT NULL,
  conditions_snapshot JSONB,
  price_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_payments_tenant ON public.billing_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_payments_status ON public.billing_payments(status);
CREATE INDEX IF NOT EXISTS idx_billing_payments_expires_at ON public.billing_payments(expires_at);
CREATE INDEX IF NOT EXISTS idx_billing_payments_tx_signature ON public.billing_payments(tx_signature);

-- ---------------------------------------------------------------------------
-- Raffles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_raffles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id),
  raffle_pubkey TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  UNIQUE (tenant_id, raffle_pubkey)
);

CREATE INDEX IF NOT EXISTS idx_tenant_raffles_tenant ON public.tenant_raffles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_raffles_closed
  ON public.tenant_raffles(tenant_id, closed_at)
  WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.raffle_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES public.tenant_config(id),
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Billing state fallback
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_module_billing_state (
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id),
  module_id TEXT NOT NULL,
  selected_tier_id TEXT,
  period_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_module_billing_state_tenant ON public.tenant_module_billing_state(tenant_id);

-- ---------------------------------------------------------------------------
-- Platform
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_owner (
  wallet_address TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_wallet TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_log_created_at ON public.platform_audit_log(created_at);

-- ---------------------------------------------------------------------------
-- Tracker / Watchtower
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tracker_address_book (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id),
  mint TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'base' CHECK (tier IN ('base', 'grow', 'pro')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, mint)
);

CREATE INDEX IF NOT EXISTS idx_tracker_address_book_tenant ON public.tracker_address_book(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tracker_address_book_tier ON public.tracker_address_book(tenant_id, tier);

CREATE TABLE IF NOT EXISTS public.watchtower_watches (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id),
  mint TEXT NOT NULL,
  track_discord BOOLEAN NOT NULL DEFAULT FALSE,
  track_snapshot BOOLEAN NOT NULL DEFAULT FALSE,
  track_transactions BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, mint)
);

CREATE INDEX IF NOT EXISTS idx_watchtower_watches_tenant ON public.watchtower_watches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_watchtower_watches_snapshot ON public.watchtower_watches(tenant_id) WHERE track_snapshot = TRUE;
CREATE INDEX IF NOT EXISTS idx_watchtower_watches_discord ON public.watchtower_watches(tenant_id) WHERE track_discord = TRUE;

CREATE TABLE IF NOT EXISTS public.tracker_holder_snapshots (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  mint TEXT NOT NULL,
  holder_wallets JSONB NOT NULL DEFAULT '[]',
  snapshot_date DATE NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, mint, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_tracker_holder_snapshots_tenant_mint ON public.tracker_holder_snapshots(tenant_id, mint);
CREATE INDEX IF NOT EXISTS idx_tracker_holder_snapshots_date ON public.tracker_holder_snapshots(snapshot_date);

CREATE TABLE IF NOT EXISTS public.addressbook_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES public.tenant_config(id),
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Gates (access lists)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gate_metadata (
  address TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  authority TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tenant_gate_lists (
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id),
  address TEXT NOT NULL REFERENCES public.gate_metadata(address),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, address)
);

CREATE INDEX IF NOT EXISTS idx_tenant_gate_lists_tenant ON public.tenant_gate_lists(tenant_id);

CREATE VIEW public.gate_lists AS
SELECT twl.tenant_id, twl.address, wm.name, wm.authority, wm.image_url
FROM public.tenant_gate_lists twl
JOIN public.gate_metadata wm ON wm.address = twl.address;

GRANT SELECT ON public.gate_lists TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.gate_lists_insert_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.gate_metadata (address, name, authority, image_url, updated_at)
  VALUES (NEW.address, NEW.name, COALESCE(NEW.authority, ''), NEW.image_url, NOW())
  ON CONFLICT (address) DO UPDATE SET name = EXCLUDED.name, image_url = EXCLUDED.image_url, updated_at = NOW();
  INSERT INTO public.tenant_gate_lists (tenant_id, address)
  VALUES (NEW.tenant_id, NEW.address)
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

-- ---------------------------------------------------------------------------
-- Tenant context view
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.tenant_context_view AS
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
  rs.settings AS raffle_settings
FROM public.tenant_config tc
LEFT JOIN public.marketplace_settings ms ON ms.tenant_id = tc.id
LEFT JOIN public.raffle_settings rs ON rs.tenant_id = tc.id;

-- ---------------------------------------------------------------------------
-- Auth
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_wallet()
RETURNS text
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT NULLIF(TRIM(COALESCE(
    current_setting('request.jwt.claims', true)::json->>'wallet_address',
    auth.jwt()->>'wallet_address',
    auth.jwt()->'user_metadata'->'custom_claims'->>'address',
    current_setting('request.jwt.claims', true)::json->'user_metadata'->'custom_claims'->>'address'
  )), '');
$$;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wallet_addr text;
BEGIN
  SELECT COALESCE(
    raw_user_meta_data->>'wallet_address',
    raw_user_meta_data->'custom_claims'->>'address'
  )
  INTO wallet_addr
  FROM auth.users
  WHERE id = (event->>'user_id')::uuid;

  IF wallet_addr IS NOT NULL THEN
    event := jsonb_set(event, '{claims,wallet_address}', to_jsonb(wallet_addr));
  END IF;
  RETURN event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_tenant_admin(t_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_config
    WHERE id = t_id
    AND admins @> to_jsonb(public.auth_wallet())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_guild_admin(guild_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.discord_servers ds
    JOIN public.tenant_config tc ON tc.id = ds.tenant_id
    WHERE ds.discord_guild_id = guild_id
    AND tc.admins @> to_jsonb(public.auth_wallet())
  );
$$;

CREATE OR REPLACE FUNCTION public.check_platform_admin()
RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT po.wallet_address
  FROM public.platform_owner po
  WHERE po.wallet_address = public.auth_wallet()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.check_platform_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenant_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mint_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_mint_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_collection_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holder_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_mint_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_discord_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_role_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_role_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_holder_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_verify_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_role_removal_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_guild_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_raffles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_module_billing_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_owner ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_address_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchtower_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_holder_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addressbook_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_gate_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gate_metadata_public_read" ON public.gate_metadata FOR SELECT USING (true);
CREATE POLICY "tenant_gate_lists_public_read" ON public.tenant_gate_lists FOR SELECT USING (true);
CREATE POLICY "tenant_gate_lists_admin_write" ON public.tenant_gate_lists FOR ALL
  USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));

CREATE POLICY "tenant_config_public_read" ON public.tenant_config FOR SELECT USING (true);
CREATE POLICY "tenant_config_admin_update" ON public.tenant_config FOR UPDATE
  USING (public.is_tenant_admin(id)) WITH CHECK (public.is_tenant_admin(id));

CREATE POLICY "mint_metadata_public_read" ON public.mint_metadata FOR SELECT USING (true);

CREATE POLICY "tenant_mint_catalog_admin_write" ON public.tenant_mint_catalog FOR ALL
  USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));

-- tenant_collection_members is a view; access controlled via trigger + underlying table policies
CREATE POLICY "collection_members_public_read" ON public.collection_members FOR SELECT USING (true);
CREATE POLICY "tenant_collection_scope_admin_all" ON public.tenant_collection_scope FOR ALL
  USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));

CREATE POLICY "holder_snapshots_public_read" ON public.holder_snapshots FOR SELECT USING (true);

CREATE POLICY "marketplace_settings_public_read" ON public.marketplace_settings FOR SELECT USING (true);
CREATE POLICY "marketplace_settings_admin_write" ON public.marketplace_settings FOR ALL
  USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));

CREATE POLICY "marketplace_mint_scope_public_read" ON public.marketplace_mint_scope FOR SELECT USING (true);

CREATE POLICY "discord_servers_admin_read" ON public.discord_servers FOR SELECT
  USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "wallet_discord_links_own_read" ON public.wallet_discord_links FOR SELECT
  USING (wallet_address = public.auth_wallet());

CREATE POLICY "discord_role_rules_admin_all" ON public.discord_role_rules FOR ALL
  USING (public.is_guild_admin(discord_guild_id)) WITH CHECK (public.is_guild_admin(discord_guild_id));

CREATE POLICY "discord_role_conditions_admin_all" ON public.discord_role_conditions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.discord_role_rules r WHERE r.id = role_rule_id AND public.is_guild_admin(r.discord_guild_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.discord_role_rules r WHERE r.id = role_rule_id AND public.is_guild_admin(r.discord_guild_id)));

CREATE POLICY "discord_audit_log_admin_read" ON public.discord_audit_log FOR SELECT
  USING (public.is_guild_admin(discord_guild_id));

CREATE POLICY "discord_guild_roles_admin_read" ON public.discord_guild_roles FOR SELECT
  USING (public.is_guild_admin(discord_guild_id));

CREATE POLICY "billing_subscriptions_admin_read" ON public.billing_subscriptions FOR SELECT
  USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "billing_payments_admin_read" ON public.billing_payments FOR SELECT
  USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "tenant_raffles_public_read" ON public.tenant_raffles FOR SELECT USING (true);
CREATE POLICY "raffle_settings_public_read" ON public.raffle_settings FOR SELECT USING (true);
CREATE POLICY "raffle_settings_admin_write" ON public.raffle_settings FOR ALL
  USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));

CREATE POLICY "tenant_module_billing_state_admin_read" ON public.tenant_module_billing_state FOR SELECT
  USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "platform_owner_own_check" ON public.platform_owner FOR SELECT TO authenticated
  USING (wallet_address = public.auth_wallet());

CREATE POLICY "platform_owner_anon_block" ON public.platform_owner FOR ALL TO anon USING (false);

CREATE POLICY "tracker_address_book_admin_write" ON public.tracker_address_book FOR ALL
  USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));

CREATE POLICY "watchtower_watches_admin_all" ON public.watchtower_watches FOR ALL
  USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));

CREATE POLICY "tracker_holder_snapshots_admin_read" ON public.tracker_holder_snapshots FOR SELECT
  USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "addressbook_settings_admin_all" ON public.addressbook_settings FOR ALL
  USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));

-- ---------------------------------------------------------------------------
-- Cron jobs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invoke_edge_function(fn_name text, body_json jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url text;
  service_key  text;
BEGIN
  supabase_url := current_setting('app.supabase_url', true);
  service_key  := current_setting('app.service_role_key', true);
  IF supabase_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING 'invoke_edge_function: app.supabase_url or app.service_role_key not set; skipping %', fn_name;
    RETURN;
  END IF;
  PERFORM extensions.http_post(
    url     := supabase_url || '/functions/v1/' || fn_name,
    headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
    body    := body_json::text
  );
END;
$$;

SELECT cron.schedule('module-lifecycle', '*/15 * * * *', $$SELECT public.invoke_edge_function('cron-lifecycle')$$);
SELECT cron.schedule('tracker-sync', '*/5 * * * *', $$SELECT public.invoke_edge_function('cron-tracker')$$);
SELECT cron.schedule('expire-stale-payments', '0 * * * *', $$SELECT public.invoke_edge_function('billing', '{"action":"expire-stale"}'::jsonb)$$);
