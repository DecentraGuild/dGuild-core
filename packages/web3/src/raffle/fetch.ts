import type { Connection } from '@solana/web3.js'
import { PublicKey } from '@solana/web3.js'
import { derivePrizeVaultPda, deriveTicketsPda } from './accounts.js'

const DEFAULT_PUBKEY_BASE58 = '11111111111111111111111111111111'

export type RaffleState =
  | 'created'
  | 'ready'
  | 'running'
  | 'paused'
  | 'full'
  | 'claimprize'
  | 'claimtickets'
  | 'done'

export interface RaffleChainData {
  state: RaffleState
  stateDisplay: string
  ticketsSold: number
  ticketsTotal: number
  ticketMint: string
  ticketPrice: bigint
  ticketDecimals: number
  prizeMint: string
  prizeVaultCount: number
  prizeAmount: bigint
  prizeDecimals: number
  winner: string | null
  useWhitelist: boolean
  whitelist: string | null
  name: string
  description: string
  url: string
}

const STATE_DISPLAY: Record<RaffleState, string> = {
  created: 'Created',
  ready: 'Ready',
  running: 'Running',
  paused: 'Paused',
  full: 'Full',
  claimprize: 'Claim Prize',
  claimtickets: 'Claim Tickets',
  done: 'Done',
}

const STATE_NAMES = ['created', 'ready', 'running', 'paused', 'full', 'claimprize', 'claimtickets', 'done'] as const

function toStateDisplay(state: RaffleState): string {
  return STATE_DISPLAY[state] ?? state
}

function readBorshString(data: Buffer, offset: number): { value: string; bytesRead: number } {
  const len = data.readUInt32LE(offset)
  const value = data.subarray(offset + 4, offset + 4 + len).toString('utf8')
  return { value, bytesRead: 4 + len }
}

function parseRaffleRaw(data: Buffer): {
  state: RaffleState
  name: string
  description: string
  url: string
  ticketMint: string
  ticketPrice: bigint
  ticketDecimals: number
  prizeMint: string
  prizeVaultCount: number
  prizeAmount: bigint
  prizeDecimals: number
  winner: string | null
  useWhitelist: boolean
  whitelist: string | null
} | null {
  if (data.length < 8) return null
  let o = 8 // skip discriminator
  if (o + 8 + 1 + 32 + 1 > data.length) return null
  o += 8 // seed
  o += 1 // bump
  o += 32 // creator
  const stateIdx = data[o]
  o += 1
  const state = (STATE_NAMES[stateIdx] ?? 'created') as RaffleState
  const nameRes = readBorshString(data, o)
  o += nameRes.bytesRead
  const descRes = readBorshString(data, o)
  o += descRes.bytesRead
  const urlRes = readBorshString(data, o)
  o += urlRes.bytesRead
  if (o + 32 + 8 + 1 + 32 + 8 + 1 + 32 + 32 > data.length) return null
  const ticketMint = new PublicKey(data.subarray(o, o + 32)).toBase58()
  o += 32
  const ticketPrice = data.readBigUInt64LE(o)
  o += 8
  const ticketDecimals = data[o]
  o += 1
  const prizeMint = new PublicKey(data.subarray(o, o + 32)).toBase58()
  o += 32
  const prizeVaultCountBn = data.readBigUInt64LE(o)
  o += 8
  const prizeVaultCount = Number(prizeVaultCountBn)
  const prizeDecimals = data[o]
  o += 1
  o += 32 // tickets (pubkey)
  const winnerBytes = data.subarray(o, o + 32)
  const winner = winnerBytes.every((b) => b === 0) ? null : new PublicKey(winnerBytes).toBase58()
  o += 32
  if (o + 1 + 1 + 32 > data.length)
    return {
      state,
      name: nameRes.value,
      description: descRes.value,
      url: urlRes.value,
      ticketMint,
      ticketPrice,
      ticketDecimals,
      prizeMint,
      prizeVaultCount,
      prizeAmount: 0n,
      prizeDecimals,
      winner,
      useWhitelist: false,
      whitelist: null,
    }
  const randomnessOpt = data[o]
  o += 1
  if (randomnessOpt !== 0) o += 32
  const useWhitelist = data[o] !== 0
  o += 1
  const whitelistBytes = data.subarray(o, o + 32)
  const whitelist = whitelistBytes.every((b) => b === 0) ? null : new PublicKey(whitelistBytes).toBase58()
  return {
    state,
    name: nameRes.value,
    description: descRes.value,
    url: urlRes.value,
    ticketMint,
    ticketPrice,
    ticketDecimals,
    prizeMint,
    prizeVaultCount,
    prizeAmount: 0n,
    prizeDecimals,
    winner,
    useWhitelist,
    whitelist,
  }
}

