-- Cron: process entitlement_expiry_queue (subtract from tenant_meter_limits when grants expire).
SELECT cron.schedule(
  'expire-entitlements',
  '* * * * *',
  $$SELECT public.invoke_edge_function('billing', '{"action":"expire-entitlements"}'::jsonb)$$
);
