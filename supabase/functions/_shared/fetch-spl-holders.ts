/**
 * SPL token holders via paginated JSON-RPC `getProgramAccountsV2` + dataSlice.
 * Large mints: use `fetchSplHoldersWithProgress` + `maxPages` and persist `pagination_key`
 * in `spl_holder_gpa_progress` across cron invocations (Edge WORKER_LIMIT / HTTP 546).
 */
import { solanaJsonRpc } from './solana-json-rpc.ts'

const SPL_DATA_SIZE = 165
const OWNER_AMOUNT_SLICE_OFFSET = 32
const OWNER_AMOUNT_SLICE_LEN = 40
const GPA_V2_MAX_LIMIT = 10_000
const DEFAULT_PAGE_LIMIT = 800

export function holderWalletsJsonToMap(raw: unknown): Map<string, bigint> {
  const m = new Map<string, bigint>()
  if (!Array.isArray(raw)) return m
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as { wallet?: unknown; amount?: unknown }
    if (o.wallet == null || o.amount == null) continue
    const w = String(o.wallet)
    try {
      const a = BigInt(String(o.amount))
      if (a > 0n) m.set(w, a)
    } catch {
      /* non-numeric amount */
    }
  }
  return m
}

function mapToHolders(m: Map<string, bigint>): Array<{ wallet: string; amount: string }> {
  const out: Array<{ wallet: string; amount: string }> = []
  for (const [wallet, amount] of m) {
    if (amount > 0n) out.push({ wallet, amount: String(amount) })
  }
  return out
}

function parsePageLimit(): number {
  const raw = Deno.env.get('SPL_HOLDERS_PAGE_LIMIT')?.trim()
  const n = raw ? Number(raw) : NaN
  const parsed = Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_PAGE_LIMIT
  return Math.min(GPA_V2_MAX_LIMIT, Math.max(1, parsed))
}

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

type GpaV2RpcResult = {
  accounts?: Array<{
    account?: { data?: [string, string] }
  }>
  paginationKey?: string | null
}

export type FetchSplHoldersOptions = {
  /** Cursor from `spl_holder_gpa_progress` to continue the same chain-wide scan */
  resumePaginationKey?: string | null
  /** Existing wallets (e.g. from `holder_current`) — amounts are cumulative per wallet so far */
  mergeInto?: Map<string, bigint>
  /** Max GPA pages this Edge invocation (omit for full scan in one request — may 546 on huge mints) */
  maxPages?: number
}

export type FetchSplHoldersProgress = {
  holders: Array<{ wallet: string; amount: string }>
  completed: boolean
  nextPaginationKey: string | null
}

/**
 * Classic SPL-Token program only (Tokenkeg…). Token-2022 not supported here.
 */
export async function fetchSplHoldersWithProgress(
  rpcUrl: string,
  mint: string,
  options?: FetchSplHoldersOptions,
): Promise<FetchSplHoldersProgress> {
  const { PublicKey } = await import('npm:@solana/web3.js@1')
  const { TOKEN_PROGRAM_ID } = await import('npm:@solana/spl-token@0.4')
  const bs58pkg = await import('npm:bs58@6.0.0') as {
    encode?: (d: Uint8Array) => string
    default?: { encode: (d: Uint8Array) => string }
  }
  const encode58 = bs58pkg.encode ?? bs58pkg.default?.encode
  if (!encode58) throw new Error('bs58 encode unavailable')

  const mintPk = new PublicKey(mint)
  const programId = TOKEN_PROGRAM_ID.toBase58()
  const limit = parsePageLimit()
  const byWallet = options?.mergeInto ?? new Map<string, bigint>()

  const baseOpts = {
    commitment: 'confirmed',
    encoding: 'base64' as const,
    dataSlice: { offset: OWNER_AMOUNT_SLICE_OFFSET, length: OWNER_AMOUNT_SLICE_LEN },
    filters: [
      { dataSize: SPL_DATA_SIZE },
      { memcmp: { offset: 0, bytes: mintPk.toBase58() } },
    ],
    limit,
  }

  let paginationKey: string | null | undefined =
    options?.resumePaginationKey === '' || options?.resumePaginationKey == null
      ? undefined
      : options.resumePaginationKey

  const maxPages = options?.maxPages
  let pagesDone = 0

  for (;;) {
    const opts = paginationKey != null ? { ...baseOpts, paginationKey } : baseOpts
    const result = await solanaJsonRpc<GpaV2RpcResult>(rpcUrl, 'getProgramAccountsV2', [
      programId,
      opts,
    ])

    for (const row of result.accounts ?? []) {
      const pair = row.account?.data
      if (!pair || !Array.isArray(pair)) continue
      const b64 = pair[0]
      if (typeof b64 !== 'string') continue
      const data = decodeBase64(b64)
      if (data.length < OWNER_AMOUNT_SLICE_LEN) continue
      const owner = encode58(data.subarray(0, 32))
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
      const amount = view.getBigUint64(32, true)
      if (amount > 0n) byWallet.set(owner, (byWallet.get(owner) ?? 0n) + amount)
    }

    pagesDone++
    const nextKeyRaw = result.paginationKey
    const nextKey = nextKeyRaw != null && nextKeyRaw !== '' ? nextKeyRaw : null

    if (maxPages != null && pagesDone >= maxPages) {
      const completed = nextKey == null
      return {
        holders: mapToHolders(byWallet),
        completed,
        nextPaginationKey: completed ? null : nextKey,
      }
    }

    if (nextKey == null) {
      return {
        holders: mapToHolders(byWallet),
        completed: true,
        nextPaginationKey: null,
      }
    }

    paginationKey = nextKey
  }
}

/** Full scan in one invocation (small/medium mints only — large SPL will 546). */
export async function fetchSplHolders(
  rpcUrl: string,
  mint: string,
): Promise<Array<{ wallet: string; amount: string }>> {
  const r = await fetchSplHoldersWithProgress(rpcUrl, mint)
  return r.holders
}
