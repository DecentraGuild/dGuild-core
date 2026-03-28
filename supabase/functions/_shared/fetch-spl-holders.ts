/**
 * SPL token holders via paginated JSON-RPC `getProgramAccountsV2` + dataSlice.
 * Avoids single-shot `getProgramAccounts` spikes that blow Edge isolates (HTTP 546).
 * Requires an RPC that implements `getProgramAccountsV2` (e.g. Helius). Set `HELIUS_RPC_URL`.
 */
const SPL_DATA_SIZE = 165
const OWNER_AMOUNT_SLICE_OFFSET = 32
const OWNER_AMOUNT_SLICE_LEN = 40
const GPA_V2_MAX_LIMIT = 10_000
const DEFAULT_PAGE_LIMIT = 4_000

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

async function solanaRpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!res.ok) {
    throw new Error(`RPC ${method} HTTP ${res.status}`)
  }
  const json = await res.json() as { result?: T; error?: { message?: string; code?: unknown } }
  if (json.error) {
    const msg = json.error.message ?? 'RPC error'
    throw new Error(`${method}: ${msg}`)
  }
  if (json.result === undefined) {
    throw new Error(`RPC ${method}: missing result`)
  }
  return json.result
}

/**
 * Classic SPL-Token program only (Tokenkeg…). Token-2022 not supported here.
 * Dynamic-imports web3 + spl-token so NFT-only cron batches do not load these when unused.
 */
export async function fetchSplHolders(
  rpcUrl: string,
  mint: string,
): Promise<Array<{ wallet: string; amount: string }>> {
  const { PublicKey } = await import('npm:@solana/web3.js@1')
  const { TOKEN_PROGRAM_ID } = await import('npm:@solana/spl-token@0.4')
  const mintPk = new PublicKey(mint)
  const programId = TOKEN_PROGRAM_ID.toBase58()
  const limit = parsePageLimit()

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

  const byWallet = new Map<string, bigint>()
  let paginationKey: string | null | undefined = undefined

  for (;;) {
    const opts = paginationKey != null ? { ...baseOpts, paginationKey } : baseOpts
    const result = await solanaRpc<GpaV2RpcResult>(rpcUrl, 'getProgramAccountsV2', [
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
      const owner = new PublicKey(data.slice(0, 32)).toBase58()
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
      const amount = view.getBigUint64(32, true)
      if (amount > 0n) byWallet.set(owner, (byWallet.get(owner) ?? 0n) + amount)
    }

    const nextKey = result.paginationKey
    paginationKey = nextKey != null && nextKey !== '' ? nextKey : null
    if (paginationKey == null) break
  }

  return [...byWallet.entries()].map(([wallet, amount]) => ({ wallet, amount: String(amount) }))
}
