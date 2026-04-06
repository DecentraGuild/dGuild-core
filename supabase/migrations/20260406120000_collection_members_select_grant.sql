-- PostgREST: anon/authenticated need table privilege; RLS policy collection_members_public_read already allows rows.
GRANT SELECT ON TABLE public.collection_members TO anon, authenticated;
