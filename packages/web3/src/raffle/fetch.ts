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

/** Map Anchor enum object (e.g. `{ running: {} }`) to our lowercase state union. */
function raffleStateFromAnchor(state: unknown): RaffleState {
  if (!state || typeof state !== 'object') return 'created'
  const key = Object.keys(state as Record<string, unknown>)[0]
  if (!key) return 'created'
  const norm = key.toLowerCase()
  if ((STATE_NAMES as readonly string[]).includes(norm)) return norm as RaffleState
  return 'created'
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

/** Decode on-chain Raffle account bytes using the packaged IDL (Anchor account coder). */
function decodeRaffleAccount(program: Program, data: Buffer): {
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

    return {
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
    return null
  }
}

function decodeTicketsAccount(program: Program, data: Buffer | undefined): { sold: number; total: number } {
  if (!data?.length) return { sold: 0, total: 0 }
  try {
    const raw = program.coder.accounts.decode('Tickets', Buffer.from(data)) as unknown
    const t = pickRecord(raw)
    return {
      sold: Number(t.sold ?? 0),
      total: Number(t.total ?? 0),
    }
  } catch {
    return { sold: 0, total: 0 }
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
