-- Marketplace flat tier pricing: 1-25/19, 26-100/29, 101-250/39 USDC.
-- tier_price = flat price for the tier (when set, replaces quantity × unit_price).
-- Test: 0.000019, 0.000029, 0.000039. Production: 19, 29, 39.

ALTER TABLE public.tier_rules ADD COLUMN IF NOT EXISTS tier_price NUMERIC(12,6);

COMMENT ON COLUMN public.tier_rules.tier_price IS 'When set, flat price for the tier (not per-unit). Used for marketplace mints_count.';

DELETE FROM public.tier_rules WHERE product_key = 'marketplace' AND meter_key = 'mints_count';

INSERT INTO public.tier_rules (product_key, meter_key, min_quantity, max_quantity, unit_price, tier_price, label) VALUES
  ('marketplace', 'mints_count', 1, 25, 0, 0.000019, 'Starter (1–25 mints)'),
  ('marketplace', 'mints_count', 26, 100, 0, 0.000029, 'Growth (26–100 mints)'),
  ('marketplace', 'mints_count', 101, 250, 0, 0.000039, 'Pro (101–250 mints)');
