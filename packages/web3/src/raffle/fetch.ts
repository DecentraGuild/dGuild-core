import type { Connection } from '@solana/web3.js'
import { PublicKey } from '@solana/web3.js'
import type { Program } from '@coral-xyz/anchor'
import { derivePrizeVaultPda, deriveTicketsPda } from './accounts.js'
import { getRaffleProgramReadOnly } from './provider.js'

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

/** Map Anchor enum object (e.g. `{ running: {} }`, `{ CREATED: {} }`) or variant index to our state union. */
function raffleStateFromAnchor(state: unknown): RaffleState {
  if (typeof state === 'number' && Number.isInteger(state) && state >= 0 && state < STATE_NAMES.length) {
    return STATE_NAMES[state] as RaffleState
  }
  if (!state || typeof state !== 'object') return 'created'
  const key = Object.keys(state as Record<string, unknown>)[0]
  if (!key) return 'created'
  const norm = key.toLowerCase()
  if ((STATE_NAMES as readonly string[]).includes(norm)) return norm as RaffleState
  return 'created'
}

function readBorshString(data: Buffer, offset: number): { value: string; bytesRead: number } {
  const len = data.readUInt32LE(offset)
  const value = data.subarray(offset + 4, offset + 4 + len).toString('utf8')
  return { value, bytesRead: 4 + len }
}

/** Layout must match on-chain Raffle account (after 8-byte Anchor discriminator). */
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
  prizeDecimals: number
  winner: string | null
  useWhitelist: boolean
  whitelist: string | null
} | null {
  if (data.length < 8) return null
  let o = 8
  if (o + 8 + 1 + 32 + 1 > data.length) return null
  o += 8
  o += 1
  o += 32
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
  o += 32
  const winnerBytes = data.subarray(o, o + 32)
  const winner = winnerBytes.every((b) => b === 0) ? null : new PublicKey(winnerBytes).toBase58()
  o += 32
  if (o + 1 + 1 + 32 > data.length) {
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
      prizeDecimals,
      winner,
      useWhitelist: false,
      whitelist: null,
    }
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
    prizeDecimals,
    winner,
    useWhitelist,
    whitelist,
  }
}

function parseTicketsRaw(data: Buffer): { sold: number; total: number } {
  if (data.length < 12) return { sold: 0, total: 0 }
  return {
    sold: data.readUInt32LE(8),
    total: data.readUInt32LE(12),
  }
}

function pickRecord(obj: unknown): Record<string, unknown> {
  return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : {}
}

function pickField(obj: Record<string, unknown>, camel: string, snake: string): unknown {
  if (camel in obj) return obj[camel]
  if (snake in obj) return obj[snake]
  return undefined
}

function bnLikeToBigint(v: unknown): bigint {
  if (v == null) return 0n
  if (typeof v === 'bigint') return v
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v))
  if (typeof v === 'object' && v !== null && 'toString' in v) {
    return BigInt(String((v as { toString: () => string }).toString()))
  }
  return 0n
}

function bnLikeToNumber(v: unknown): number {
  const b = bnLikeToBigint(v)
  return Number(b)
}

function pubkeyToBase58OrNull(pk: unknown): string | null {
  if (!(pk instanceof PublicKey)) return null
  if (pk.equals(PublicKey.default)) return null
  const s = pk.toBase58()
  return s === DEFAULT_PUBKEY_BASE58 ? null : s
}

type DecodedRaffleAccount = {
  state: RaffleState
  name: string
  description: string
  url: string
  ticketMint: string
  ticketPrice: bigint
  ticketDecimals: number
  prizeMint: string
  prizeVaultCount: number
  prizeDecimals: number
  winner: string | null
  useWhitelist: boolean
  whitelist: string | null
}

