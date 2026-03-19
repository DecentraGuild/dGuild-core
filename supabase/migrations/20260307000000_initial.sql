-- DecentraGuild schema (consolidated).
-- All tables use tenant_id (tenant_config.id) as canonical FK. Slugs are display/routing only.
-- Merged: 20260307000000 through 20260332000000. Final schema: no renames, v2 billing only.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "cron";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";

-- ---------------------------------------------------------------------------
-- Tenant config
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_config (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  discord_server_invite_link TEXT,
  homepage TEXT,
  x_link TEXT,
  telegram_link TEXT,
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
-- Mint metadata (global cache, extended)
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
  update_authority TEXT,
  uri TEXT,
  primary_sale_happened BOOLEAN,
  is_mutable BOOLEAN,
  edition_nonce INTEGER,
  token_standard TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mint_metadata_updated_at ON public.mint_metadata(updated_at);

-- ---------------------------------------------------------------------------
-- Tenant mint catalog (slim + shipment_banner_image)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_mint_catalog (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id),
  mint TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('SPL', 'NFT')),
  label TEXT,
  shipment_banner_image TEXT,
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

CREATE TABLE IF NOT EXISTS public.marketplace_currencies (
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id) ON DELETE CASCADE,
  mint TEXT NOT NULL,
  PRIMARY KEY (tenant_id, mint)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_currencies_tenant ON public.marketplace_currencies(tenant_id);

