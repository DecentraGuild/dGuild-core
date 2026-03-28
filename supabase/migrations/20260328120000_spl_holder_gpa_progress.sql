-- Resume cursor for SPL holder sync (getProgramAccountsV2 pagination) across cron-tracker ticks.
-- Large mints cannot complete in one Edge invocation without exceeding WORKER_LIMIT (HTTP 546).

CREATE TABLE IF NOT EXISTS public.spl_holder_gpa_progress (
  mint     text PRIMARY KEY,
  pagination_key text NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.spl_holder_gpa_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spl_holder_gpa_progress_no_direct_access"
  ON public.spl_holder_gpa_progress
  FOR ALL
  USING (false);

REVOKE ALL ON TABLE public.spl_holder_gpa_progress FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.spl_holder_gpa_progress TO service_role;
