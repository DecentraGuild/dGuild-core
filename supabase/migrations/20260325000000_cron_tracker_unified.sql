-- Unified cron-tracker: single rolodex cursor + two-interval config + global-only snapshots.
--
-- Changes:
--   1. cron_tracker_state — singleton cursor row (last processed mint for the rolodex pass).
--   2. Two new interval_timers rows:
--        watchtower_cycle_minutes         — tick cadence / chunk period (default 5 min).
--        watchtower_snapshot_every_n_cycles — snapshot bucket = cycle × N (default 12 → 60 min).
--   3. cron_tracker_next_mints(after_mint, limit) RPC — deduped mint list for the cursor advance.
--   4. pg_cron: replace two separate jobs (tracker-holders, tracker-snapshots) with one unified job.

-- ---------------------------------------------------------------------------
-- 1. cron_tracker_state (singleton)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cron_tracker_state (
  id      INTEGER PRIMARY KEY DEFAULT 1,
  last_mint TEXT,                                        -- NULL = start from top of list
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cron_tracker_state_singleton CHECK (id = 1)
);

INSERT INTO public.cron_tracker_state (id, last_mint)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.cron_tracker_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cron_tracker_state_no_direct_access"
  ON public.cron_tracker_state
  FOR ALL
  USING (false);

REVOKE ALL ON TABLE public.cron_tracker_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.cron_tracker_state TO service_role;

-- ---------------------------------------------------------------------------
-- 2. New interval_timers config rows
-- ---------------------------------------------------------------------------

INSERT INTO public.interval_timers (timer_key, interval_minutes) VALUES
  ('watchtower_cycle_minutes',           5),   -- cron tick / chunk period (minutes)
  ('watchtower_snapshot_every_n_cycles', 12)   -- snapshot bucket = cycle_minutes × N  (default 60 min)
ON CONFLICT (timer_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. cron_tracker_next_mints — deduped mint cursor RPC
-- ---------------------------------------------------------------------------
-- Returns the next `p_limit` distinct mints from watchtower_watches that have at
-- least one tenant with track_holders or track_snapshot enabled, ordered by mint
-- ASC after p_after_mint (NULL = start from the very beginning).
-- `kind` is resolved from tenant_mint_catalog; MAX picks SPL if any tenant says SPL.

CREATE OR REPLACE FUNCTION public.cron_tracker_next_mints(
  p_after_mint TEXT,
  p_limit      INTEGER DEFAULT 8
)
RETURNS TABLE (
  mint           TEXT,
  needs_current  BOOLEAN,
  needs_snapshot BOOLEAN,
  kind           TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ww.mint::text                          AS mint,
    bool_or(ww.track_holders)             AS needs_current,
    bool_or(ww.track_snapshot)            AS needs_snapshot,
    COALESCE(MAX(tmc.kind), 'NFT')::text  AS kind
  FROM public.watchtower_watches ww
  LEFT JOIN public.tenant_mint_catalog tmc
         ON tmc.mint = ww.mint
  WHERE (ww.track_holders = true OR ww.track_snapshot = true)
    AND (p_after_mint IS NULL OR ww.mint > p_after_mint)
  GROUP BY ww.mint
  ORDER BY ww.mint ASC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.cron_tracker_next_mints(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cron_tracker_next_mints(TEXT, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Replace two pg_cron jobs with one unified job
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tracker-holders') THEN
    PERFORM cron.unschedule('tracker-holders');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tracker-snapshots') THEN
    PERFORM cron.unschedule('tracker-snapshots');
  END IF;
END
$$;

SELECT cron.schedule(
  'tracker-unified',
  '*/5 * * * *',
  $$SELECT public.invoke_edge_function('cron-tracker', '{"mode":"unified"}'::jsonb)$$
);