-- ---------------------------------------------------------------------------
-- Condition sets (tenant-scoped, reusable; discord_role_rules references)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.condition_sets (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  rule_type TEXT NOT NULL DEFAULT 'binary' CHECK (rule_type IN ('binary', 'weighted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_condition_sets_tenant ON public.condition_sets(tenant_id);

CREATE TABLE IF NOT EXISTS public.condition_set_conditions (
  id SERIAL PRIMARY KEY,
  condition_set_id INTEGER NOT NULL REFERENCES public.condition_sets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('HOLDING', 'TRAIT', 'DISCORD', 'WHITELIST', 'SHIPMENT', 'SNAPSHOTS', 'TIME_WEIGHTED')),
  payload JSONB NOT NULL DEFAULT '{}',
  logic_to_next TEXT CHECK (logic_to_next IS NULL OR logic_to_next IN ('AND', 'OR')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_condition_set_conditions_set ON public.condition_set_conditions(condition_set_id);

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
  condition_set_id INTEGER NOT NULL REFERENCES public.condition_sets(id) ON DELETE CASCADE,
  operator TEXT NOT NULL DEFAULT 'AND' CHECK (operator IN ('AND', 'OR')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (discord_guild_id, discord_role_id)
);

CREATE INDEX IF NOT EXISTS idx_discord_role_rules_guild ON public.discord_role_rules(discord_guild_id);

CREATE TABLE IF NOT EXISTS public.holder_current (
  mint TEXT PRIMARY KEY,
  holder_wallets JSONB NOT NULL DEFAULT '[]',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holder_current_updated ON public.holder_current(last_updated);

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

CREATE TABLE IF NOT EXISTS public.discord_member_roles (
  discord_guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  role_ids JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (discord_guild_id, discord_user_id)
);

CREATE INDEX IF NOT EXISTS idx_discord_member_roles_guild
  ON public.discord_member_roles(discord_guild_id);

-- ---------------------------------------------------------------------------
-- Pricing Engine v2: meters, bundles, billing_quotes, billing_payments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.meters (
  meter_key TEXT PRIMARY KEY,
  product_key TEXT NOT NULL,
  unit TEXT,
  description TEXT,
  capability BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.meter_dependencies (
  meter_key TEXT NOT NULL REFERENCES public.meters(meter_key),
  requires_meter TEXT NOT NULL REFERENCES public.meters(meter_key),
  PRIMARY KEY (meter_key, requires_meter)
);

CREATE TABLE IF NOT EXISTS public.duration_rules (
  duration_days INTEGER PRIMARY KEY,
  price_multiplier NUMERIC(12,6) NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tier_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key TEXT NOT NULL,
  meter_key TEXT NOT NULL,
  min_quantity NUMERIC NOT NULL,
  max_quantity NUMERIC,
  unit_price NUMERIC(12,6) NOT NULL,
  tier_price NUMERIC(12,6),
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tier_rules_lookup ON public.tier_rules(product_key, meter_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tier_rules_unique ON public.tier_rules(product_key, meter_key, min_quantity);

CREATE TABLE IF NOT EXISTS public.bundles (
  id TEXT PRIMARY KEY,
  product_key TEXT NOT NULL,
  price_usdc NUMERIC(12,6) NOT NULL,
  label TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  price_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bundles_product ON public.bundles(product_key);

CREATE TABLE IF NOT EXISTS public.bundle_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id TEXT NOT NULL REFERENCES public.bundles(id),
  meter_key TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bundle_id, meter_key)
);

CREATE TABLE IF NOT EXISTS public.bundle_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id TEXT NOT NULL REFERENCES public.bundles(id),
  token_mint TEXT NOT NULL,
  decimals INTEGER NOT NULL DEFAULT 0,
  tokens_required NUMERIC NOT NULL DEFAULT 1,
  max_redemptions_per_tenant INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bundle_id, token_mint)
);
CREATE INDEX IF NOT EXISTS idx_bundle_vouchers_mint ON public.bundle_vouchers(token_mint);

CREATE TABLE IF NOT EXISTS public.billing_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  line_items JSONB NOT NULL DEFAULT '[]',
  price_usdc NUMERIC(12,6) NOT NULL,
  meter_snapshot JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_quotes_expires ON public.billing_quotes(expires_at);
CREATE INDEX IF NOT EXISTS idx_billing_quotes_tenant ON public.billing_quotes(tenant_id);

CREATE TABLE IF NOT EXISTS public.billing_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  amount_usdc NUMERIC(12,6) NOT NULL,
  tx_signature TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'expired')),
  memo TEXT NOT NULL,
  payer_wallet TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'usdc' CHECK (payment_method IN ('usdc', 'voucher')),
  voucher_mint TEXT,
  bundle_id TEXT REFERENCES public.bundles(id),
  quote_id UUID REFERENCES public.billing_quotes(id)
);

CREATE INDEX IF NOT EXISTS idx_billing_payments_tenant ON public.billing_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_payments_status ON public.billing_payments(status);
CREATE INDEX IF NOT EXISTS idx_billing_payments_expires_at ON public.billing_payments(expires_at);
CREATE UNIQUE INDEX idx_billing_payments_tx_signature ON public.billing_payments(tx_signature)
  WHERE tx_signature IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Granted entitlements + aggregate
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.granted_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  meter_key TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  payment_id UUID REFERENCES public.billing_payments(id),
  bundle_id TEXT REFERENCES public.bundles(id)
);
CREATE INDEX IF NOT EXISTS idx_granted_entitlements_tenant ON public.granted_entitlements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_granted_entitlements_expires ON public.granted_entitlements(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tenant_meter_limits (
  tenant_id TEXT NOT NULL,
  meter_key TEXT NOT NULL,
  quantity_total NUMERIC NOT NULL DEFAULT 0,
  expires_at_max TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, meter_key)
);

CREATE TABLE IF NOT EXISTS public.entitlement_expiry_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id UUID NOT NULL REFERENCES public.granted_entitlements(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  meter_key TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expiry_queue_pending ON public.entitlement_expiry_queue(expires_at) WHERE processed = false;

CREATE TABLE IF NOT EXISTS public.tenant_voucher_redemption_totals (
  tenant_id TEXT NOT NULL,
  voucher_mint TEXT NOT NULL,
  bundle_id TEXT NOT NULL REFERENCES public.bundles(id),
  count NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, voucher_mint, bundle_id)
);

CREATE TABLE IF NOT EXISTS public.voucher_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  voucher_mint TEXT NOT NULL,
  bundle_id TEXT NOT NULL REFERENCES public.bundles(id),
  payment_id UUID NOT NULL REFERENCES public.billing_payments(id),
  quantity NUMERIC NOT NULL DEFAULT 1,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Individual vouchers: mint -> entitlements (meter_key, quantity, duration_days)
CREATE TABLE IF NOT EXISTS public.individual_vouchers (
  mint TEXT PRIMARY KEY,
  max_redemptions_per_tenant INTEGER,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.individual_voucher_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mint TEXT NOT NULL REFERENCES public.individual_vouchers(mint) ON DELETE CASCADE,
  meter_key TEXT NOT NULL REFERENCES public.meters(meter_key),
  quantity NUMERIC NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mint, meter_key)
);
CREATE INDEX IF NOT EXISTS idx_individual_voucher_entitlements_mint ON public.individual_voucher_entitlements(mint);

