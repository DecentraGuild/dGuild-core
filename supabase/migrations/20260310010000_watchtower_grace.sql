-- Add per-track enable timestamps for watchtower grace / paid-limit ordering.
-- First N mints by enabled_at per scope get sync and data access; rest are over limit until paid.

ALTER TABLE public.watchtower_watches
  ADD COLUMN IF NOT EXISTS enabled_at_discord TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enabled_at_snapshot TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enabled_at_transactions TIMESTAMPTZ;

-- Backfill: existing rows with track enabled get enabled_at = created_at
UPDATE public.watchtower_watches
SET
  enabled_at_discord = COALESCE(enabled_at_discord, CASE WHEN track_discord THEN COALESCE(created_at, NOW()) END),
  enabled_at_snapshot = COALESCE(enabled_at_snapshot, CASE WHEN track_snapshot THEN COALESCE(created_at, NOW()) END),
  enabled_at_transactions = COALESCE(enabled_at_transactions, CASE WHEN track_transactions THEN COALESCE(created_at, NOW()) END)
WHERE (track_discord AND enabled_at_discord IS NULL)
   OR (track_snapshot AND enabled_at_snapshot IS NULL)
   OR (track_transactions AND enabled_at_transactions IS NULL);
