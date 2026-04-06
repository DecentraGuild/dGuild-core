-- Resumable collection member indexing + mint-catalog-index Edge worker cron.

CREATE TABLE IF NOT EXISTS public.collection_members_index_progress (
  collection_mint TEXT PRIMARY KEY,
  next_page       INTEGER NOT NULL,
  partial_trait_index JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error      TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_members_index_progress_updated
  ON public.collection_members_index_progress (updated_at);

ALTER TABLE public.collection_members_index_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collection_members_index_progress_no_direct_access"
  ON public.collection_members_index_progress
  FOR ALL
  USING (false);

REVOKE ALL ON TABLE public.collection_members_index_progress FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.collection_members_index_progress TO service_role;

INSERT INTO public.interval_timers (timer_key, interval_minutes) VALUES
  ('mint_index_max_collections_per_tick', 4),
  ('mint_index_max_pages_per_tick', 2)
ON CONFLICT (timer_key) DO NOTHING;

DO $$
BEGIN
  PERFORM cron.unschedule('mint-catalog-index');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;

SELECT cron.schedule(
  'mint-catalog-index',
  '*/3 * * * *',
  $$SELECT public.invoke_edge_function('mint-catalog-index', '{"mode":"tick"}'::jsonb)$$
);
