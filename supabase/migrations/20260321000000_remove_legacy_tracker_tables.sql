-- Remove legacy tracker tables: tracker_address_book and addressbook_settings.
-- Replaced by tenant_mint_catalog (central mint list for all modules).

DROP POLICY IF EXISTS "tracker_address_book_admin_write" ON public.tracker_address_book;
DROP POLICY IF EXISTS "addressbook_settings_admin_all" ON public.addressbook_settings;

DROP INDEX IF EXISTS idx_tracker_address_book_tenant;
DROP INDEX IF EXISTS idx_tracker_address_book_tier;

DROP TABLE IF EXISTS public.tracker_address_book;
DROP TABLE IF EXISTS public.addressbook_settings;
