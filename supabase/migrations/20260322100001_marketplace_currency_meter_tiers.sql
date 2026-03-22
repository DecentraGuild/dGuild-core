-- Marketplace quote resolution iterates every meter returned by the adapter. Only mints_count had
-- tier_rules in the initial seed, so saving currencies (base + custom) produced a positive billing gap
-- with no tiers and resolveQuote threw — the admin pricing widget then showed billing unavailable.

INSERT INTO public.tier_rules (product_key, meter_key, min_quantity, max_quantity, unit_price, tier_price, label) VALUES
  ('marketplace', 'base_currencies_count', 1, NULL, 0, NULL, 'Base currencies'),
  ('marketplace', 'custom_currencies', 1, NULL, 5, NULL, 'Custom currency'),
  ('marketplace', 'monetize_storefront', 1, NULL, 0, NULL, 'Monetize storefront')
ON CONFLICT (product_key, meter_key, min_quantity) DO NOTHING;
