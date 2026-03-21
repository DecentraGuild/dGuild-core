-- pg_cron → Edge: credentials from Vault only (plus optional DB session settings).
-- Removes public.cron_edge_config — do not store service_role_key in application tables.

CREATE OR REPLACE FUNCTION public.invoke_edge_function(fn_name text, body_json jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault, extensions
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

  PERFORM extensions.http_post(
    url     := rtrim(supabase_url, '/') || '/functions/v1/' || fn_name,
    headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
    body    := body_json::text
  );
END;
$$;

DROP POLICY IF EXISTS "cron_edge_config_no_direct_access" ON public.cron_edge_config;
DROP TABLE IF EXISTS public.cron_edge_config;
