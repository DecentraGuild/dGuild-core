-- Lightweight holder_current rows for cron-tracker tier intervals (avoid loading full JSONB).

CREATE OR REPLACE FUNCTION public.holder_current_sync_meta(p_mints text[])
RETURNS TABLE(mint text, last_updated timestamptz, holder_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.mint::text,
         h.last_updated,
         CASE
           WHEN h.holder_wallets IS NULL THEN 0
           WHEN jsonb_typeof(h.holder_wallets) = 'array'
           THEN (jsonb_array_length(h.holder_wallets))::integer
           ELSE 0
         END AS holder_count
  FROM public.holder_current h
  WHERE h.mint = ANY(p_mints);
$$;

REVOKE ALL ON FUNCTION public.holder_current_sync_meta(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.holder_current_sync_meta(text[]) TO service_role;
