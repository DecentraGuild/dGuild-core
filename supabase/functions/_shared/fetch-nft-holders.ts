/**
 * NFT collection holders via paginated JSON-RPC `getAssetsByGroup`.
 * Omit `maxPages` to scan the full group in one invocation. Optional `maxPages` + `nft_holder_group_progress`
 * supports resume after a failed run (e.g. Edge timeout), not deliberate partial sync.
 */

const GROUP_PAGE_LIMIT = 1000

export function nftHolderWalletsJsonToMap(raw: unknown): Map<string, number> {
  const m = new Map<string, number>()
  if (!Array.isArray(raw)) return m
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as { wallet?: unknown; amount?: unknown }
    if (o.wallet == null || o.amount == null) continue
    const w = String(o.wallet)
    const n = Number(String(o.amount))
    if (!Number.isFinite(n) || n <= 0) continue
    m.set(w, (m.get(w) ?? 0) + Math.floor(n))
  }
  return m
}

function mapToHolders(countByWallet: Map<string, number>): Array<{ wallet: string; amount: string }> {
  const out: Array<{ wallet: string; amount: string }> = []
  for (const [wallet, amount] of countByWallet) {
    if (amount > 0) out.push({ wallet, amount: String(amount) })
  }
  return out
}

export type FetchNftHoldersOptions = {
  /** 1-based `getAssetsByGroup` page to fetch first */
  startPage: number
  /** Running counts per wallet; mutated in place */
  mergeInto: Map<string, number>
  /**
   * Max RPC pages per invocation (each page up to GROUP_PAGE_LIMIT items).
   * Omit for no cap — loop until the collection scan completes (e.g. admin single-mint).
   */
  maxPages?: number
}

export type FetchNftHoldersResult = {
  holders: Array<{ wallet: string; amount: string }>
  completed: boolean
  /** When incomplete, next page index to persist */
  nextPage: number | null
}

export async function fetchNftHoldersWithProgress(
  rpcEndpoint: string,
  mint: string,
  options: FetchNftHoldersOptions,
): Promise<FetchNftHoldersResult> {
  const { mergeInto } = options
  const maxPages = options.maxPages
  const capped =
    maxPages != null && Number.isFinite(maxPages) && maxPages > 0
  const pageLimit = capped ? Math.floor(maxPages!) : Number.POSITIVE_INFINITY

  let page = options.startPage
  let pagesDone = 0

  while (pagesDone < pageLimit) {
    const res = await fetch(rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAssetsByGroup',
        params: { groupKey: 'collection', groupValue: mint, limit: GROUP_PAGE_LIMIT, page },
      }),
    })
    if (!res.ok) {
      throw new Error(`getAssetsByGroup HTTP ${res.status}`)
    }
    const data = await res.json() as {
      result?: { items?: Array<{ ownership?: { owner?: string } }> }
      error?: { message?: string }
    }
    if (data.error) {
      throw new Error(data.error.message ?? 'getAssetsByGroup RPC error')
    }
    const items = data.result?.items ?? []
    for (const item of items) {
      const owner = item.ownership?.owner
      if (owner) mergeInto.set(owner, (mergeInto.get(owner) ?? 0) + 1)
    }
    pagesDone++
    if (items.length < GROUP_PAGE_LIMIT) {
      return { holders: mapToHolders(mergeInto), completed: true, nextPage: null }
    }
    page++
  }

  return {
    holders: mapToHolders(mergeInto),
    completed: false,
    nextPage: page,
  }
}