CREATE TABLE IF NOT EXISTS public.individual_voucher_redemption_totals (
  tenant_id TEXT NOT NULL,
  voucher_mint TEXT NOT NULL REFERENCES public.individual_vouchers(mint),
  count NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, voucher_mint)
);

CREATE TABLE IF NOT EXISTS public.individual_voucher_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  voucher_mint TEXT NOT NULL,
  payment_id UUID NOT NULL REFERENCES public.billing_payments(id),
  quantity NUMERIC NOT NULL DEFAULT 1,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_individual_voucher_redemptions_tenant ON public.individual_voucher_redemptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_individual_voucher_redemptions_mint ON public.individual_voucher_redemptions(voucher_mint);

CREATE TABLE IF NOT EXISTS public.voucher_drafts (
  mint TEXT PRIMARY KEY,
  actor_wallet TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.granted_entitlements_ledger_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.tenant_meter_limits (tenant_id, meter_key, quantity_total, expires_at_max, updated_at)
    VALUES (NEW.tenant_id, NEW.meter_key, NEW.quantity, NEW.expires_at, NOW())
    ON CONFLICT (tenant_id, meter_key) DO UPDATE SET
      quantity_total = public.tenant_meter_limits.quantity_total + NEW.quantity,
      expires_at_max = GREATEST(public.tenant_meter_limits.expires_at_max, NEW.expires_at),
      updated_at = NOW();
    IF NEW.expires_at IS NOT NULL THEN
      INSERT INTO public.entitlement_expiry_queue (entitlement_id, tenant_id, meter_key, quantity, expires_at)
      VALUES (NEW.id, NEW.tenant_id, NEW.meter_key, NEW.quantity, NEW.expires_at);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.tenant_meter_limits SET
      quantity_total = quantity_total - OLD.quantity + NEW.quantity,
      expires_at_max = (SELECT MAX(ge.expires_at) FROM public.granted_entitlements ge
         WHERE ge.tenant_id = NEW.tenant_id AND ge.meter_key = NEW.meter_key),
      updated_at = NOW()
    WHERE tenant_id = OLD.tenant_id AND meter_key = OLD.meter_key;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.tenant_meter_limits SET
      quantity_total = quantity_total - OLD.quantity,
      expires_at_max = (SELECT MAX(ge.expires_at) FROM public.granted_entitlements ge
         WHERE ge.tenant_id = OLD.tenant_id AND ge.meter_key = OLD.meter_key AND ge.id != OLD.id),
      updated_at = NOW()
    WHERE tenant_id = OLD.tenant_id AND meter_key = OLD.meter_key;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS granted_entitlements_ledger_trg ON public.granted_entitlements;
CREATE TRIGGER granted_entitlements_ledger_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.granted_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.granted_entitlements_ledger_fn();

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
-- Shipment records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shipment_records (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id) ON DELETE CASCADE,
  mint TEXT NOT NULL,
  recipient_count INTEGER NOT NULL,
  total_amount NUMERIC NOT NULL,
  tx_signature TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipment_records_tenant ON public.shipment_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shipment_records_created_at ON public.shipment_records(created_at DESC);

-- ---------------------------------------------------------------------------
-- Crafter
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.crafter_tokens (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id),
  mint TEXT NOT NULL,
  billing_payment_id UUID REFERENCES public.billing_payments(id),
  name TEXT,
  symbol TEXT,
  decimals INTEGER,
  description TEXT,
  image_url TEXT,
  metadata_uri TEXT,
  storage_backend TEXT NOT NULL CHECK (storage_backend IN ('api', 'selfhost')),
  authority TEXT NOT NULL,
  seller_fee_basis_points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, mint)
);

