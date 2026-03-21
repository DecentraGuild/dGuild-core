-- snapshot_interval_minutes (platform_watchtower_settings) defines bucket width for snapshot_at.
-- The snapshot job must run at least once per bucket; running every minute is cheap when the bucket
-- already has a row (cron-tracker skips RPC after an early existence check).

DO $$
BEGIN
  PERFORM cron.unschedule('tracker-snapshots');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'tracker-snapshots',
  '* * * * *',
  $$SELECT public.invoke_edge_function('cron-tracker', '{"mode":"snapshot"}'::jsonb)$$
);