/** Decode Raffle account: Anchor IDL first, then raw borsh if decode fails or state disagrees with raw byte. */
function decodeRaffleAccount(program: Program, data: Buffer): DecodedRaffleAccount | null {
  const manual = parseRaffleRaw(data)
  let fromAnchor: DecodedRaffleAccount | null = null
  try {
    const raw = program.coder.accounts.decode('Raffle', data) as unknown
    const d = pickRecord(raw)

    const ticketMintPk = pickField(d, 'ticketMint', 'ticket_mint')
    const prizeMintPk = pickField(d, 'prizeMint', 'prize_mint')
    const winnerPk = d.winner
    const whitelistPk = d.whitelist

    const ticketMint =
      ticketMintPk instanceof PublicKey ? ticketMintPk.toBase58() : DEFAULT_PUBKEY_BASE58
    const prizeMint =
      prizeMintPk instanceof PublicKey ? prizeMintPk.toBase58() : DEFAULT_PUBKEY_BASE58

    fromAnchor = {
      state: raffleStateFromAnchor(d.state),
      name: String(d.name ?? ''),
      description: String(d.description ?? ''),
      url: String(d.url ?? ''),
      ticketMint,
      ticketPrice: bnLikeToBigint(pickField(d, 'ticketPrice', 'ticket_price')),
      ticketDecimals: Number(pickField(d, 'ticketDecimals', 'ticket_decimals') ?? 0),
      prizeMint,
      prizeVaultCount: bnLikeToNumber(pickField(d, 'prizeVaultCount', 'prize_vault_count')),
      prizeDecimals: Number(pickField(d, 'prizeDecimals', 'prize_decimals') ?? 0),
      winner: pubkeyToBase58OrNull(winnerPk),
      useWhitelist: Boolean(pickField(d, 'useWhitelist', 'use_whitelist')),
      whitelist: pubkeyToBase58OrNull(whitelistPk),
    }
  } catch {
    /* use manual below */
  }
  if (!fromAnchor) return manual
  if (manual && manual.state !== fromAnchor.state) return manual
  return fromAnchor
}

function decodeTicketsAccount(program: Program, data: Buffer | undefined): { sold: number; total: number } {
  if (!data?.length) return { sold: 0, total: 0 }
  const buf = Buffer.from(data)
  try {
    const raw = program.coder.accounts.decode('Tickets', buf) as unknown
    const t = pickRecord(raw)
    return {
      sold: Number(t.sold ?? 0),
      total: Number(t.total ?? 0),
    }
  } catch {
    return parseTicketsRaw(buf)
  }
}

export async function fetchRaffleChainData(
  connection: Connection,
  rafflePubkey: PublicKey | string
): Promise<RaffleChainData | null> {
  const pubkey = typeof rafflePubkey === 'string' ? new PublicKey(rafflePubkey) : rafflePubkey
  try {
    const program = getRaffleProgramReadOnly(connection)
    const [raffleInfo, ticketsInfo] = await Promise.all([
      connection.getAccountInfo(pubkey),
      connection.getAccountInfo(deriveTicketsPda(pubkey)),
    ])
    if (!raffleInfo?.data) return null
    const parsed = decodeRaffleAccount(program, Buffer.from(raffleInfo.data))
    if (!parsed) return null
    const { sold: ticketsSold, total: ticketsTotal } = decodeTicketsAccount(
      program,
      ticketsInfo?.data ? Buffer.from(ticketsInfo.data) : undefined
    )
    let prizeAmount = 0n
    if (parsed.prizeMint !== DEFAULT_PUBKEY_BASE58 && parsed.prizeVaultCount > 0) {
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
  const program = getRaffleProgramReadOnly(connection)
  const accountNs = program.account as Record<
    string,
    { all: (filters: unknown[]) => Promise<Array<{ publicKey: PublicKey; account: unknown }>> }
  >
  const raffleAccount = accountNs.raffle ?? accountNs.Raffle
  if (!raffleAccount) throw new Error('Raffle account not found in program')
  const accounts = await raffleAccount.all([])
  return accounts.map(({ publicKey, account }) => {
    const a = pickRecord(account)
    const name = String(a.name ?? '')
    const state = raffleStateFromAnchor(a.state)
    return {
      publicKey: publicKey.toBase58(),
      name,
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
