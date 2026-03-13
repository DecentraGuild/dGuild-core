-- pg_cron invoke_edge_function needs supabase_url and service_role_key.
-- Supabase hosted sets these via vault. For local dev, we use cron_edge_config.
-- After db:seed, run: supabase status, then:
--   UPDATE cron_edge_config SET value = '<your_secret_key>' WHERE key = 'service_role_key';

CREATE TABLE IF NOT EXISTS public.cron_edge_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Local dev defaults. host.docker.internal reaches host from db container.
-- Run: supabase status, then UPDATE cron_edge_config SET value = '<Secret>' WHERE key = 'service_role_key';
INSERT INTO public.cron_edge_config (key, value) VALUES
  ('supabase_url', 'http://host.docker.internal:65421'),
  ('service_role_key', '')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.invoke_edge_function(fn_name text, body_json jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url text;
  service_key  text;
  config_url   text;
  config_key   text;
BEGIN
  -- Prefer cron_edge_config (local dev), else current_setting (hosted).
  SELECT value INTO config_url FROM public.cron_edge_config WHERE key = 'supabase_url';
  SELECT value INTO config_key FROM public.cron_edge_config WHERE key = 'service_role_key';
  -- Prefer vault (hosted), else cron_edge_config (local).
  supabase_url := COALESCE(NULLIF(TRIM(current_setting('app.supabase_url', true)), ''), NULLIF(TRIM(config_url), ''));
  service_key  := COALESCE(NULLIF(TRIM(current_setting('app.service_role_key', true)), ''), NULLIF(TRIM(config_key), ''));

  IF supabase_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING 'invoke_edge_function: supabase_url or service_role_key not set; skipping %', fn_name;
    RETURN;
  END IF;
  PERFORM extensions.http_post(
    url     := supabase_url || '/functions/v1/' || fn_name,
    headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
    body    := body_json::text
  );
END;
$$;
