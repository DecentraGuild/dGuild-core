-- Public shipment page lists compressed balances per mint from recorded shipments.
-- Same model as tenant_mint_catalog: broad SELECT; clients filter by tenant_id.
CREATE POLICY "shipment_records_public_read" ON public.shipment_records
  FOR SELECT USING (true);
