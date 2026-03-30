-- Precomputed billing eligibility on watchtower_watches + due-first cron candidates.
-- Removes per-tick limit recomputation from cron; triggers keep flags in sync.

-- ---------------------------------------------------------------------------
-- 1. Columns on watchtower_watches
-- ---------------------------------------------------------------------------

ALTER TABLE public.watchtower_watches
  ADD COLUMN IF NOT EXISTS billing_eligible_current  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_eligible_snapshot boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.watchtower_watches.billing_eligible_current IS
  'True when this row is within paid mints_current window (ordered by enabled_at_holders).';
COMMENT ON COLUMN public.watchtower_watches.billing_eligible_snapshot IS
  'True when this row is within paid mints_snapshot window (ordered by enabled_at_snapshot).';

-- ---------------------------------------------------------------------------
-- 2. Recompute eligibility for one tenant (same rules as legacy getWithinLimitMints)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.watchtower_recompute_eligibility_for_tenant(p_tenant_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim_cur  int;
  lim_snap int;
BEGIN
  UPDATE public.watchtower_watches
  SET billing_eligible_current = false,
      billing_eligible_snapshot = false,
      updated_at = NOW()
  WHERE tenant_id = p_tenant_id;

  SELECT COALESCE(GREATEST(0, FLOOR(quantity_total))::int, 0) INTO lim_cur
  FROM public.tenant_meter_limits
  WHERE tenant_id = p_tenant_id AND meter_key = 'mints_current';

  IF lim_cur > 0 THEN
    UPDATE public.watchtower_watches w
    SET billing_eligible_current = true,
        updated_at = NOW()
    FROM (
      SELECT mint,
             ROW_NUMBER() OVER (
               ORDER BY enabled_at_holders ASC NULLS LAST
             ) AS rn
      FROM public.watchtower_watches
      WHERE tenant_id = p_tenant_id
        AND track_holders = true
        AND enabled_at_holders IS NOT NULL
    ) ranked
    WHERE w.tenant_id = p_tenant_id
      AND w.mint = ranked.mint
      AND ranked.rn <= lim_cur;
  END IF;

  SELECT COALESCE(GREATEST(0, FLOOR(quantity_total))::int, 0) INTO lim_snap
  FROM public.tenant_meter_limits
  WHERE tenant_id = p_tenant_id AND meter_key = 'mints_snapshot';

  IF lim_snap > 0 THEN
    UPDATE public.watchtower_watches w
    SET billing_eligible_snapshot = true,
        updated_at = NOW()
    FROM (
      SELECT mint,
             ROW_NUMBER() OVER (
               ORDER BY enabled_at_snapshot ASC NULLS LAST
             ) AS rn
      FROM public.watchtower_watches
      WHERE tenant_id = p_tenant_id
        AND track_snapshot = true
        AND enabled_at_snapshot IS NOT NULL
    ) ranked
    WHERE w.tenant_id = p_tenant_id
      AND w.mint = ranked.mint
      AND ranked.rn <= lim_snap;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.watchtower_recompute_eligibility_for_tenant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.watchtower_recompute_eligibility_for_tenant(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Triggers: tenant_meter_limits + watchtower_watches (eligible columns excluded)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.watchtower_trg_meter_limits_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.watchtower_recompute_eligibility_for_tenant(OLD.tenant_id);
  ELSE
    PERFORM public.watchtower_recompute_eligibility_for_tenant(NEW.tenant_id);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    PERFORM public.watchtower_recompute_eligibility_for_tenant(OLD.tenant_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_meter_limits_watchtower_eligibility ON public.tenant_meter_limits;
CREATE TRIGGER trg_meter_limits_watchtower_eligibility
  AFTER INSERT OR UPDATE OR DELETE ON public.tenant_meter_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.watchtower_trg_meter_limits_eligibility();

CREATE OR REPLACE FUNCTION public.watchtower_trg_watches_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.watchtower_recompute_eligibility_for_tenant(OLD.tenant_id);
  ELSE
    PERFORM public.watchtower_recompute_eligibility_for_tenant(NEW.tenant_id);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    PERFORM public.watchtower_recompute_eligibility_for_tenant(OLD.tenant_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_watches_watchtower_eligibility ON public.watchtower_watches;
CREATE TRIGGER trg_watches_watchtower_eligibility
  AFTER INSERT OR UPDATE OF track_holders, track_snapshot, enabled_at_holders, enabled_at_snapshot
    OR DELETE ON public.watchtower_watches
  FOR EACH ROW
  EXECUTE FUNCTION public.watchtower_trg_watches_eligibility();

-- ---------------------------------------------------------------------------
-- 4. Backfill eligibility for all tenants with watches
-- ---------------------------------------------------------------------------

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT tenant_id FROM public.watchtower_watches
  LOOP
    PERFORM public.watchtower_recompute_eligibility_for_tenant(r.tenant_id);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. Platform timer: max mints to fully sync per unified tick
-- ---------------------------------------------------------------------------

INSERT INTO public.interval_timers (timer_key, interval_minutes) VALUES
  ('watchtower_max_mints_per_tick', 10)
ON CONFLICT (timer_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Single RPC: all cron candidates + holder meta + progress + snapshot flag
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.watchtower_cron_mint_candidates(p_snapshot_at timestamptz)
RETURNS TABLE (
  mint                       text,
  kind                       text,
  last_updated               timestamptz,
  holder_count               integer,
  item_total                 bigint,
  has_snapshot_for_bucket    boolean,
  spl_pagination_key         text,
  nft_next_page              integer,
  any_current_eligible       boolean,
  any_snapshot_eligible      boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH agg AS (
    SELECT
      ww.mint::text AS m,
      COALESCE(MAX(tmc.kind), 'NFT')::text AS k,
      bool_or(ww.track_holders AND ww.billing_eligible_current) AS cur_e,
      bool_or(ww.track_snapshot AND ww.billing_eligible_snapshot) AS snap_e
    FROM public.watchtower_watches ww
    LEFT JOIN public.tenant_mint_catalog tmc ON tmc.mint = ww.mint
    WHERE (ww.track_holders AND ww.billing_eligible_current)
       OR (ww.track_snapshot AND ww.billing_eligible_snapshot)
    GROUP BY ww.mint
  )
  SELECT
    agg.m AS mint,
    agg.k AS kind,
    h.last_updated,
    CASE
      WHEN h.holder_wallets IS NULL THEN 0
      WHEN jsonb_typeof(h.holder_wallets) = 'array'
      THEN (jsonb_array_length(h.holder_wallets))::integer
      ELSE 0
    END AS holder_count,
    COALESCE(
      (
        SELECT SUM(sub.n)::bigint
        FROM (
          SELECT CASE
            WHEN jsonb_typeof(elem) = 'object' AND (elem ? 'amount') THEN
              CASE
                WHEN jsonb_typeof(elem->'amount') = 'number'
                  THEN FLOOR((elem->'amount')::text::numeric)::bigint
                WHEN jsonb_typeof(elem->'amount') = 'string'
                  AND (elem->>'amount') ~ '^[0-9]+$'
                  THEN (elem->>'amount')::bigint
                ELSE 0::bigint
              END
            ELSE 0::bigint
          END AS n
          FROM jsonb_array_elements(
            CASE
              WHEN h.holder_wallets IS NOT NULL AND jsonb_typeof(h.holder_wallets) = 'array'
              THEN h.holder_wallets
              ELSE '[]'::jsonb
            END
          ) AS elem
        ) sub
      ),
      0::bigint
    ) AS item_total,
    EXISTS (
      SELECT 1
      FROM public.holder_snapshots hs
      WHERE hs.mint = agg.m AND hs.snapshot_at = p_snapshot_at
    ) AS has_snapshot_for_bucket,
    g.pagination_key AS spl_pagination_key,
    n.next_page AS nft_next_page,
    agg.cur_e AS any_current_eligible,
    agg.snap_e AS any_snapshot_eligible
  FROM agg
  LEFT JOIN public.holder_current h ON h.mint = agg.m
  LEFT JOIN public.spl_holder_gpa_progress g ON g.mint = agg.m
  LEFT JOIN public.nft_holder_group_progress n ON n.mint = agg.m;
$$;

REVOKE ALL ON FUNCTION public.watchtower_cron_mint_candidates(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.watchtower_cron_mint_candidates(timestamptz) TO service_role;
