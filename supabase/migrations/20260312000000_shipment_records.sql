-- Shipment records: persisted only when a shipment is executed.
-- Lists stay in memory; only dropped shipments are stored.

CREATE TABLE IF NOT EXISTS public.shipment_records (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenant_config(id) ON DELETE CASCADE,
  mint TEXT NOT NULL,
  recipient_count INTEGER NOT NULL,
  total_amount NUMERIC NOT NULL,
  tx_signature TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipment_records_tenant ON public.shipment_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shipment_records_created_at ON public.shipment_records(created_at DESC);

ALTER TABLE public.shipment_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shipment_records_tenant_admin_read" ON public.shipment_records
  FOR SELECT USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "shipment_records_tenant_admin_insert" ON public.shipment_records
  FOR INSERT WITH CHECK (public.is_tenant_admin(tenant_id));
