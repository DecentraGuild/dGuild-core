import {
  PublicKey,
  SystemProgram,
  Transaction,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
} from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import BN from 'bn.js'
import { getRaffleProgram } from './provider.js'
import {
  deriveRafflePda,
  deriveTicketsPda,
  deriveTicketVaultPda,
  derivePrizeVaultPda,
} from './accounts.js'
import { deriveWhitelistEntryPda } from '../escrow/accounts.js'
import { RAFFLE_FEE_ACCOUNT, RAFFLE_PROGRAM_ID, WHITELIST_PROGRAM_ID } from '@decentraguild/contracts'
import type { Wallet } from '../escrow/types.js'

function toPublicKey(v: string | PublicKey): PublicKey {
  return typeof v === 'string' ? new PublicKey(v) : v
}

/** Convert 8-byte buffer (LE) to BN for u64. */
function seedToBN(seed: Uint8Array | Buffer): BN {
  const buf = Buffer.isBuffer(seed) ? Buffer.from(seed) : Buffer.from(seed)
  return new BN(buf.readBigUInt64LE(0).toString())
}

export interface BuildInitializeRaffleParams {
  name: string
  description: string
  seed: Uint8Array | Buffer
  ticketMint: PublicKey | string
  ticketPrice: bigint | string
  ticketDecimals: number
  maxTickets: number
  useWhitelist: boolean
  whitelist?: PublicKey | string | null
  whitelistProgram?: PublicKey | string | null
  connection: import('@solana/web3.js').Connection
  wallet: Wallet
}

export async function buildInitializeRaffleTransaction(
  params: BuildInitializeRaffleParams
): Promise<Transaction> {
  const {
    name,
    description,
    seed,
    ticketMint,
    ticketPrice,
    maxTickets,
    useWhitelist,
    whitelist,
    connection,
    wallet,
  } = params
  const creator = wallet.publicKey
  const ticketMintPubkey = toPublicKey(ticketMint)
  const seedBuf = Buffer.isBuffer(seed) ? Buffer.from(seed) : Buffer.from(seed)
  const seedBN = seedToBN(seedBuf)

  const rafflePda = deriveRafflePda(name, seedBuf)
  const ticketsPda = deriveTicketsPda(rafflePda)
  const ticketsAtaPda = deriveTicketVaultPda(rafflePda)

  const program = getRaffleProgram(connection, wallet)

  const ticketPriceBN = typeof ticketPrice === 'bigint' ? new BN(ticketPrice.toString()) : new BN(ticketPrice)

  const accounts: Record<string, PublicKey> = {
    creator,
    raffle: rafflePda,
    tickets: ticketsPda,
    ticketsAta: ticketsAtaPda,
    ticketsMint: ticketMintPubkey,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    rent: SYSVAR_RENT_PUBKEY,
  }

  if (useWhitelist && whitelist) {
    accounts.whitelist = toPublicKey(whitelist)
  } else {
    accounts.whitelist = program.programId
  }

  const ix = await program.methods
    .initialize(name, description, ticketPriceBN, maxTickets, seedBN)
    .accounts(accounts)
    .instruction()

  return new Transaction().add(ix)
}

export interface BuildPrepareRaffleParams {
  rafflePubkey: PublicKey | string
  prizeMint: PublicKey | string
  amount: bigint | string
  imageUrl?: string
  connection: import('@solana/web3.js').Connection
  wallet: Wallet
}

export async function buildPrepareRaffleTransaction(
  params: BuildPrepareRaffleParams
): Promise<Transaction> {
  const { rafflePubkey, prizeMint, amount, imageUrl = '', connection, wallet } = params
  const creator = wallet.publicKey
  const rafflePk = toPublicKey(rafflePubkey)
  const prizeMintPk = toPublicKey(prizeMint)
  const fromAta = getAssociatedTokenAddressSync(prizeMintPk, creator)
  const prizeVaultPda = derivePrizeVaultPda(rafflePk)
  const amountBN = typeof amount === 'bigint' ? new BN(amount.toString()) : new BN(amount)
  const program = getRaffleProgram(connection, wallet)
  const ix = await program.methods
    .prepare(amountBN, imageUrl)
    .accounts({
      creator,
      raffle: rafflePk,
      from: fromAta,
      prizeVault: prizeVaultPda,
      prizeMint: prizeMintPk,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
      feeAccount: new PublicKey(RAFFLE_FEE_ACCOUNT),
    })
    .instruction()
  return new Transaction().add(ix)
}

