-- Replace platform_watchtower_settings with interval_timers: keyed rows for platform-wide timers
-- (watchtower snapshot bucket width, Discord bot role sync cadence, etc.).

CREATE TABLE IF NOT EXISTS public.interval_timers (
  timer_key TEXT PRIMARY KEY,
  interval_minutes INT NOT NULL CHECK (interval_minutes > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF to_regclass('public.platform_watchtower_settings') IS NOT NULL THEN
    INSERT INTO public.interval_timers (timer_key, interval_minutes)
    SELECT 'watchtower_snapshot_bucket', snapshot_interval_minutes
    FROM public.platform_watchtower_settings
    WHERE id = 1
    ON CONFLICT (timer_key) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.interval_timers (timer_key, interval_minutes)
VALUES ('watchtower_snapshot_bucket', 720)
ON CONFLICT (timer_key) DO NOTHING;

INSERT INTO public.interval_timers (timer_key, interval_minutes)
VALUES ('discord_role_sync', 15)
ON CONFLICT (timer_key) DO NOTHING;

DROP TABLE IF EXISTS public.platform_watchtower_settings;

ALTER TABLE public.interval_timers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interval_timers_no_direct_access" ON public.interval_timers;

CREATE POLICY "interval_timers_no_direct_access" ON public.interval_timers
  FOR ALL USING (false) WITH CHECK (false);
