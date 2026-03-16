-- Individual vouchers: mint -> entitlements (meter_key, quantity, duration_days)
-- Parallel to bundle_vouchers for product_key-scoped vouchers

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

ALTER TABLE public.individual_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.individual_voucher_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.individual_voucher_redemption_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.individual_voucher_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "individual_vouchers_admin_only" ON public.individual_vouchers FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "individual_voucher_entitlements_admin_only" ON public.individual_voucher_entitlements FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "individual_voucher_redemption_totals_admin_read" ON public.individual_voucher_redemption_totals FOR SELECT
  USING (auth.role() = 'service_role');
CREATE POLICY "individual_voucher_redemptions_admin_read" ON public.individual_voucher_redemptions FOR SELECT
  USING (auth.role() = 'service_role');

-- Storage bucket: voucher-metadata
INSERT INTO storage.buckets (id, name, public)
VALUES ('voucher-metadata', 'voucher-metadata', true)
ON CONFLICT (id) DO NOTHING;
