import { query } from './client.js'

export type TrackerMintKind = 'SPL' | 'NFT'
export type TrackerTier = 'base' | 'grow' | 'pro'

/** Stored in tracker_address_book.trait_index for NFT entries (same shape as Discord guild mints). */
export interface TrackerTraitIndex {
  trait_keys: string[]
  trait_options: Record<string, string[]>
}

export interface TrackerAddressBookRow {
  id: number
  tenant_id: string
  mint: string
  kind: TrackerMintKind
  tier: TrackerTier
  label: string | null
  image: string | null
  name: string | null
  trait_index: TrackerTraitIndex | null
  created_at: Date
  updated_at: Date
}

function parseTraitIndex(raw: unknown): TrackerTraitIndex | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const keys = o.trait_keys
  const options = o.trait_options
  if (!Array.isArray(keys) || !options || typeof options !== 'object') return null
  const trait_options: Record<string, string[]> = {}
  for (const k of keys) {
    const v = (options as Record<string, unknown>)[String(k)]
    trait_options[String(k)] = Array.isArray(v) ? v.map(String) : []
  }
  return { trait_keys: keys.map(String), trait_options }
}

function mapRow(row: Record<string, unknown>): TrackerAddressBookRow {
  return {
    id: row.id as number,
    tenant_id: row.tenant_id as string,
    mint: row.mint as string,
    kind: row.kind as TrackerMintKind,
    tier: row.tier as TrackerTier,
    label: (row.label as string) ?? null,
    image: (row.image as string) ?? null,
    name: (row.name as string) ?? null,
    trait_index: parseTraitIndex(row.trait_index),
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  }
}

export async function listAddressBook(tenantId: string): Promise<TrackerAddressBookRow[]> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT * FROM tracker_address_book WHERE tenant_id = $1 ORDER BY created_at ASC`,
    [tenantId],
  )
  return rows.map(mapRow)
}

export async function getAddressBookEntry(tenantId: string, mint: string): Promise<TrackerAddressBookRow | null> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT * FROM tracker_address_book WHERE tenant_id = $1 AND mint = $2`,
    [tenantId, mint],
  )
  return rows.length > 0 ? mapRow(rows[0]) : null
}

export async function addAddressBookEntry(
  tenantId: string,
  mint: string,
  kind: TrackerMintKind,
  tier: TrackerTier,
  label?: string | null,
  image?: string | null,
  name?: string | null,
  traitIndex?: TrackerTraitIndex | null,
): Promise<TrackerAddressBookRow> {
  const traitIndexJson = traitIndex != null ? JSON.stringify(traitIndex) : null
  const { rows } = await query<Record<string, unknown>>(
    `INSERT INTO tracker_address_book (tenant_id, mint, kind, tier, label, image, name, trait_index)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (tenant_id, mint) DO UPDATE SET
       kind = EXCLUDED.kind,
       tier = EXCLUDED.tier,
       label = COALESCE(EXCLUDED.label, tracker_address_book.label),
       image = COALESCE(EXCLUDED.image, tracker_address_book.image),
       name = COALESCE(EXCLUDED.name, tracker_address_book.name),
       trait_index = COALESCE(EXCLUDED.trait_index, tracker_address_book.trait_index),
       updated_at = NOW()
     RETURNING *`,
    [tenantId, mint, kind, tier, label ?? null, image ?? null, name ?? null, traitIndexJson],
  )
  return mapRow(rows[0])
}

export async function updateAddressBookTier(
  tenantId: string,
  mint: string,
  tier: TrackerTier,
): Promise<TrackerAddressBookRow | null> {
  const { rows } = await query<Record<string, unknown>>(
    `UPDATE tracker_address_book SET tier = $3, updated_at = NOW()
     WHERE tenant_id = $1 AND mint = $2
     RETURNING *`,
    [tenantId, mint, tier],
  )
  return rows.length > 0 ? mapRow(rows[0]) : null
}

export async function updateAddressBookTraitIndex(
  tenantId: string,
  mint: string,
  traitIndex: TrackerTraitIndex | null,
): Promise<TrackerAddressBookRow | null> {
  const traitIndexJson = traitIndex != null ? JSON.stringify(traitIndex) : null
  const { rows } = await query<Record<string, unknown>>(
    `UPDATE tracker_address_book SET trait_index = $3::jsonb, updated_at = NOW()
     WHERE tenant_id = $1 AND mint = $2
     RETURNING *`,
    [tenantId, mint, traitIndexJson],
  )
  return rows.length > 0 ? mapRow(rows[0]) : null
}

export async function removeAddressBookEntry(tenantId: string, mint: string): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM tracker_address_book WHERE tenant_id = $1 AND mint = $2`,
    [tenantId, mint],
  )
  return rowCount > 0
}

export interface TrackerTierCounts {
  mintsBase: number
  mintsGrow: number
  mintsPro: number
}

export async function getAddressBookTierCounts(tenantId: string): Promise<TrackerTierCounts> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT tier, COUNT(*)::int AS count FROM tracker_address_book
     WHERE tenant_id = $1 GROUP BY tier`,
    [tenantId],
  )
  const counts: TrackerTierCounts = { mintsBase: 0, mintsGrow: 0, mintsPro: 0 }
  for (const row of rows) {
    const tier = row.tier as string
    const count = row.count as number
    if (tier === 'base') counts.mintsBase = count
    else if (tier === 'grow') counts.mintsGrow = count
    else if (tier === 'pro') counts.mintsPro = count
  }
  return counts
}

export interface HolderSnapshotSummary {
  date: string
  holderCount: number
}

export async function listHolderSnapshots(
  tenantId: string,
  mint: string,
): Promise<HolderSnapshotSummary[]> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT snapshot_date::text AS date, jsonb_array_length(holder_wallets)::int AS holder_count
     FROM tracker_holder_snapshots
     WHERE tenant_id = $1 AND mint = $2
     ORDER BY snapshot_date DESC`,
    [tenantId, mint],
  )
  return rows.map((r) => ({
    date: r.date as string,
    holderCount: (r.holder_count as number) ?? 0,
  }))
}

export async function getHolderSnapshotByDate(
  tenantId: string,
  mint: string,
  date: string,
): Promise<string[] | null> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT holder_wallets FROM tracker_holder_snapshots
     WHERE tenant_id = $1 AND mint = $2 AND snapshot_date = $3`,
    [tenantId, mint, date],
  )
  if (rows.length === 0) return null
  const raw = rows[0].holder_wallets
  if (!Array.isArray(raw)) return []
  return raw.map((x) => (typeof x === 'object' && x && 'wallet' in x ? (x as { wallet: string }).wallet : String(x)))
}
