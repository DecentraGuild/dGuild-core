/**
 * Tracker sync jobs: metadata refresh (weekly) and holder snapshots (daily) for Grow/Pro mints.
 * Reuses existing DAS/RPC helpers and mint_metadata table. Tracker holder snapshots go into
 * tracker_holder_snapshots (tenant-scoped, date-keyed).
 */

import { Connection, PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { fetchAssetsByGroup, fetchMintMetadataFromChain } from '@decentraguild/web3'
import { getSolanaConnection } from '../solana-connection.js'
import { getPool } from '../db/client.js'
import { query } from '../db/client.js'
import { upsertMintMetadata } from '../db/marketplace-metadata.js'

interface TrackerSyncLog {
  info?: (obj: unknown, msg?: string) => void
  warn?: (obj: unknown, msg?: string) => void
}

interface TrackerMintRow {
  tenant_id: string
  mint: string
  kind: 'SPL' | 'NFT'
  tier: string
}

const SPL_TOKEN_ACCOUNT_DATA_SIZE = 165
const OWNER_OFFSET = 32
const AMOUNT_OFFSET = 64

async function getGrowAndProMints(): Promise<TrackerMintRow[]> {
  const pool = getPool()
  if (!pool) return []
  const { rows } = await query<TrackerMintRow>(
    `SELECT tenant_id, mint, kind, tier FROM tracker_address_book WHERE tier IN ('grow', 'pro')`,
  )
  return rows
}

async function shouldRefreshMetadata(mint: string, maxAgeDays: number): Promise<boolean> {
  const pool = getPool()
  if (!pool) return true
  const { rows } = await query<{ updated_at: string }>(
    `SELECT updated_at::text FROM mint_metadata WHERE mint = $1`,
    [mint],
  )
  if (rows.length === 0) return true
  const age = Date.now() - new Date(rows[0].updated_at).getTime()
  return age > maxAgeDays * 24 * 60 * 60 * 1000
}

async function refreshMintMetadata(mint: string, log: TrackerSyncLog): Promise<void> {
  try {
    const connection = getSolanaConnection()
    const meta = await fetchMintMetadataFromChain(connection, mint)
    if (meta) {
      await upsertMintMetadata({
        mint,
        name: meta.name ?? null,
        symbol: meta.symbol ?? null,
        image: meta.image ?? null,
        decimals: meta.decimals ?? null,
      })
    }
  } catch (e) {
    log.warn?.({ mint, err: e instanceof Error ? e.message : e }, 'Tracker: metadata refresh failed')
  }
}

function parseSplHolders(data: Buffer[]): Array<{ wallet: string; amount: string }> {
  const holders: Array<{ wallet: string; amount: string }> = []
  for (const buf of data) {
    if (buf.length < SPL_TOKEN_ACCOUNT_DATA_SIZE) continue
    try {
      const owner = new PublicKey(buf.subarray(OWNER_OFFSET, OWNER_OFFSET + 32)).toBase58()
      const amount = buf.readBigUInt64LE(AMOUNT_OFFSET).toString()
      if (BigInt(amount) > 0n) {
        holders.push({ wallet: owner, amount })
      }
    } catch {
      continue
    }
  }
  return holders
}

async function fetchSplHolders(
  connection: Connection,
  mint: string,
): Promise<Array<{ wallet: string; amount: string }>> {
  const mintPk = new PublicKey(mint)
  const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      { dataSize: SPL_TOKEN_ACCOUNT_DATA_SIZE },
      { memcmp: { offset: 0, bytes: mintPk.toBase58() } },
    ],
    dataSlice: { offset: 0, length: SPL_TOKEN_ACCOUNT_DATA_SIZE },
  })
  return parseSplHolders(accounts.map((a) => a.account.data as Buffer))
}

async function fetchNftHolders(
  mint: string,
): Promise<string[]> {
  const assets = await fetchAssetsByGroup('collection', mint)
  const owners = new Set<string>()
  for (const asset of assets) {
    const owner = (asset as Record<string, unknown>).ownership
    if (owner && typeof owner === 'object') {
      const o = (owner as Record<string, unknown>).owner
      if (typeof o === 'string') owners.add(o)
    }
  }
  return [...owners]
}

async function upsertTrackerHolderSnapshot(
  tenantId: string,
  mint: string,
  holderWallets: unknown[],
  snapshotDate: string,
): Promise<void> {
  await query(
    `INSERT INTO tracker_holder_snapshots (tenant_id, mint, holder_wallets, snapshot_date)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (tenant_id, mint, snapshot_date) DO UPDATE SET
       holder_wallets = EXCLUDED.holder_wallets,
       created_at = NOW()`,
    [tenantId, mint, JSON.stringify(holderWallets), snapshotDate],
  )
}

async function shouldSnapshotToday(tenantId: string, mint: string, today: string): Promise<boolean> {
  const pool = getPool()
  if (!pool) return true
  const { rows } = await query<{ id: number }>(
    `SELECT id FROM tracker_holder_snapshots WHERE tenant_id = $1 AND mint = $2 AND snapshot_date = $3`,
    [tenantId, mint, today],
  )
  return rows.length === 0
}

const METADATA_REFRESH_AGE_DAYS = 7

/**
 * Run tracker sync: metadata refresh for stale Grow/Pro mints and daily holder snapshots.
 * Designed to be called from the worker on a schedule (e.g. every 30 minutes).
 */
export async function runTrackerSync(log: TrackerSyncLog): Promise<void> {
  const pool = getPool()
  if (!pool) {
    log.info?.({}, 'Tracker sync: no database, skipping')
    return
  }

  const mints = await getGrowAndProMints()
  if (mints.length === 0) {
    log.info?.({}, 'Tracker sync: no Grow/Pro mints to process')
    return
  }

  log.info?.({ count: mints.length }, 'Tracker sync: processing Grow/Pro mints')

  const today = new Date().toISOString().slice(0, 10)
  const connection = getSolanaConnection()

  for (const row of mints) {
    try {
      const needsMetadata = await shouldRefreshMetadata(row.mint, METADATA_REFRESH_AGE_DAYS)
      if (needsMetadata) {
        await refreshMintMetadata(row.mint, log)
      }

      const needsSnapshot = await shouldSnapshotToday(row.tenant_id, row.mint, today)
      if (needsSnapshot) {
        let holders: unknown[]
        if (row.kind === 'SPL') {
          holders = await fetchSplHolders(connection, row.mint)
        } else {
          holders = await fetchNftHolders(row.mint)
        }
        await upsertTrackerHolderSnapshot(row.tenant_id, row.mint, holders, today)
        log.info?.({ mint: row.mint, kind: row.kind, holders: holders.length }, 'Tracker sync: snapshot saved')
      }
    } catch (e) {
      log.warn?.(
        { mint: row.mint, tenant: row.tenant_id, err: e instanceof Error ? e.message : e },
        'Tracker sync: error processing mint',
      )
    }
  }
}
