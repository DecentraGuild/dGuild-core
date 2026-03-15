-- Rename holders_current to mints_current (meter/scope key).
-- Rename track_discord to track_holders, enabled_at_discord to enabled_at_holders.
-- The current-holders track is generic: short refresh rate, usable by conditions, shipment, Discord, etc.

-- watchtower_watches: remove Discord-specific column names
ALTER TABLE public.watchtower_watches RENAME COLUMN track_discord TO track_holders;
ALTER TABLE public.watchtower_watches RENAME COLUMN enabled_at_discord TO enabled_at_holders;

DROP INDEX IF EXISTS public.idx_watchtower_watches_discord;
CREATE INDEX IF NOT EXISTS idx_watchtower_watches_holders ON public.watchtower_watches(tenant_id) WHERE track_holders = TRUE;

-- billing_subscriptions: scope_key and conditions_snapshot key
UPDATE public.billing_subscriptions
SET
  scope_key = 'mints_current',
  conditions_snapshot = jsonb_build_object(
    'mints_current',
    COALESCE((conditions_snapshot->>'holders_current')::numeric, (conditions_snapshot->>'mintsDiscord')::numeric, 0)
  )
WHERE module_id = 'watchtower'
  AND scope_key = 'holders_current';
