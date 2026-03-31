import { dasRequestAtUrl } from './client.js'

export interface DasTokenAccountEntry {
  address: string
  mint: string
  owner?: string
  amount?: number | string
}

export interface GetTokenAccountsDasResult {
  token_accounts?: DasTokenAccountEntry[]
  total?: number
  cursor?: string
  limit?: number
  last_indexed_slot?: number
}

const DEFAULT_PAGE_SIZE = 1000
const MAX_PAGES = 25

function toBigIntAmount(amount: number | string | undefined | null): bigint {
  if (amount == null) return 0n
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || amount < 0) return 0n
    return BigInt(Math.floor(amount))
  }
  const s = amount.trim()
  if (!s) return 0n
  try {
    return BigInt(s.split('.')[0] ?? '0')
  } catch {
    return 0n
  }
}

export async function fetchTokenAccountsByMintPaginated(
  rpcUrl: string,
  mint: string,
  options?: { pageSize?: number }
): Promise<{ accounts: DasTokenAccountEntry[]; lastIndexedSlot?: number } | null> {
  const pageSize = Math.min(options?.pageSize ?? DEFAULT_PAGE_SIZE, 1000)
  const collected: DasTokenAccountEntry[] = []
  let lastIndexedSlot: number | undefined
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const params: Record<string, unknown> = {
      mint,
      limit: pageSize,
      page,
      options: { showZeroBalance: false },
    }

    const result = await dasRequestAtUrl<GetTokenAccountsDasResult>(rpcUrl, 'getTokenAccounts', params)
    if (!result?.token_accounts) break

    const batch = result.token_accounts
    if (batch.length === 0) break
    collected.push(...batch)
    if (typeof result.last_indexed_slot === 'number') {
      lastIndexedSlot = result.last_indexed_slot
    }
    if (batch.length < pageSize) break
    if (typeof result.total === 'number' && collected.length >= result.total) break
  }
  return { accounts: collected, lastIndexedSlot }
}

export function sumTokenAmounts(entries: DasTokenAccountEntry[]): bigint {
  let s = 0n
  for (const e of entries) {
    s += toBigIntAmount(e.amount)
  }
  return s
}

export { toBigIntAmount }
