-- Align snapshot + transactions watchtower meters with mints_current quantity bands (1–4, 5–9, 10+).
DELETE FROM public.tier_rules
WHERE product_key = 'watchtower' AND meter_key IN ('mints_snapshot', 'mints_transactions');

INSERT INTO public.tier_rules (product_key, meter_key, min_quantity, max_quantity, unit_price, tier_price, label) VALUES
  ('watchtower', 'mints_snapshot', 1, 4, 5, NULL, 'Snapshot track'),
  ('watchtower', 'mints_snapshot', 5, 9, 4, NULL, 'Snapshot track (tier 2)'),
  ('watchtower', 'mints_snapshot', 10, NULL, 3.5, NULL, 'Snapshot track (tier 3)'),
  ('watchtower', 'mints_transactions', 1, 4, 20, NULL, 'Transactions track'),
  ('watchtower', 'mints_transactions', 5, 9, 18, NULL, 'Transactions track (tier 2)'),
  ('watchtower', 'mints_transactions', 10, NULL, 15, NULL, 'Transactions track (tier 3)')
ON CONFLICT (product_key, meter_key, min_quantity) DO UPDATE SET
  max_quantity = EXCLUDED.max_quantity,
  unit_price = EXCLUDED.unit_price,
  tier_price = EXCLUDED.tier_price,
  label = EXCLUDED.label;
