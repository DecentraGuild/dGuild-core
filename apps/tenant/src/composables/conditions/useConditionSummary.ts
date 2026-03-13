/**
 * Shared helpers for rendering condition summaries.
 * Used by catalog cards and anywhere a human-readable condition description is needed.
 */
import type { CatalogMint } from '~/types/mints'

export interface ConditionSummaryOptions {
  catalogMints?: CatalogMint[]
  gateLists?: Array<{ address: string; name: string }>
  /** Role names keyed by "guildId:roleId" */
  roleNames?: Record<string, string>
  /** Guild ID when resolving Discord role names (required for DISCORD conditions) */
  guildId?: string
}

export interface ConditionRow {
  type: string
  payload: Record<string, unknown>
  logic_to_next: string | null
}

/**
 * Convert a single condition row to a short summary string.
 */
export function conditionToSummary(
  condition: ConditionRow,
  options?: ConditionSummaryOptions,
): string {
  const p = condition.payload
  const mint = String(p.mint ?? p.collection_or_mint ?? p.list_address ?? '').trim()
  const type = condition.type || 'HOLDING'

  if (type === 'DISCORD') {
    const roleId = String(p.required_role_id ?? '').trim()
    const key = options?.guildId ? `${options.guildId}:${roleId}` : roleId
    const label = options?.roleNames?.[key] ?? options?.roleNames?.[roleId] ?? roleId
    return `Discord ${label || '?'}`
  }
  if (type === 'WHITELIST') {
    const label = options?.gateLists?.find((l) => l.address === mint)?.name ?? (mint ? `${mint.slice(0, 8)}…` : '?')
    return `Whitelist ${label}`
  }
  if (type === 'SHIPMENT') {
    const label = options?.catalogMints?.find((m) => m.asset_id === mint)?.label ?? (mint ? `${mint.slice(0, 8)}…` : '?')
    return `Period ${label}`
  }
  if (type === 'SNAPSHOTS') {
    const label = options?.catalogMints?.find((m) => m.asset_id === mint)?.label ?? (mint ? `${mint.slice(0, 8)}…` : '?')
    return `Snapshots ${label}`
  }
  if (type === 'TIME_WEIGHTED') {
    const label = options?.catalogMints?.find((m) => m.asset_id === mint)?.label ?? (mint ? `${mint.slice(0, 8)}…` : '?')
    return `Weighted ${label}`
  }
  if (type === 'TRAIT') {
    const tk = String(p.trait_key ?? '').trim()
    const tv = String(p.trait_value ?? '').trim()
    const label = options?.catalogMints?.find((m) => m.asset_id === mint)?.label ?? (mint ? `${mint.slice(0, 8)}…` : '?')
    return `Trait ${label}${tk ? ` ${tk}=${tv || '?'}` : ''}`
  }
  const label = options?.catalogMints?.find((m) => m.asset_id === mint)?.label ?? (mint ? `${mint.slice(0, 8)}…` : '?')
  return `Hold ${label}`
}

/**
 * Build full condition set summary with AND/OR logic.
 */
export function buildConditionSetSummary(
  conditions: ConditionRow[],
  options?: ConditionSummaryOptions,
): string {
  return conditions
    .map((c, i) => {
      const part = conditionToSummary(c, options)
      const next = conditions[i + 1]
      const logic = next ? (c.logic_to_next === 'OR' ? ' OR ' : ' AND ') : ''
      return part + logic
    })
    .join('')
}
