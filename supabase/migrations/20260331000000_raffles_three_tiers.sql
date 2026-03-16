-- Raffles three tiers. Like marketplace: no capability gate. Activate → Base (1 slot, 5 USDC per raffle).
-- Base: 1 slot, 5 USDC per raffle. Grow: 3 slots, 15/mo. Pro: 10 slots, 29/mo.

DELETE FROM public.tier_rules WHERE product_key = 'raffles' AND meter_key = 'raffle_slots';

INSERT INTO public.tier_rules (product_key, meter_key, min_quantity, max_quantity, unit_price, tier_price, label) VALUES
  ('raffles', 'raffle_slots', 1, 1, 5, NULL, 'Base (1 slot, 5 USDC per raffle)'),
  ('raffles', 'raffle_slots', 2, 3, 0, 15, 'Grow (3 slots)'),
  ('raffles', 'raffle_slots', 4, 10, 0, 29, 'Pro (10 slots)');