CREATE INDEX IF NOT EXISTS idx_crafter_tokens_tenant ON public.crafter_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crafter_tokens_authority ON public.crafter_tokens(authority);

CREATE TABLE IF NOT EXISTS public.crafter_pending (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id),
  mint TEXT NOT NULL,
  memo TEXT NOT NULL,
  metadata_json JSONB NOT NULL,
  authority TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crafter_pending_mint_memo ON public.crafter_pending(mint, memo);
CREATE INDEX IF NOT EXISTS idx_crafter_pending_expires ON public.crafter_pending(expires_at);

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
-- Tracker / Watchtower (track_holders, enabled_at_holders)
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
  track_holders BOOLEAN NOT NULL DEFAULT FALSE,
  track_snapshot BOOLEAN NOT NULL DEFAULT FALSE,
  track_transactions BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_at_holders TIMESTAMPTZ,
  enabled_at_snapshot TIMESTAMPTZ,
  enabled_at_transactions TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, mint)
);

CREATE INDEX IF NOT EXISTS idx_watchtower_watches_tenant ON public.watchtower_watches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_watchtower_watches_snapshot ON public.watchtower_watches(tenant_id) WHERE track_snapshot = TRUE;
CREATE INDEX IF NOT EXISTS idx_watchtower_watches_holders ON public.watchtower_watches(tenant_id) WHERE track_holders = TRUE;

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
-- Cron edge config (local fallback for invoke_edge_function; hosted: Vault)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cron_edge_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO public.cron_edge_config (key, value) VALUES
  ('supabase_url', 'http://host.docker.internal:65421'),
  ('service_role_key', '')
