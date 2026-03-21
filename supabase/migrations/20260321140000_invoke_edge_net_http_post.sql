-- pg_net on hosted Supabase exposes net.http_post(url, body, params, headers, timeout_milliseconds).
-- Legacy extensions.http_post(url, headers, body) does not exist — pg_cron was failing with
-- "function extensions.http_post(...) does not exist" and never reached Edge Functions.

CREATE OR REPLACE FUNCTION public.invoke_edge_function(fn_name text, body_json jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  supabase_url text;
  service_key  text;
BEGIN
  supabase_url := COALESCE(
    NULLIF(TRIM((SELECT ds.decrypted_secret FROM vault.decrypted_secrets ds WHERE ds.name = 'cron_invoke_supabase_url' LIMIT 1)), ''),
    NULLIF(TRIM(current_setting('app.supabase_url', true)), '')
  );
  service_key := COALESCE(
    NULLIF(TRIM((SELECT ds.decrypted_secret FROM vault.decrypted_secrets ds WHERE ds.name = 'cron_invoke_service_role_key' LIMIT 1)), ''),
    NULLIF(TRIM(current_setting('app.service_role_key', true)), '')
  );

  IF supabase_url IS NULL OR service_key IS NULL OR service_key = '' THEN
    RAISE WARNING 'invoke_edge_function: cron_invoke_supabase_url or cron_invoke_service_role_key missing in Vault (or empty app.*); skipping %', fn_name;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(supabase_url, '/') || '/functions/v1/' || fn_name,
    body := COALESCE(body_json, '{}'::jsonb),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 300000
  );
END;
$$;
