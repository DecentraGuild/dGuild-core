-- Pricing Engine v2: new schema, seed data, triggers.
-- DB wiped; no legacy support. billing_payments simplified for v2.

-- ---------------------------------------------------------------------------
-- 1. Core registry tables
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
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tier_rules_lookup ON public.tier_rules(product_key, meter_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tier_rules_unique ON public.tier_rules(product_key, meter_key, min_quantity);

-- ---------------------------------------------------------------------------
-- 2. Bundles
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 3. Billing quotes (must exist before billing_payments.quote_id)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 4. Alter billing_payments for v2 (drop legacy columns, add new)
-- ---------------------------------------------------------------------------

ALTER TABLE public.billing_payments DROP COLUMN IF EXISTS module_id;
ALTER TABLE public.billing_payments DROP COLUMN IF EXISTS scope_key;
ALTER TABLE public.billing_payments DROP COLUMN IF EXISTS payment_type;
ALTER TABLE public.billing_payments DROP COLUMN IF EXISTS billing_period;
ALTER TABLE public.billing_payments DROP COLUMN IF EXISTS period_start;
ALTER TABLE public.billing_payments DROP COLUMN IF EXISTS period_end;
ALTER TABLE public.billing_payments DROP COLUMN IF EXISTS conditions_snapshot;
ALTER TABLE public.billing_payments DROP COLUMN IF EXISTS price_snapshot;

ALTER TABLE public.billing_payments ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'usdc'
  CHECK (payment_method IN ('usdc', 'voucher'));
ALTER TABLE public.billing_payments ADD COLUMN IF NOT EXISTS voucher_mint TEXT;
ALTER TABLE public.billing_payments ADD COLUMN IF NOT EXISTS bundle_id TEXT REFERENCES public.bundles(id);
ALTER TABLE public.billing_payments ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.billing_quotes(id);

DROP INDEX IF EXISTS public.idx_billing_payments_tx_signature;
CREATE UNIQUE INDEX idx_billing_payments_tx_signature ON public.billing_payments(tx_signature)
  WHERE tx_signature IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Granted entitlements + aggregate
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

-- ---------------------------------------------------------------------------
-- 6. Voucher redemption tables
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 7. Trigger: incremental ledger on granted_entitlements
-- ---------------------------------------------------------------------------

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
-- 8. RLS policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.granted_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_meter_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_voucher_redemption_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_redemptions ENABLE ROW LEVEL SECURITY;

-- bundles, bundle_entitlements, bundle_vouchers: platform/ops only (no direct access)
CREATE POLICY "bundles_admin_only" ON public.bundles FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "bundle_entitlements_admin_only" ON public.bundle_entitlements FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "bundle_vouchers_admin_only" ON public.bundle_vouchers FOR ALL USING (false) WITH CHECK (false);

-- granted_entitlements, tenant_meter_limits: tenant admin read
CREATE POLICY "granted_entitlements_admin_read" ON public.granted_entitlements FOR SELECT
  USING (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant_meter_limits_admin_read" ON public.tenant_meter_limits FOR SELECT
  USING (public.is_tenant_admin(tenant_id));

-- billing_quotes: tenant-scoped read (own tenant)
CREATE POLICY "billing_quotes_admin_read" ON public.billing_quotes FOR SELECT
  USING (public.is_tenant_admin(tenant_id));

-- voucher tables: tenant admin read
CREATE POLICY "tenant_voucher_redemption_totals_admin_read" ON public.tenant_voucher_redemption_totals FOR SELECT
  USING (public.is_tenant_admin(tenant_id));
CREATE POLICY "voucher_redemptions_admin_read" ON public.voucher_redemptions FOR SELECT
  USING (public.is_tenant_admin(tenant_id));

-- ---------------------------------------------------------------------------
-- 9. Seed: meters
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

-- raffle_slots requires raffle_hosting
INSERT INTO public.meter_dependencies (meter_key, requires_meter) VALUES
  ('raffle_slots', 'raffle_hosting')
ON CONFLICT (meter_key, requires_meter) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 10. Seed: duration_rules
-- ---------------------------------------------------------------------------

INSERT INTO public.duration_rules (duration_days, price_multiplier, label) VALUES
  (0, 1.0, 'Instant / one-time'),
  (30, 1.0, '1 month'),
  (90, 2.7, '3 months (~10% off)'),
  (365, 9.0, '1 year (~25% off)')
ON CONFLICT (duration_days) DO UPDATE SET
  price_multiplier = EXCLUDED.price_multiplier,
  label = EXCLUDED.label;

-- ---------------------------------------------------------------------------
-- 11. Seed: tier_rules
-- ---------------------------------------------------------------------------

INSERT INTO public.tier_rules (product_key, meter_key, min_quantity, max_quantity, unit_price, label) VALUES
  -- watchtower
  ('watchtower', 'mints_current', 1, 4, 5, 'Current holders'),
  ('watchtower', 'mints_current', 5, 9, 4, 'Current holders (tier 2)'),
  ('watchtower', 'mints_current', 10, NULL, 3.5, 'Current holders (tier 3)'),
  ('watchtower', 'mints_snapshot', 1, NULL, 5, 'Snapshot track'),
  ('watchtower', 'mints_transactions', 1, NULL, 20, 'Transactions track'),
  -- marketplace
  ('marketplace', 'mints_count', 25, 99, 0.76, 'Starter band'),
  ('marketplace', 'mints_count', 100, 299, 0.29, 'Growth band'),
  ('marketplace', 'mints_count', 300, NULL, 0.13, 'Pro band'),
  -- raffles
  ('raffles', 'raffle_hosting', 1, NULL, 0, 'Can host raffles'),
  ('raffles', 'raffle_slots', 1, NULL, 5, 'Raffle slot'),
  -- gates, crafter, admin, shipment
  ('gates', 'gate_lists', 1, NULL, 5, 'Gate list'),
  ('crafter', 'crafter_tokens', 1, NULL, 5, 'Token'),
  ('admin', 'registration', 1, NULL, 10, 'dGuild registration'),
  ('admin', 'slug', 1, NULL, 19, 'Custom slug'),
  ('shipment', 'recipients_count', 1, NULL, 0, 'Recipient')
ON CONFLICT (product_key, meter_key, min_quantity) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 12. Seed: bundles + bundle_entitlements
-- ---------------------------------------------------------------------------

INSERT INTO public.bundles (id, product_key, price_usdc, label, version, price_version) VALUES
  ('starterpack', 'starterpack', 99, 'Starter Pack (mints + holders + raffles + gates)', 1, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.bundle_entitlements (bundle_id, meter_key, quantity, duration_days) VALUES
  ('starterpack', 'mints_count', 25, 30),
  ('starterpack', 'mints_current', 3, 30),
  ('starterpack', 'raffle_hosting', 1, 0),
  ('starterpack', 'raffle_slots', 1, 0),
  ('starterpack', 'gate_lists', 1, 0)
ON CONFLICT (bundle_id, meter_key) DO NOTHING;
