export function normalizeHostnameForMatch(hostOrHostname: string): string {
  const withoutPort = hostOrHostname.split(':')[0].trim().toLowerCase()
  return withoutPort.startsWith('www.') ? withoutPort.slice(4) : withoutPort
}

export function normalizedTenantSingleHostFromConfig(configValue: unknown): string {
  const raw = typeof configValue === 'string' ? configValue.trim() : ''
  const base = (raw || 'dapp.dguild.org').toLowerCase()
  return normalizeHostnameForMatch(base)
}

export function requestHostMatchesTenantSingleHost(
  requestHost: string,
  tenantSingleHostConfig: unknown,
): boolean {
  const current = normalizeHostnameForMatch(requestHost)
  if (
    import.meta.dev &&
    (current === 'localhost' || current === '127.0.0.1')
  ) {
    return true
  }
  const configured = normalizedTenantSingleHostFromConfig(tenantSingleHostConfig)
  return current === configured
}