export async function buildEnableRaffleTransaction(params: {
  rafflePubkey: PublicKey | string
  connection: import('@solana/web3.js').Connection
  wallet: Wallet
}): Promise<Transaction> {
  const { rafflePubkey, connection, wallet } = params
  const creator = wallet.publicKey
  const rafflePk = toPublicKey(rafflePubkey)
  const program = getRaffleProgram(connection, wallet)
  const ix = await program.methods
    .enable()
    .accounts({
      creator,
      raffle: rafflePk,
      systemProgram: SystemProgram.programId,
    })
    .instruction()
  return new Transaction().add(ix)
}

export async function buildDisableRaffleTransaction(params: {
  rafflePubkey: PublicKey | string
  connection: import('@solana/web3.js').Connection
  wallet: Wallet
}): Promise<Transaction> {
  const { rafflePubkey, connection, wallet } = params
  const creator = wallet.publicKey
  const rafflePk = toPublicKey(rafflePubkey)
  const program = getRaffleProgram(connection, wallet)
  const ix = await program.methods
    .disable()
    .accounts({
      creator,
      raffle: rafflePk,
      systemProgram: SystemProgram.programId,
    })
    .instruction()
  return new Transaction().add(ix)
}

export async function buildEditRaffleTransaction(params: {
  rafflePubkey: PublicKey | string
  name: string
  description: string
  url: string
  connection: import('@solana/web3.js').Connection
  wallet: Wallet
}): Promise<Transaction> {
  const { rafflePubkey, name, description, url, connection, wallet } = params
  const creator = wallet.publicKey
  const rafflePk = toPublicKey(rafflePubkey)
  const program = getRaffleProgram(connection, wallet)
  const ix = await program.methods
    .edit(name, description, url)
    .accounts({
      creator,
      raffle: rafflePk,
      systemProgram: SystemProgram.programId,
    })
    .instruction()
  return new Transaction().add(ix)
}

export async function buildRevealWinnersTransaction(params: {
  rafflePubkey: PublicKey | string
  connection: import('@solana/web3.js').Connection
  wallet: Wallet
}): Promise<Transaction> {
  const { rafflePubkey, connection, wallet } = params
  const rafflePk = toPublicKey(rafflePubkey)
  const ticketsPda = deriveTicketsPda(rafflePk)
  const program = getRaffleProgram(connection, wallet)
  const ix = await program.methods
    .revealWinners()
    .accounts({
      raffle: rafflePk,
      tickets: ticketsPda,
      recentBlockHashes: SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
    })
    .instruction()
  return new Transaction().add(ix)
}

