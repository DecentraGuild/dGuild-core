-- Public bucket for tenant PWA icons (paths: {tenant_id}/icon-192.png, icon-512.png).
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-pwa-icons', 'tenant-pwa-icons', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tenant_pwa_icons_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'tenant-pwa-icons');

CREATE POLICY "tenant_pwa_icons_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tenant-pwa-icons'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.is_tenant_admin((storage.foldername(name))[1])
);

CREATE POLICY "tenant_pwa_icons_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tenant-pwa-icons'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.is_tenant_admin((storage.foldername(name))[1])
)
WITH CHECK (
  bucket_id = 'tenant-pwa-icons'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.is_tenant_admin((storage.foldername(name))[1])
);

CREATE POLICY "tenant_pwa_icons_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'tenant-pwa-icons'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.is_tenant_admin((storage.foldername(name))[1])
);
