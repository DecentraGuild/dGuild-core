import bs58 from 'bs58'
import type {
  ConfirmedSignatureInfo,
  ConfirmedTransactionMeta,
  Connection,
  VersionedMessage,
} from '@solana/web3.js'
import { PublicKey } from '@solana/web3.js'
import { RAFFLE_PROGRAM_ID } from '@decentraguild/contracts'
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

const TICKETS_HEADER = 16

const BUY_TICKETS_DISCRIMINATOR = Buffer.from([48, 16, 122, 137, 24, 214, 198, 58])
const RAFFLE_PROGRAM_PK = new PublicKey(RAFFLE_PROGRAM_ID)

const SIGNATURE_PAGE = 1000
const MAX_SIGNATURE_PAGES = 150
const TX_BATCH = 40

function parseEntrantsFromTicketsAccount(data: Buffer): {
  sold: number
  rows: RaffleHolderBalanceRow[]
  totalFromBalances: bigint
  matchesParsed: boolean
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
  const matchesParsed = keyCount === sold && totalFromBalances === BigInt(sold)
  const rows: RaffleHolderBalanceRow[] = [...totals.entries()]
    .map(([owner, tickets]) => ({ owner, tickets }))
    .sort((a, b) => (a.tickets > b.tickets ? -1 : a.tickets < b.tickets ? 1 : a.owner.localeCompare(b.owner)))
  return { sold, rows, totalFromBalances, matchesParsed }
}

function dataToBuffer(data: unknown): Buffer | null {
  if (data == null) return null
  if (Buffer.isBuffer(data)) return data
  if (data instanceof Uint8Array) return Buffer.from(data)
  if (typeof data === 'string') {
    try {
      return Buffer.from(bs58.decode(data))
    } catch {
      return null
    }
  }
  if (Array.isArray(data)) return Buffer.from(data as number[])
  return null
}

function tryDecodeBuyTickets(
  programIdIndex: number,
  accountIndexes: number[],
  dataBuf: Buffer | null,
  getKey: (i: number) => PublicKey | undefined,
): { buyer: string; count: number } | null {
  if (!dataBuf || dataBuf.length < 12) return null
  const pid = getKey(programIdIndex)
  if (!pid || !pid.equals(RAFFLE_PROGRAM_PK)) return null
  if (!dataBuf.subarray(0, 8).equals(BUY_TICKETS_DISCRIMINATOR)) return null
  const count = dataBuf.readUInt32LE(8)
  if (!Number.isFinite(count) || count <= 0 || count > 1_000_000) return null
  const buyerIdx = accountIndexes[0]
  if (buyerIdx === undefined) return null
  const buyer = getKey(buyerIdx)
  if (!buyer) return null
  return { buyer: buyer.toBase58(), count }
}

function collectBuysFromTx(
  message: VersionedMessage,
  meta: ConfirmedTransactionMeta | null,
  into: Map<string, bigint>,
): void {
  if (meta?.err) return
  const accountKeys = message.getAccountKeys({
    accountKeysFromLookups: meta?.loadedAddresses,
  })
  const getKey = (i: number) => accountKeys.get(i)

  const scanIx = (programIdIndex: number, accountIndexes: number[], dataRaw: unknown) => {
    const decoded = tryDecodeBuyTickets(programIdIndex, accountIndexes, dataToBuffer(dataRaw), getKey)
    if (!decoded) return
    const prev = into.get(decoded.buyer) ?? 0n
    into.set(decoded.buyer, prev + BigInt(decoded.count))
  }

  for (const ix of message.compiledInstructions) {
    scanIx(ix.programIdIndex, ix.accountKeyIndexes, ix.data)
  }

  for (const group of meta?.innerInstructions ?? []) {
    for (const iix of group.instructions) {
      scanIx(iix.programIdIndex, iix.accounts, iix.data)
    }
  }
}

async function fetchHoldersFromBuyTransactions(
  connection: Connection,
  rafflePubkey: string,
  ticketsSoldOnChain: number,
): Promise<FetchRaffleTicketHoldersResult | null> {
  const rafflePk = new PublicKey(rafflePubkey)
  const soldBn = BigInt(Math.max(0, ticketsSoldOnChain))
  const totals = new Map<string, bigint>()

  let before: string | undefined
  for (let page = 0; page < MAX_SIGNATURE_PAGES; page += 1) {
    const sigs: ConfirmedSignatureInfo[] = await connection.getSignaturesForAddress(
      rafflePk,
      { limit: SIGNATURE_PAGE, before },
      'confirmed',
    )
    if (sigs.length === 0) break

    for (let i = 0; i < sigs.length; i += TX_BATCH) {
      const chunk = sigs.slice(i, i + TX_BATCH).map((s) => s.signature)
      const txs = await connection.getTransactions(chunk, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      })
      for (const tx of txs) {
        if (!tx?.transaction || !tx.meta) continue
        collectBuysFromTx(tx.transaction.message, tx.meta, totals)
      }
    }

    before = sigs[sigs.length - 1]?.signature
    if (sigs.length < SIGNATURE_PAGE) break
  }

  const rows: RaffleHolderBalanceRow[] = [...totals.entries()]
    .map(([owner, tickets]) => ({ owner, tickets }))
    .sort((a, b) => (a.tickets > b.tickets ? -1 : a.tickets < b.tickets ? 1 : a.owner.localeCompare(b.owner)))

  let totalFromBalances = 0n
  for (const r of rows) totalFromBalances += r.tickets

  return {
    rows,
    totalFromBalances,
    matchesSold: totalFromBalances === soldBn,
    ticketsSoldOnChain,
  }
}

/**
 * Entry list for battle reveal / odds:
 * 1. If Tickets PDA embeds entrant pubkeys after sold/total and totals match on-chain sold, use that (single RPC).
 * 2. Otherwise aggregate successful `buy_tickets` instructions (matches deployed v0.2 where Tickets is only sold+total).
 */
export async function fetchRaffleTicketHoldersAggregated(
  connection: Connection,
  rafflePubkey: string,
  ticketsSoldOnChain: number,
): Promise<FetchRaffleTicketHoldersResult | null> {
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
  if (info?.data) {
    const parsed = parseEntrantsFromTicketsAccount(Buffer.from(info.data))
    if (
      parsed &&
      parsed.rows.length > 0 &&
      parsed.totalFromBalances === soldBn &&
      parsed.matchesParsed
    ) {
      return {
        rows: parsed.rows,
        totalFromBalances: parsed.totalFromBalances,
        matchesSold: true,
        ticketsSoldOnChain,
      }
    }
  }

  return fetchHoldersFromBuyTransactions(connection, rafflePubkey, ticketsSoldOnChain)
}
