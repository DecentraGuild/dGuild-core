-- Fix all public views: run as invoking user so RLS on underlying tables applies.
-- PostgreSQL 15+ supports security_invoker. Catches current and future views.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', r.relname);
  END LOOP;
END;
$$;
