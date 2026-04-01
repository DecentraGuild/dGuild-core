import type { Connection } from '@solana/web3.js'
import { PublicKey } from '@solana/web3.js'
import { deriveTicketsPda } from './accounts.js'

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

const DEFAULT_PUBKEY = new PublicKey('11111111111111111111111111111111')

/** Anchor 8-byte discriminator + sold (u32) + total (u32); then one pubkey per ticket (skullnbones `TicketsTable` offset 8+4+4+32*i). */
const TICKETS_HEADER = 16

/**
 * Parse embedded entrant pubkeys from the Tickets account (single `getAccountInfo`).
 * Matches skullnbones: read `sold` slots, aggregate duplicate wallets, skip default pubkey only.
 */
function parseEntrantsFromTicketsAccount(data: Buffer): {
  sold: number
  rows: RaffleHolderBalanceRow[]
  totalFromBalances: bigint
} | null {
  if (data.length < TICKETS_HEADER) return null
  const sold = data.readUInt32LE(8)
  const totalCap = data.readUInt32LE(12)
  if (sold > 10_000_000) return null
  if (totalCap < sold) return null
  const maxKeys = Math.floor((data.length - TICKETS_HEADER) / 32)
  const keyCount = Math.min(sold, maxKeys)
  const totals = new Map<string, bigint>()
  for (let i = 0; i < keyCount; i += 1) {
    const start = TICKETS_HEADER + 32 * i
    const pk = new PublicKey(data.subarray(start, start + 32))
    if (pk.equals(DEFAULT_PUBKEY)) continue
    const owner = pk.toBase58()
    totals.set(owner, (totals.get(owner) ?? 0n) + 1n)
  }
  let totalFromBalances = 0n
  for (const t of totals.values()) totalFromBalances += t
  const rows: RaffleHolderBalanceRow[] = [...totals.entries()]
    .map(([owner, tickets]) => ({ owner, tickets }))
    .sort((a, b) => (a.tickets > b.tickets ? -1 : a.tickets < b.tickets ? 1 : a.owner.localeCompare(b.owner)))
  return { sold, rows, totalFromBalances }
}

/**
 * Entry list from the Tickets PDA only (one RPC). Same source as skullnbones `TicketsTable`.
 */
export async function fetchRaffleTicketHoldersAggregated(
  connection: Connection,
  rafflePubkey: string,
  ticketsSoldOnChain: number,
): Promise<FetchRaffleTicketHoldersResult> {
  const rafflePk = new PublicKey(rafflePubkey)
  const ticketsPk = deriveTicketsPda(rafflePk)
  const soldBn = BigInt(Math.max(0, ticketsSoldOnChain))

  if (soldBn === 0n) {
    return {
      rows: [],
      totalFromBalances: 0n,
      matchesSold: true,
      ticketsSoldOnChain,
    }
  }

  const info = await connection.getAccountInfo(ticketsPk, 'confirmed')
  if (!info?.data) {
    return {
      rows: [],
      totalFromBalances: 0n,
      matchesSold: false,
      ticketsSoldOnChain,
    }
  }

  const parsed = parseEntrantsFromTicketsAccount(Buffer.from(info.data))
  if (!parsed) {
    return {
      rows: [],
      totalFromBalances: 0n,
      matchesSold: false,
      ticketsSoldOnChain,
    }
  }

  return {
    rows: parsed.rows,
    totalFromBalances: parsed.totalFromBalances,
    matchesSold: parsed.totalFromBalances === soldBn,
    ticketsSoldOnChain,
  }
}
