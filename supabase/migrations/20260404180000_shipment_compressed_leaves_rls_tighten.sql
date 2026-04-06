-- Admin-only read for per-recipient leaf rows (matches useShipmentHistory in AdminPlanShipmentTab).
-- Removes world-readable SELECT that exposed recipient wallets and amounts across tenants.
DROP POLICY IF EXISTS "shipment_compressed_leaves_public_read" ON public.shipment_compressed_leaves;
