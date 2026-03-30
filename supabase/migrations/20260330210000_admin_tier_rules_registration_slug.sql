-- Catalogue: Guild registration one-time 19 USDC; custom slug 49 USDC/yr (unit × yearly mult 9).
UPDATE public.tier_rules
SET unit_price = 19
WHERE product_key = 'admin'
  AND meter_key = 'registration'
  AND min_quantity = 1;

UPDATE public.tier_rules
SET unit_price = (49::numeric / 9)
WHERE product_key = 'admin'
  AND meter_key = 'slug'
  AND min_quantity = 1;
