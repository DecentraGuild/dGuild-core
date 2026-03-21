-- Re-register Watchtower pg_cron jobs so the scheduler reliably runs them.
-- If cron.job rows drift from the worker (e.g. legacy bare cron-tracker still firing),
-- unschedule + schedule refreshes metadata.

DO $$
BEGIN
  PERFORM cron.unschedule('tracker-holders');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('tracker-snapshots');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'tracker-holders',
  '*/5 * * * *',
  $$SELECT public.invoke_edge_function('cron-tracker', '{"mode":"holders"}'::jsonb)$$
);

SELECT cron.schedule(
  'tracker-snapshots',
  '* * * * *',
  $$SELECT public.invoke_edge_function('cron-tracker', '{"mode":"snapshot"}'::jsonb)$$
);
