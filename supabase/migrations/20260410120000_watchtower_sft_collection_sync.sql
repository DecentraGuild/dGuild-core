-- SFT collection holder sync: per-child-mint SPL holders aggregated on collection parent mint.

-- ---------------------------------------------------------------------------
-- 1. Catalog: how to sync NFT collections for Watchtower
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenant_mint_catalog
  ADD COLUMN IF NOT EXISTS nft_collection_sync_mode text
    CHECK (nft_collection_sync_mode IS NULL OR nft_collection_sync_mode IN ('das_group', 'sft_per_mint'));

COMMENT ON COLUMN public.tenant_mint_catalog.nft_collection_sync_mode IS
  'NFT collections only: das_group = getAssetsByGroup ownership (1/1 NFTs); sft_per_mint = SPL holders per FungibleAsset child mint. NULL means das_group.';

CREATE INDEX IF NOT EXISTS idx_tenant_mint_catalog_nft_sync_mode
  ON public.tenant_mint_catalog (tenant_id, nft_collection_sync_mode)
  WHERE nft_collection_sync_mode IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Resume state for multi-tick SFT collection scans (parent mint key)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sft_collection_holder_sync_progress (
  collection_mint text PRIMARY KEY,
  child_mints       jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_child_index integer NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sft_collection_holder_sync_progress_child_mints_check
    CHECK (jsonb_typeof(child_mints) = 'array'),
  CONSTRAINT sft_collection_holder_sync_progress_index_check
    CHECK (current_child_index >= 0)
);

COMMENT ON TABLE public.sft_collection_holder_sync_progress IS
  'Watchtower SFT collection sync: child mint list from getAssetsByGroup; current_child_index is 0-based. SPL GPA resume uses spl_holder_gpa_progress on the active child mint.';

CREATE INDEX IF NOT EXISTS idx_sft_collection_progress_updated ON public.sft_collection_holder_sync_progress(updated_at);

ALTER TABLE public.sft_collection_holder_sync_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sft_collection_holder_sync_progress_no_direct_access"
  ON public.sft_collection_holder_sync_progress
  FOR ALL
  USING (false);

REVOKE ALL ON TABLE public.sft_collection_holder_sync_progress FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.sft_collection_holder_sync_progress TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Tunables (optional; defaults applied in code if missing)
-- ---------------------------------------------------------------------------

INSERT INTO public.interval_timers (timer_key, interval_minutes) VALUES
  ('watchtower_sft_max_gpa_pages_per_tick', 8),
  ('watchtower_sft_max_children_per_tick', 1)
ON CONFLICT (timer_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Cron RPC: expose nft_collection_sync_mode for cron-tracker branching
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.watchtower_cron_mint_candidates(timestamptz);

CREATE OR REPLACE FUNCTION public.watchtower_cron_mint_candidates(p_snapshot_at timestamptz)
RETURNS TABLE (
  mint                       text,
  kind                       text,
  nft_collection_sync_mode   text,
  last_updated               timestamptz,
  holder_count               integer,
  item_total                 bigint,
  has_snapshot_for_bucket    boolean,
  spl_pagination_key         text,
  nft_next_page              integer,
  sft_holder_sync_resume     boolean,
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
      MAX(tmc.nft_collection_sync_mode) AS nft_mode,
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
    agg.nft_mode AS nft_collection_sync_mode,
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
    (sftp.collection_mint IS NOT NULL) AS sft_holder_sync_resume,
    agg.cur_e AS any_current_eligible,
    agg.snap_e AS any_snapshot_eligible
  FROM agg
  LEFT JOIN public.holder_current h ON h.mint = agg.m
  LEFT JOIN public.spl_holder_gpa_progress g ON g.mint = agg.m
  LEFT JOIN public.nft_holder_group_progress n ON n.mint = agg.m
  LEFT JOIN public.sft_collection_holder_sync_progress sftp ON sftp.collection_mint = agg.m;
$$;

REVOKE ALL ON FUNCTION public.watchtower_cron_mint_candidates(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.watchtower_cron_mint_candidates(timestamptz) TO service_role;
