-- Marketplace mint tiers: BASE free (1–10), GROW, PRO, overage per mint above 250.
-- Monetize storefront: 10 USDC/mo when enabled (meter value 1).
-- custom_currencies remains per-unit (5 USDC/mo per custom currency) — see 20260322100001.

DELETE FROM public.tier_rules
WHERE product_key = 'marketplace' AND meter_key = 'mints_count';

INSERT INTO public.tier_rules (product_key, meter_key, min_quantity, max_quantity, unit_price, tier_price, label) VALUES
  ('marketplace', 'mints_count', 1, 10, 0, NULL, 'BASE (1–10 mints)'),
  ('marketplace', 'mints_count', 11, 100, 0, 19, 'GROW (11–100 mints)'),
  ('marketplace', 'mints_count', 101, 250, 0, 29, 'PRO (101–250 mints)'),
  ('marketplace', 'mints_count', 251, NULL, 0.10, NULL, 'Overage (per mint over 250)');

UPDATE public.tier_rules
SET unit_price = 10, label = 'Monetize storefront'
WHERE product_key = 'marketplace' AND meter_key = 'monetize_storefront' AND min_quantity = 1;
