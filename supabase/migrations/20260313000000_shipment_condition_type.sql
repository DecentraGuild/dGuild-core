-- Add SHIPMENT condition type for Shipment List JSON generation.
-- SHIPMENT: wallet held token during begin_date..end_date (only for mints with track_snapshot).

ALTER TABLE public.condition_set_conditions
  DROP CONSTRAINT IF EXISTS condition_set_conditions_type_check;

ALTER TABLE public.condition_set_conditions
  ADD CONSTRAINT condition_set_conditions_type_check
  CHECK (type IN ('HOLDING', 'TRAIT', 'DISCORD', 'WHITELIST', 'SHIPMENT'));
