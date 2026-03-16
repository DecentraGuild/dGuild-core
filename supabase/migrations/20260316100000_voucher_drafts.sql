-- Voucher drafts: mints created in step 1, pending metadata + link
-- OPS can create mint, then later add metadata and link to bundle/individual

CREATE TABLE IF NOT EXISTS public.voucher_drafts (
  mint TEXT PRIMARY KEY,
  actor_wallet TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.voucher_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voucher_drafts_admin_only" ON public.voucher_drafts FOR ALL USING (false) WITH CHECK (false);
