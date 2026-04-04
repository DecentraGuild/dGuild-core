-- Per-recipient compressed leaf ids captured at ship time (for support / claims tooling).
CREATE TABLE IF NOT EXISTS public.shipment_compressed_leaves (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id) ON DELETE CASCADE,
  shipment_record_id INTEGER NOT NULL REFERENCES public.shipment_records(id) ON DELETE CASCADE,
  recipient_wallet TEXT NOT NULL,
  mint TEXT NOT NULL,
  leaf_hash_decimal TEXT NOT NULL,
  amount_raw NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, leaf_hash_decimal)
);

CREATE INDEX IF NOT EXISTS idx_shipment_compressed_leaves_shipment
  ON public.shipment_compressed_leaves(shipment_record_id);
CREATE INDEX IF NOT EXISTS idx_shipment_compressed_leaves_tenant
  ON public.shipment_compressed_leaves(tenant_id);

ALTER TABLE public.shipment_compressed_leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shipment_compressed_leaves_public_read" ON public.shipment_compressed_leaves
  FOR SELECT USING (true);

CREATE POLICY "shipment_compressed_leaves_tenant_admin_read" ON public.shipment_compressed_leaves
  FOR SELECT USING (public.is_tenant_admin(tenant_id));