ON CONFLICT (key) DO NOTHING;

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
  rs.settings AS raffle_settings,
  tc.homepage,
  tc.x_link,
  tc.telegram_link,
  (SELECT array_agg(mc.mint ORDER BY mc.mint) FROM public.marketplace_currencies mc WHERE mc.tenant_id = tc.id) AS currency_mints
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
-- invoke_edge_function (pg_cron → Edge via pg_net)
-- Credentials: optional app.* settings, then Vault secrets (hosted), then cron_edge_config (local).
-- Vault names: cron_invoke_supabase_url, cron_invoke_service_role_key (create in Dashboard → Vault or SQL).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invoke_edge_function(fn_name text, body_json jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  supabase_url text;
  service_key  text;
BEGIN
  supabase_url := COALESCE(
    NULLIF(TRIM(current_setting('app.supabase_url', true)), ''),
    NULLIF(TRIM((SELECT ds.decrypted_secret FROM vault.decrypted_secrets ds WHERE ds.name = 'cron_invoke_supabase_url' LIMIT 1)), ''),
    NULLIF(TRIM((SELECT c.value FROM public.cron_edge_config c WHERE c.key = 'supabase_url')), '')
  );
  service_key := COALESCE(
    NULLIF(TRIM(current_setting('app.service_role_key', true)), ''),
    NULLIF(TRIM((SELECT ds.decrypted_secret FROM vault.decrypted_secrets ds WHERE ds.name = 'cron_invoke_service_role_key' LIMIT 1)), ''),
    NULLIF(TRIM((SELECT c.value FROM public.cron_edge_config c WHERE c.key = 'service_role_key')), '')
  );

  IF supabase_url IS NULL OR service_key IS NULL OR service_key = '' THEN
    RAISE WARNING 'invoke_edge_function: supabase_url or service_role_key not set; skipping %', fn_name;
    RETURN;
  END IF;
  PERFORM extensions.http_post(
    url     := rtrim(supabase_url, '/') || '/functions/v1/' || fn_name,
    headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
    body    := body_json::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_edge_function(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_edge_function(text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.invoke_edge_function(text, jsonb) FROM authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket: crafter-metadata
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('crafter-metadata', 'crafter-metadata', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('voucher-metadata', 'voucher-metadata', true)
ON CONFLICT (id) DO NOTHING;

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
ALTER TABLE public.marketplace_currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condition_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condition_set_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_discord_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_role_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holder_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_verify_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_role_removal_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_guild_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_member_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_edge_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_raffles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crafter_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crafter_pending ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_owner ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_address_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchtower_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_holder_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addressbook_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_gate_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.granted_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_meter_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_expiry_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_voucher_redemption_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.individual_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.individual_voucher_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.individual_voucher_redemption_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.individual_voucher_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gate_metadata_public_read" ON public.gate_metadata FOR SELECT USING (true);
CREATE POLICY "tenant_gate_lists_public_read" ON public.tenant_gate_lists FOR SELECT USING (true);
CREATE POLICY "tenant_gate_lists_admin_insert" ON public.tenant_gate_lists
  FOR INSERT WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant_gate_lists_admin_update" ON public.tenant_gate_lists
  FOR UPDATE USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant_gate_lists_admin_delete" ON public.tenant_gate_lists
  FOR DELETE USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "tenant_config_public_read" ON public.tenant_config FOR SELECT USING (true);
CREATE POLICY "tenant_config_admin_update" ON public.tenant_config FOR UPDATE
  USING (public.is_tenant_admin(id)) WITH CHECK (public.is_tenant_admin(id));

CREATE POLICY "mint_metadata_public_read" ON public.mint_metadata FOR SELECT USING (true);

CREATE POLICY "tenant_mint_catalog_public_read" ON public.tenant_mint_catalog FOR SELECT USING (true);
CREATE POLICY "tenant_mint_catalog_admin_insert" ON public.tenant_mint_catalog
  FOR INSERT WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant_mint_catalog_admin_update" ON public.tenant_mint_catalog
  FOR UPDATE USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant_mint_catalog_admin_delete" ON public.tenant_mint_catalog
  FOR DELETE USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "collection_members_public_read" ON public.collection_members FOR SELECT USING (true);
CREATE POLICY "tenant_collection_scope_admin_all" ON public.tenant_collection_scope FOR ALL
  USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));

CREATE POLICY "holder_snapshots_public_read" ON public.holder_snapshots FOR SELECT USING (true);

CREATE POLICY "marketplace_settings_public_read" ON public.marketplace_settings FOR SELECT USING (true);
CREATE POLICY "marketplace_settings_admin_insert" ON public.marketplace_settings
  FOR INSERT WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "marketplace_settings_admin_update" ON public.marketplace_settings
  FOR UPDATE USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "marketplace_settings_admin_delete" ON public.marketplace_settings
  FOR DELETE USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "marketplace_mint_scope_public_read" ON public.marketplace_mint_scope FOR SELECT USING (true);

CREATE POLICY "marketplace_currencies_public_read" ON public.marketplace_currencies FOR SELECT USING (true);
CREATE POLICY "marketplace_currencies_admin_insert" ON public.marketplace_currencies
  FOR INSERT WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "marketplace_currencies_admin_update" ON public.marketplace_currencies
  FOR UPDATE USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "marketplace_currencies_admin_delete" ON public.marketplace_currencies
  FOR DELETE USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "condition_sets_tenant_admin_all" ON public.condition_sets FOR ALL
  USING (public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_tenant_admin(tenant_id));

CREATE POLICY "condition_set_conditions_tenant_admin_all" ON public.condition_set_conditions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.condition_sets cs
      WHERE cs.id = condition_set_id AND public.is_tenant_admin(cs.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.condition_sets cs
      WHERE cs.id = condition_set_id AND public.is_tenant_admin(cs.tenant_id)
    )
  );

CREATE POLICY "discord_servers_admin_read" ON public.discord_servers FOR SELECT
  USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "wallet_discord_links_own_read" ON public.wallet_discord_links FOR SELECT
  USING (wallet_address = public.auth_wallet());

CREATE POLICY "discord_role_rules_admin_all" ON public.discord_role_rules FOR ALL
  USING (public.is_guild_admin(discord_guild_id)) WITH CHECK (public.is_guild_admin(discord_guild_id));

CREATE POLICY "holder_current_public_read" ON public.holder_current FOR SELECT USING (true);

CREATE POLICY "discord_audit_log_admin_read" ON public.discord_audit_log FOR SELECT
  USING (public.is_guild_admin(discord_guild_id));

CREATE POLICY "discord_guild_roles_admin_read" ON public.discord_guild_roles FOR SELECT
  USING (public.is_guild_admin(discord_guild_id));

CREATE POLICY "discord_member_roles_no_direct_access" ON public.discord_member_roles
  FOR ALL USING (false) WITH CHECK (false);

CREATE POLICY "cron_edge_config_no_direct_access" ON public.cron_edge_config
  FOR ALL USING (false) WITH CHECK (false);

CREATE POLICY "crafter_pending_no_direct_access" ON public.crafter_pending
  FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "discord_role_removal_queue_no_direct_access" ON public.discord_role_removal_queue
  FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "discord_verify_sessions_no_direct_access" ON public.discord_verify_sessions
  FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "entitlement_expiry_queue_no_direct_access" ON public.entitlement_expiry_queue
  FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "platform_audit_log_no_direct_access" ON public.platform_audit_log
  FOR ALL USING (false) WITH CHECK (false);

CREATE POLICY "meters_public_read" ON public.meters FOR SELECT USING (true);
CREATE POLICY "meter_dependencies_public_read" ON public.meter_dependencies FOR SELECT USING (true);
CREATE POLICY "duration_rules_public_read" ON public.duration_rules FOR SELECT USING (true);
CREATE POLICY "tier_rules_public_read" ON public.tier_rules FOR SELECT USING (true);

CREATE POLICY "billing_payments_admin_read" ON public.billing_payments FOR SELECT
  USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "tenant_raffles_public_read" ON public.tenant_raffles FOR SELECT USING (true);
CREATE POLICY "raffle_settings_public_read" ON public.raffle_settings FOR SELECT USING (true);
CREATE POLICY "raffle_settings_admin_insert" ON public.raffle_settings
  FOR INSERT WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "raffle_settings_admin_update" ON public.raffle_settings
  FOR UPDATE USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "raffle_settings_admin_delete" ON public.raffle_settings
  FOR DELETE USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "shipment_records_tenant_admin_read" ON public.shipment_records
  FOR SELECT USING (public.is_tenant_admin(tenant_id));
CREATE POLICY "shipment_records_tenant_admin_insert" ON public.shipment_records
  FOR INSERT WITH CHECK (public.is_tenant_admin(tenant_id));

CREATE POLICY "crafter_tokens_admin_read" ON public.crafter_tokens FOR SELECT
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

CREATE POLICY "bundles_admin_only" ON public.bundles FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "bundle_entitlements_admin_only" ON public.bundle_entitlements FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "bundle_vouchers_admin_only" ON public.bundle_vouchers FOR ALL USING (false) WITH CHECK (false);

CREATE POLICY "individual_vouchers_admin_only" ON public.individual_vouchers FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "individual_voucher_entitlements_admin_only" ON public.individual_voucher_entitlements FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "individual_voucher_redemption_totals_admin_read" ON public.individual_voucher_redemption_totals FOR SELECT
  USING ((select auth.role()) = 'service_role');
CREATE POLICY "individual_voucher_redemptions_admin_read" ON public.individual_voucher_redemptions FOR SELECT
  USING ((select auth.role()) = 'service_role');
CREATE POLICY "voucher_drafts_admin_only" ON public.voucher_drafts FOR ALL USING (false) WITH CHECK (false);

CREATE POLICY "granted_entitlements_admin_read" ON public.granted_entitlements FOR SELECT
  USING (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant_meter_limits_admin_read" ON public.tenant_meter_limits FOR SELECT
  USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "billing_quotes_admin_read" ON public.billing_quotes FOR SELECT
  USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "tenant_voucher_redemption_totals_admin_read" ON public.tenant_voucher_redemption_totals FOR SELECT
  USING (public.is_tenant_admin(tenant_id));
CREATE POLICY "voucher_redemptions_admin_read" ON public.voucher_redemptions FOR SELECT
  USING (public.is_tenant_admin(tenant_id));

-- ---------------------------------------------------------------------------
-- View security_invoker
-- ---------------------------------------------------------------------------

ALTER VIEW public.gate_lists SET (security_invoker = on);
ALTER VIEW public.tenant_collection_members SET (security_invoker = on);
ALTER VIEW public.tenant_context_view SET (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Seed: meters, duration_rules, tier_rules (marketplace flat + raffles three tiers)
-- ---------------------------------------------------------------------------

INSERT INTO public.meters (meter_key, product_key, unit, description, capability) VALUES
  ('mints_count', 'marketplace', 'mints', 'Collection + SPL mints count', false),
  ('base_currencies_count', 'marketplace', 'currencies', 'SOL, USDC, USDT, WBTC', false),
  ('custom_currencies', 'marketplace', 'currencies', 'Custom currency count beyond base', false),
  ('monetize_storefront', 'marketplace', null, '1 if shop fees enabled', true),
  ('mints_current', 'watchtower', 'holders', 'Mints with current holders track', false),
  ('mints_snapshot', 'watchtower', 'snapshot', 'Mints with snapshot track', false),
  ('mints_transactions', 'watchtower', 'transactions', 'Mints with transactions track', false),
  ('raffle_hosting', 'raffles', null, 'Can host raffles (0 or 1)', true),
  ('raffle_slots', 'raffles', 'slots', 'Open raffles count', false),
  ('gate_lists', 'gates', 'lists', 'Gate list count', false),
  ('crafter_tokens', 'crafter', 'tokens', 'Token count', false),
  ('recipients_count', 'shipment', 'recipients', 'Recipients count', false),
  ('registration', 'admin', null, '0 for pending, 1 for existing tenant', true),
  ('slug', 'admin', null, '1 if has slug, 0 if not', true)
ON CONFLICT (meter_key) DO NOTHING;

INSERT INTO public.meter_dependencies (meter_key, requires_meter) VALUES
  ('raffle_slots', 'raffle_hosting')
ON CONFLICT (meter_key, requires_meter) DO NOTHING;

INSERT INTO public.duration_rules (duration_days, price_multiplier, label) VALUES
  (0, 1.0, 'Instant / one-time'),
  (30, 1.0, '1 month'),
  (90, 2.7, '3 months (~10% off)'),
  (365, 9.0, '1 year (~25% off)')
ON CONFLICT (duration_days) DO UPDATE SET
  price_multiplier = EXCLUDED.price_multiplier,
  label = EXCLUDED.label;

INSERT INTO public.tier_rules (product_key, meter_key, min_quantity, max_quantity, unit_price, tier_price, label) VALUES
  ('watchtower', 'mints_current', 1, 4, 5, NULL, 'Current holders'),
  ('watchtower', 'mints_current', 5, 9, 4, NULL, 'Current holders (tier 2)'),
  ('watchtower', 'mints_current', 10, NULL, 3.5, NULL, 'Current holders (tier 3)'),
  ('watchtower', 'mints_snapshot', 1, NULL, 5, NULL, 'Snapshot track'),
  ('watchtower', 'mints_transactions', 1, NULL, 20, NULL, 'Transactions track'),
  ('marketplace', 'mints_count', 1, 25, 0, 19, 'Starter (1–25 mints)'),
  ('marketplace', 'mints_count', 26, 100, 0, 29, 'Growth (26–100 mints)'),
  ('marketplace', 'mints_count', 101, 250, 0, 39, 'Pro (101–250 mints)'),
  ('raffles', 'raffle_hosting', 1, NULL, 0, NULL, 'Can host raffles'),
  ('raffles', 'raffle_slots', 1, 1, 5, NULL, 'Base (1 slot, 5 USDC per raffle)'),
  ('raffles', 'raffle_slots', 2, 3, 0, 15, 'Grow (3 slots)'),
  ('raffles', 'raffle_slots', 4, 10, 0, 29, 'Pro (10 slots)'),
  ('gates', 'gate_lists', 1, NULL, 5, NULL, 'Gate list'),
  ('crafter', 'crafter_tokens', 1, NULL, 5, NULL, 'Token'),
  ('admin', 'registration', 1, NULL, 10, NULL, 'dGuild registration'),
  ('admin', 'slug', 1, NULL, 19, NULL, 'Custom slug'),
  ('shipment', 'recipients_count', 1, NULL, 0, NULL, 'Recipient')
ON CONFLICT (product_key, meter_key, min_quantity) DO NOTHING;

INSERT INTO public.bundles (id, product_key, price_usdc, label, version, price_version) VALUES
  ('starterpack', 'starterpack', 99, 'Starter Pack (mints + holders + raffles + gates)', 1, 1)
ON CONFLICT (id) DO NOTHING;

UPDATE public.bundles
SET label = 'Starter Pack (marketplace + memberlist + raffles + craft + holders + snapshots)',
    price_usdc = 99,
    price_version = 2
WHERE id = 'starterpack';

DELETE FROM public.bundle_entitlements WHERE bundle_id = 'starterpack';

INSERT INTO public.bundle_entitlements (bundle_id, meter_key, quantity, duration_days) VALUES
  ('starterpack', 'mints_count', 25, 30),
  ('starterpack', 'gate_lists', 1, 0),
  ('starterpack', 'raffle_hosting', 1, 0),
  ('starterpack', 'raffle_slots', 1, 0),
  ('starterpack', 'crafter_tokens', 3, 0),
  ('starterpack', 'mints_current', 3, 30),
  ('starterpack', 'mints_snapshot', 3, 30)
ON CONFLICT (bundle_id, meter_key) DO UPDATE SET quantity = EXCLUDED.quantity, duration_days = EXCLUDED.duration_days;

INSERT INTO public.bundles (id, product_key, price_usdc, label, version, price_version) VALUES
  ('starterpack-continium', 'starterpack', 39, 'Starterpack Continium (marketplace + holders + snapshots)', 1, 1),
  ('starterpack-continium-grow', 'starterpack', 52, 'Starterpack Continium Grow (marketplace + raffle grow + holders + snapshots)', 1, 1),
  ('watchtower-pack-small', 'watchtower', 24, 'Watchtower pack small (3 current + 3 snapshot)', 1, 1),
  ('watchtower-pack-large', 'watchtower', 90, 'Watchtower pack large (10 current + 10 snapshot)', 1, 1)
ON CONFLICT (id) DO UPDATE SET product_key = EXCLUDED.product_key, price_usdc = EXCLUDED.price_usdc, label = EXCLUDED.label;

INSERT INTO public.bundle_entitlements (bundle_id, meter_key, quantity, duration_days) VALUES
  ('starterpack-continium', 'mints_count', 25, 30),
  ('starterpack-continium', 'mints_current', 3, 30),
  ('starterpack-continium', 'mints_snapshot', 3, 30),
  ('starterpack-continium-grow', 'mints_count', 25, 30),
  ('starterpack-continium-grow', 'raffle_hosting', 1, 0),
  ('starterpack-continium-grow', 'raffle_slots', 3, 0),
  ('starterpack-continium-grow', 'mints_current', 3, 30),
  ('starterpack-continium-grow', 'mints_snapshot', 3, 30),
  ('watchtower-pack-small', 'mints_current', 3, 30),
  ('watchtower-pack-small', 'mints_snapshot', 3, 30),
  ('watchtower-pack-large', 'mints_current', 10, 30),
  ('watchtower-pack-large', 'mints_snapshot', 10, 30)
ON CONFLICT (bundle_id, meter_key) DO UPDATE SET quantity = EXCLUDED.quantity, duration_days = EXCLUDED.duration_days;

-- ---------------------------------------------------------------------------
-- Cron jobs
-- ---------------------------------------------------------------------------

SELECT cron.schedule('module-lifecycle', '*/15 * * * *', $$SELECT public.invoke_edge_function('cron-lifecycle')$$);
SELECT cron.schedule('tracker-sync', '*/5 * * * *', $$SELECT public.invoke_edge_function('cron-tracker')$$);
SELECT cron.schedule('expire-stale-payments', '0 * * * *', $$SELECT public.invoke_edge_function('billing', '{"action":"expire-stale"}'::jsonb)$$);
SELECT cron.schedule(
  'expire-entitlements',
  '0 * * * *',
  $$SELECT public.invoke_edge_function('billing', '{"action":"expire-entitlements"}'::jsonb)$$
);
