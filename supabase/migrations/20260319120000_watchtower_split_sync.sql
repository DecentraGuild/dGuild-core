-- Split Watchtower: separate pg_cron for holders vs snapshots; tier + snapshot interval in DB.

CREATE TABLE IF NOT EXISTS public.platform_watchtower_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  snapshot_interval_minutes INT NOT NULL DEFAULT 720,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.platform_watchtower_settings (id, snapshot_interval_minutes)
VALUES (1, 720)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_watchtower_holder_tier (
  id SERIAL PRIMARY KEY,
  sort_order SMALLINT NOT NULL UNIQUE,
  max_holders INT,
  interval_minutes INT NOT NULL,
  CONSTRAINT platform_watchtower_holder_tier_max_holders_check CHECK (max_holders IS NULL OR max_holders >= 0)
);

INSERT INTO public.platform_watchtower_holder_tier (sort_order, max_holders, interval_minutes) VALUES
  (1, 500, 5),
  (2, 5000, 15),
  (3, NULL, 60)
ON CONFLICT (sort_order) DO NOTHING;

DO $$
BEGIN
  PERFORM cron.unschedule('tracker-sync');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

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

ALTER TABLE public.platform_watchtower_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_watchtower_holder_tier ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_watchtower_settings_no_direct_access" ON public.platform_watchtower_settings
  FOR ALL USING (false) WITH CHECK (false);

CREATE POLICY "platform_watchtower_holder_tier_no_direct_access" ON public.platform_watchtower_holder_tier
  FOR ALL USING (false) WITH CHECK (false);

SELECT cron.schedule(
  'tracker-holders',
  '*/5 * * * *',
  $$SELECT public.invoke_edge_function('cron-tracker', '{"mode":"holders"}'::jsonb)$$
);

SELECT cron.schedule(
  'tracker-snapshots',
  '0 0,12 * * *',
  $$SELECT public.invoke_edge_function('cron-tracker', '{"mode":"snapshot"}'::jsonb)$$
);
