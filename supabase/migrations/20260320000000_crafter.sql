-- Crafter module: SPL token creation with single-transaction flow.
-- crafter_tokens: confirmed tokens; crafter_pending: expires if not confirmed within 15 min.

CREATE TABLE IF NOT EXISTS public.crafter_tokens (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id),
  mint TEXT NOT NULL,
  billing_payment_id UUID REFERENCES public.billing_payments(id),
  name TEXT,
  symbol TEXT,
  decimals INTEGER,
  description TEXT,
  image_url TEXT,
  metadata_uri TEXT,
  storage_backend TEXT NOT NULL CHECK (storage_backend IN ('api', 'selfhost')),
  authority TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, mint)
);

CREATE INDEX IF NOT EXISTS idx_crafter_tokens_tenant ON public.crafter_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crafter_tokens_authority ON public.crafter_tokens(authority);

CREATE TABLE IF NOT EXISTS public.crafter_pending (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id),
  mint TEXT NOT NULL,
  memo TEXT NOT NULL,
  metadata_json JSONB NOT NULL,
  authority TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crafter_pending_mint_memo ON public.crafter_pending(mint, memo);
CREATE INDEX IF NOT EXISTS idx_crafter_pending_expires ON public.crafter_pending(expires_at);

ALTER TABLE public.crafter_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crafter_pending ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crafter_tokens_admin_read" ON public.crafter_tokens FOR SELECT
  USING (public.is_tenant_admin(tenant_id));

-- crafter_pending: no policy for anon/authenticated; Edge Function uses service_role (bypasses RLS)
