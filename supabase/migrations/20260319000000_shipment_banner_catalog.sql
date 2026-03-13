-- Shipment banner: per-mint display image for Shipments page.
-- Public read so members can query display data directly (scales better than edge function).

ALTER TABLE public.tenant_mint_catalog
  ADD COLUMN IF NOT EXISTS shipment_banner_image TEXT;

CREATE POLICY "tenant_mint_catalog_public_read" ON public.tenant_mint_catalog
  FOR SELECT USING (true);
