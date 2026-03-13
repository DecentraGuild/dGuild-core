-- Add SNAPSHOTS condition type.
-- SNAPSHOTS: wallet held X amount for the past Y days (uses tracker_holder_snapshots).

ALTER TABLE public.condition_set_conditions
  DROP CONSTRAINT IF EXISTS condition_set_conditions_type_check;

ALTER TABLE public.condition_set_conditions
  ADD CONSTRAINT condition_set_conditions_type_check
  CHECK (type IN ('HOLDING', 'TRAIT', 'DISCORD', 'WHITELIST', 'SHIPMENT', 'SNAPSHOTS'));
