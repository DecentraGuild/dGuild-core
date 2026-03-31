import { PublicKey } from '@solana/web3.js'
import { fetchTokenAccountsByMintPaginated, toBigIntAmount, type DasTokenAccountEntry } from '../das/token-accounts.js'
import { deriveTicketVaultPda } from './accounts.js'

export interface RaffleHolderBalanceRow {
  owner: string
  tickets: bigint
}

export interface FetchRaffleTicketHoldersResult {
  rows: RaffleHolderBalanceRow[]
  totalFromBalances: bigint
  matchesSold: boolean
  ticketsSoldOnChain: number
}

function ticketsFromRawAmount(raw: bigint, decimals: number): bigint {
  if (decimals <= 0) return raw
  const div = 10n ** BigInt(decimals)
  if (div === 0n) return raw
  return raw / div
}

export function aggregateTicketBalancesByOwner(
  entries: DasTokenAccountEntry[],
  ticketDecimals: number,
): { rows: RaffleHolderBalanceRow[]; total: bigint } {
  const byOwner = new Map<string, bigint>()
  for (const e of entries) {
    const owner = e.owner?.trim()
    if (!owner) continue
    const raw = toBigIntAmount(e.amount)
    const tickets = ticketsFromRawAmount(raw, ticketDecimals)
    if (tickets <= 0n) continue
    byOwner.set(owner, (byOwner.get(owner) ?? 0n) + tickets)
  }
  const rows: RaffleHolderBalanceRow[] = [...byOwner.entries()]
    .map(([owner, tickets]) => ({ owner, tickets }))
    .sort((a, b) => (a.tickets > b.tickets ? -1 : a.tickets < b.tickets ? 1 : a.owner.localeCompare(b.owner)))
  let total = 0n
  for (const r of rows) total += r.tickets
  return { rows, total }
}

export async function fetchRaffleTicketHoldersAggregated(
  rpcUrl: string,
  rafflePubkey: string,
  ticketMint: string,
  ticketsSoldOnChain: number,
  ticketDecimals: number,
): Promise<FetchRaffleTicketHoldersResult | null> {
  const vault = deriveTicketVaultPda(new PublicKey(rafflePubkey)).toBase58()
  const fetched = await fetchTokenAccountsByMintPaginated(rpcUrl, ticketMint)
  if (!fetched) return null

  const filtered = fetched.accounts.filter((a) => a.address !== vault)
  const { rows, total } = aggregateTicketBalancesByOwner(filtered, ticketDecimals)
  const soldBn = BigInt(Math.max(0, ticketsSoldOnChain))
  const matchesSold = total === soldBn

  return {
    rows,
    totalFromBalances: total,
    matchesSold,
    ticketsSoldOnChain,
  }
}
