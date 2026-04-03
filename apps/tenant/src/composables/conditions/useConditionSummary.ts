/**
 * Shared helpers for rendering condition summaries.
 * Used by catalog cards and anywhere a human-readable condition description is needed.
 */
import { formatDate, formatDateTime, formatRawTokenAmount } from '@decentraguild/display'
import type { CatalogMint } from '~/types/mints'

export function normalizeConditionPayload(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown
      if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>
    } catch {
      return {}
    }
    return {}
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  return {}
}

function rawAmountToString(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(Math.max(0, Math.floor(raw)))
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return raw.trim()
  return null
}

function formatPayloadAmount(
  rawAmt: unknown,
  mint: string,
  options?: ConditionSummaryOptions,
): string | null {
  const s = rawAmountToString(rawAmt)
  if (s == null) return null
  const cm = options?.catalogMints?.find((m) => m.asset_id === mint)
  const kind: 'SPL' | 'NFT' = cm?.kind === 'NFT' ? 'NFT' : 'SPL'
  const decimals =
    kind === 'NFT' ? 0 : cm?.decimals != null && Number.isFinite(cm.decimals) ? cm.decimals : null
  return formatRawTokenAmount(s, decimals, kind)
}

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
  const p = normalizeConditionPayload(condition.payload)
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
    const bd = String(p.begin_date ?? '').trim()
    const ed = String(p.end_date ?? '').trim()
    const range =
      bd && ed ? `${formatDate(bd)}–${formatDate(ed)}` : bd ? formatDate(bd) : ed ? formatDate(ed) : ''
    const amt = formatPayloadAmount(p.amount, mint, options)
    const parts = [`Period ${label}`, range, amt && amt !== '0' ? amt : ''].filter(Boolean)
    return parts.join(' · ')
  }
  if (type === 'SNAPSHOTS') {
    const label = options?.catalogMints?.find((m) => m.asset_id === mint)?.label ?? (mint ? `${mint.slice(0, 8)}…` : '?')
    const daysN = p.days != null ? Math.max(1, Math.floor(Number(p.days))) : null
    const daysStr = daysN != null && Number.isFinite(daysN) ? `${daysN}d hold` : ''
    const amt = formatPayloadAmount(p.amount, mint, options)
    const parts = [`Snapshots ${label}`, daysStr, amt && amt !== '0' ? `≥ ${amt}` : ''].filter(Boolean)
    return parts.join(' · ')
  }
  if (type === 'TIME_WEIGHTED') {
    const label = options?.catalogMints?.find((m) => m.asset_id === mint)?.label ?? (mint ? `${mint.slice(0, 8)}…` : '?')
    const begin = String(p.begin_snapshot_at ?? '').trim()
    const end = String(p.end_snapshot_at ?? '').trim()
    const range =
      begin && end
        ? `${formatDateTime(begin)} – ${formatDateTime(end)}`
        : begin
          ? formatDateTime(begin)
          : ''
    const mp = p.min_percent
    const mpStr =
      mp != null && mp !== '' && Number.isFinite(Number(mp)) && Number(mp) > 0
        ? `min ${Math.floor(Number(mp))}%`
        : ''
    const parts = [`Weighted ${label}`, range, mpStr].filter(Boolean)
    return parts.join(' · ')
  }
  if (type === 'TRAIT') {
    const tk = String(p.trait_key ?? '').trim()
    const tv = String(p.trait_value ?? '').trim()
    const label = options?.catalogMints?.find((m) => m.asset_id === mint)?.label ?? (mint ? `${mint.slice(0, 8)}…` : '?')
    const amt = formatPayloadAmount(p.amount, mint, options)
    const traitPart = tk ? `${tk}=${tv || '?'}` : ''
    const parts = [`Trait ${label}`, traitPart, amt && amt !== '0' && amt !== '?' ? `≥ ${amt}` : amt === '?' ? 'amount ?' : ''].filter(
      Boolean,
    )
    return parts.join(' · ')
  }
  const label = options?.catalogMints?.find((m) => m.asset_id === mint)?.label ?? (mint ? `${mint.slice(0, 8)}…` : '?')
  const amt = formatPayloadAmount(p.amount, mint, options)
  if (amt && amt !== '0' && amt !== '?') return `Hold ${label} · ≥ ${amt}`
  if (amt === '?') return `Hold ${label} · amount ?`
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