export async function buildClaimPrizeTransaction(params: {
  rafflePubkey: PublicKey | string
  prizeMint: PublicKey | string
  winnerAta: PublicKey | string
  connection: import('@solana/web3.js').Connection
  wallet: Wallet
}): Promise<Transaction> {
  const { rafflePubkey, prizeMint, winnerAta, connection, wallet } = params
  const rafflePk = toPublicKey(rafflePubkey)
  const prizeMintPk = toPublicKey(prizeMint)
  const toAta = toPublicKey(winnerAta)
  const ticketsPda = deriveTicketsPda(rafflePk)
  const prizeVaultPda = derivePrizeVaultPda(rafflePk)
  const program = getRaffleProgram(connection, wallet)
  const ix = await program.methods
    .claimPrize()
    .accounts({
      raffle: rafflePk,
      tickets: ticketsPda,
      prizeVault: prizeVaultPda,
      prizeMint: prizeMintPk,
      to: toAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction()
  return new Transaction().add(ix)
}

export async function buildClaimTicketsTransaction(params: {
  rafflePubkey: PublicKey | string
  ticketMint: PublicKey | string
  creatorAta: PublicKey | string
  connection: import('@solana/web3.js').Connection
  wallet: Wallet
}): Promise<Transaction> {
  const { rafflePubkey, ticketMint, creatorAta, connection, wallet } = params
  const creator = wallet.publicKey
  const rafflePk = toPublicKey(rafflePubkey)
  const ticketMintPk = toPublicKey(ticketMint)
  const ticketsVaultPda = deriveTicketVaultPda(rafflePk)
  const toAta = toPublicKey(creatorAta)
  const program = getRaffleProgram(connection, wallet)
  const ix = await program.methods
    .claimTickets()
    .accounts({
      creator,
      raffle: rafflePk,
      ticketsAta: ticketsVaultPda,
      ticketsMint: ticketMintPk,
      to: toAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction()
  return new Transaction().add(ix)
}

export interface BuildBuyTicketsParams {
  rafflePubkey: PublicKey | string
  ticketAmount: number
  ticketMint: PublicKey | string
  useWhitelist: boolean
  whitelist: string | null
  connection: import('@solana/web3.js').Connection
  wallet: Wallet
}

/** Buy tickets via Anchor + packaged IDL (same account wiring as `_integrate/DDD_live` `raffleService.buyTickets`). */
export async function buildBuyTicketsTransaction(params: BuildBuyTicketsParams): Promise<Transaction> {
  const { rafflePubkey, ticketAmount, ticketMint, useWhitelist, whitelist, connection, wallet } = params
  const buyer = wallet.publicKey
  const rafflePk = toPublicKey(rafflePubkey)
  const ticketMintPk = toPublicKey(ticketMint)
  const raffleProgramId = new PublicKey(RAFFLE_PROGRAM_ID)
  const whitelistProgramPk = toPublicKey(WHITELIST_PROGRAM_ID)

  const ticketsPda = deriveTicketsPda(rafflePk)
  const ticketsAtaPda = deriveTicketVaultPda(rafflePk)
  const buyerAta = getAssociatedTokenAddressSync(ticketMintPk, buyer)

  const program = getRaffleProgram(connection, wallet)

  let whitelistPk = raffleProgramId
  let whitelistEntryPk = raffleProgramId
  if (useWhitelist) {
    if (!whitelist?.trim()) {
      throw new Error('This raffle requires a whitelist but no whitelist account is set on-chain')
    }
    whitelistPk = toPublicKey(whitelist)
    whitelistEntryPk = deriveWhitelistEntryPda(buyer, whitelistPk, WHITELIST_PROGRAM_ID)
  }

  const accounts = {
    signer: buyer,
    entrant: buyer,
    raffle: rafflePk,
    tickets: ticketsPda,
    ticketsAta: ticketsAtaPda,
    ticketsMint: ticketMintPk,
    from: buyerAta,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    whitelist: whitelistPk,
    whitelistEntry: whitelistEntryPk,
    whitelistProgram: whitelistProgramPk,
    feeAccount: new PublicKey(RAFFLE_FEE_ACCOUNT),
  }

  const ix = await program.methods
    .buyTickets(ticketAmount >>> 0)
    .accounts(accounts)
    .instruction()

  return new Transaction().add(ix)
}

export async function buildCloseRaffleTransaction(params: {
  rafflePubkey: PublicKey | string
  connection: import('@solana/web3.js').Connection
  wallet: Wallet
}): Promise<Transaction> {
  const { rafflePubkey, wallet, connection } = params
  const creator = wallet.publicKey
  const rafflePk = toPublicKey(rafflePubkey)
  const ticketsPda = deriveTicketsPda(rafflePk)
  const ticketsVaultPda = deriveTicketVaultPda(rafflePk)
  const prizeVaultPda = derivePrizeVaultPda(rafflePk)

  const prizeVaultInfo = await connection.getAccountInfo(prizeVaultPda, 'confirmed')
  const program = getRaffleProgram(connection, wallet)

  const baseAccounts = {
    creator,
    raffle: rafflePk,
    tickets: ticketsPda,
    ticketsVault: ticketsVaultPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  }
  const ix = prizeVaultInfo
    ? await program.methods
        .close()
        .accounts({ ...baseAccounts, prizeVault: prizeVaultPda })
        .instruction()
    : await program.methods.close().accounts(baseAccounts).instruction()

  return new Transaction().add(ix)
}
