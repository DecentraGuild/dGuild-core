const DEFAULT_INTERNAL_DEV_TENANT_IDS: readonly string[] = ['0000000']

export { DEFAULT_INTERNAL_DEV_TENANT_IDS }

export function parseInternalDevTenantIds(raw: string | undefined | null): string[] {
  if (raw == null || typeof raw !== 'string') return []
  return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))]
}

export function resolveInternalDevTenantIdsFromEnv(
  envValue: string | undefined | null,
): readonly string[] {
  const extra = parseInternalDevTenantIds(envValue)
  return [...new Set([...DEFAULT_INTERNAL_DEV_TENANT_IDS, ...extra])]
}
