/**
 * Supabase vars are runtime-only. Railpack infers build secrets from `process.env.NAME` dot access;
 * computed keys keep `npm run build` (tsup) from requiring these at image build time.
 */
const env = process.env

export function getSupabaseUrl(): string | undefined {
  return env['SUPA' + 'BASE_URL']?.trim()
}

export function getSupabaseServiceRoleKey(): string | undefined {
  return env['SUPA' + 'BASE_SERVICE_ROLE_KEY']?.trim()
}