export async function fetchRaffleChainData(
  connection: Connection,
  rafflePubkey: PublicKey | string
): Promise<RaffleChainData | null> {
  const pubkey = typeof rafflePubkey === 'string' ? new PublicKey(rafflePubkey) : rafflePubkey
  try {
    const [raffleInfo, ticketsInfo] = await Promise.all([
      connection.getAccountInfo(pubkey),
      connection.getAccountInfo(deriveTicketsPda(pubkey)),
    ])
    if (!raffleInfo?.data) return null
    const parsed = parseRaffleRaw(Buffer.from(raffleInfo.data))
    if (!parsed) return null
    let ticketsSold = 0
    let ticketsTotal = 0
    if (ticketsInfo?.data && ticketsInfo.data.length >= 12) {
      ticketsSold = ticketsInfo.data.readUInt32LE(8)
      ticketsTotal = ticketsInfo.data.readUInt32LE(12)
    }
    let prizeAmount = 0n
    if (
      parsed.prizeMint !== DEFAULT_PUBKEY_BASE58 &&
      parsed.prizeVaultCount > 0
    ) {
      try {
        const vaultPk = derivePrizeVaultPda(pubkey)
        const vaultInfo = await connection.getParsedAccountInfo(vaultPk)
        const raw = vaultInfo.value?.data
        if (raw && typeof raw === 'object' && 'parsed' in raw && raw.parsed && typeof raw.parsed === 'object') {
          const info = (raw.parsed as { info?: { tokenAmount?: { amount?: string } } }).info
          const amt = info?.tokenAmount?.amount
          if (amt) prizeAmount = BigInt(amt)
        }
      } catch {
        /* ignore */
      }
    }
    return {
      state: parsed.state,
      stateDisplay: toStateDisplay(parsed.state),
      ticketsSold,
      ticketsTotal,
      ticketMint: parsed.ticketMint,
      ticketPrice: parsed.ticketPrice,
      ticketDecimals: parsed.ticketDecimals,
      prizeMint: parsed.prizeMint,
      prizeVaultCount: parsed.prizeVaultCount,
      prizeAmount,
      prizeDecimals: parsed.prizeDecimals,
      winner: parsed.winner,
      useWhitelist: parsed.useWhitelist,
      whitelist: parsed.whitelist,
      name: parsed.name,
      description: parsed.description,
      url: parsed.url,
    }
  } catch {
    return null
  }
}

export interface RaffleWithAddress {
  publicKey: string
  name: string
  state: RaffleState
}

export async function fetchAllRaffles(connection: Connection): Promise<RaffleWithAddress[]> {
  const { getRaffleProgramReadOnly } = await import('./provider.js')
  const program = getRaffleProgramReadOnly(connection)
  const accountNs = program.account as Record<string, { all: (filters: unknown[]) => Promise<Array<{ publicKey: PublicKey; account: unknown }>> }>
  const raffleAccount = accountNs.raffle ?? accountNs.Raffle
  if (!raffleAccount) throw new Error('Raffle account not found in program')
  const accounts = await raffleAccount.all([])
  return accounts.map(({ publicKey, account }) => {
    const a = account as { name: string; state: Record<string, unknown> }
    const stateKey = Object.keys(a.state ?? {})[0] ?? 'created'
    const state = (STATE_NAMES.includes(stateKey as (typeof STATE_NAMES)[number]) ? stateKey : 'created') as RaffleState
    return {
      publicKey: publicKey.toBase58(),
      name: a.name ?? '',
      state,
    }
  })
}

/** States visible to end users (running and after). */
export const USER_VISIBLE_STATES: RaffleState[] = [
  'running',
  'full',
  'claimprize',
  'claimtickets',
  'done',
]

export function isRaffleVisibleToUsers(state: RaffleState): boolean {
  return USER_VISIBLE_STATES.includes(state)
}
