-- Add rule_type to condition_sets (binary vs weighted).
-- Add TIME_WEIGHTED condition type for time-weighted shipment lists.

ALTER TABLE public.condition_sets
  ADD COLUMN IF NOT EXISTS rule_type TEXT NOT NULL DEFAULT 'binary'
  CHECK (rule_type IN ('binary', 'weighted'));

ALTER TABLE public.condition_set_conditions
  DROP CONSTRAINT IF EXISTS condition_set_conditions_type_check;

ALTER TABLE public.condition_set_conditions
  ADD CONSTRAINT condition_set_conditions_type_check
  CHECK (type IN ('HOLDING', 'TRAIT', 'DISCORD', 'WHITELIST', 'SHIPMENT', 'SNAPSHOTS', 'TIME_WEIGHTED'));
