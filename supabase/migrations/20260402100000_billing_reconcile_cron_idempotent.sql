-- Idempotent schedule for billing USDC batch reconcile (avoids duplicate job on re-run).

DO $$
BEGIN
  PERFORM cron.unschedule('billing-reconcile-usdc-batch');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;

SELECT cron.schedule(
  'billing-reconcile-usdc-batch',
  '*/5 * * * *',
  $$SELECT public.invoke_edge_function('billing', '{"action":"reconcile-usdc-batch"}'::jsonb)$$
);
