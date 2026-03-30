-- Cron-tracker load reduction: NFT item tiers, NFT getAssetsByGroup resume,
-- bulk within-limit mints RPC, holder_current_sync_meta.item_total, chunk default 4.

-- ---------------------------------------------------------------------------
-- 1. platform_watchtower_nft_item_tier (refresh cadence by total NFT item count)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_watchtower_nft_item_tier (
  id SERIAL PRIMARY KEY,
  sort_order SMALLINT NOT NULL UNIQUE,
  max_items INT,
  interval_minutes INT NOT NULL,
  CONSTRAINT platform_watchtower_nft_item_tier_max_items_check CHECK (max_items IS NULL OR max_items >= 0)
);

INSERT INTO public.platform_watchtower_nft_item_tier (sort_order, max_items, interval_minutes) VALUES
  (1, 100, 5),
  (2, 1000, 15),
  (3, 5000, 30),
  (4, NULL, 60)
ON CONFLICT (sort_order) DO NOTHING;

ALTER TABLE public.platform_watchtower_nft_item_tier ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_watchtower_nft_item_tier_no_direct_access"
  ON public.platform_watchtower_nft_item_tier
  FOR ALL
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.platform_watchtower_nft_item_tier FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_watchtower_nft_item_tier TO service_role;

-- ---------------------------------------------------------------------------
-- 2. nft_holder_group_progress (getAssetsByGroup page cursor)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.nft_holder_group_progress (
  mint         text PRIMARY KEY,
  next_page    integer NOT NULL CHECK (next_page >= 1),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nft_holder_group_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nft_holder_group_progress_no_direct_access"
  ON public.nft_holder_group_progress
  FOR ALL
  USING (false);

REVOKE ALL ON TABLE public.nft_holder_group_progress FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.nft_holder_group_progress TO service_role;

-- ---------------------------------------------------------------------------
-- 3. watchtower_within_limit_mints_bulk (tenant_id is TEXT in this schema)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.watchtower_within_limit_mints_bulk(p_tenant_ids text[])
RETURNS TABLE (
  tenant_id   text,
  mint        text,
  meter_scope text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_limits AS (
    SELECT tml.tenant_id,
           GREATEST(0, FLOOR(tml.quantity_total))::int AS lim
    FROM public.tenant_meter_limits tml
    WHERE tml.meter_key = 'mints_current'
      AND tml.tenant_id = ANY(p_tenant_ids)
  ),
  current_ranked AS (
    SELECT w.tenant_id,
           w.mint::text AS mint,
           ROW_NUMBER() OVER (
             PARTITION BY w.tenant_id
             ORDER BY w.enabled_at_holders ASC NULLS LAST
           ) AS rn,
           l.lim
    FROM public.watchtower_watches w
    INNER JOIN current_limits l ON l.tenant_id = w.tenant_id AND l.lim > 0
    WHERE w.track_holders = true
      AND w.enabled_at_holders IS NOT NULL
      AND w.tenant_id = ANY(p_tenant_ids)
  ),
  snapshot_limits AS (
    SELECT tml.tenant_id,
           GREATEST(0, FLOOR(tml.quantity_total))::int AS lim
    FROM public.tenant_meter_limits tml
    WHERE tml.meter_key = 'mints_snapshot'
      AND tml.tenant_id = ANY(p_tenant_ids)
  ),
  snapshot_ranked AS (
    SELECT w.tenant_id,
           w.mint::text AS mint,
           ROW_NUMBER() OVER (
             PARTITION BY w.tenant_id
             ORDER BY w.enabled_at_snapshot ASC NULLS LAST
           ) AS rn,
           l.lim
    FROM public.watchtower_watches w
    INNER JOIN snapshot_limits l ON l.tenant_id = w.tenant_id AND l.lim > 0
    WHERE w.track_snapshot = true
      AND w.enabled_at_snapshot IS NOT NULL
      AND w.tenant_id = ANY(p_tenant_ids)
  )
  SELECT tenant_id, mint, 'mints_current'::text AS meter_scope
  FROM current_ranked
  WHERE rn <= lim
  UNION ALL
  SELECT tenant_id, mint, 'mints_snapshot'::text AS meter_scope
  FROM snapshot_ranked
  WHERE rn <= lim;
$$;

REVOKE ALL ON FUNCTION public.watchtower_within_limit_mints_bulk(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.watchtower_within_limit_mints_bulk(text[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. holder_current_sync_meta — add item_total (sum of amount fields)
-- ---------------------------------------------------------------------------
-- Postgres rejects CREATE OR REPLACE when the OUT row type changes; drop first.

DROP FUNCTION IF EXISTS public.holder_current_sync_meta(text[]);

CREATE OR REPLACE FUNCTION public.holder_current_sync_meta(p_mints text[])
RETURNS TABLE(mint text, last_updated timestamptz, holder_count integer, item_total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.mint::text,
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
                   WHEN jsonb_typeof(h.holder_wallets) = 'array' THEN h.holder_wallets
                   ELSE '[]'::jsonb
                 END
               ) AS elem
             ) sub
           ),
           0::bigint
         ) AS item_total
  FROM public.holder_current h
  WHERE h.mint = ANY(p_mints);
$$;

REVOKE ALL ON FUNCTION public.holder_current_sync_meta(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.holder_current_sync_meta(text[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. cron_tracker_next_mints — default chunk 4
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cron_tracker_next_mints(
  p_after_mint TEXT,
  p_limit      INTEGER DEFAULT 4
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
