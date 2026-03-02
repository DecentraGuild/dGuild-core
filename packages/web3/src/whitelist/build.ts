import {
  PublicKey,
  SystemProgram,
  Transaction,
  type Connection,
} from '@solana/web3.js'
import { getWhitelistProgram } from './provider.js'
import { deriveWhitelistPda, deriveWhitelistEntryPda } from './accounts.js'
import type { Wallet } from '../escrow/types.js'

function toPublicKey(v: string | PublicKey): PublicKey {
  return typeof v === 'string' ? new PublicKey(v) : v
}

export interface BuildInitializeWhitelistParams {
  name: string
  authority: PublicKey | string
  connection: Connection
  wallet: Wallet
}

export async function buildInitializeWhitelistTransaction(
  params: BuildInitializeWhitelistParams
): Promise<Transaction> {
  const { name, authority, connection, wallet } = params
  const authorityPubkey = toPublicKey(authority)
  const whitelistPda = deriveWhitelistPda(authorityPubkey, name)

  const program = getWhitelistProgram(connection, wallet)
  const ix = await program.methods
    .initialize(name)
    .accounts({
      whitelist: whitelistPda,
      signer: authorityPubkey,
      systemProgram: SystemProgram.programId,
    })
    .instruction()

  const tx = new Transaction().add(ix)
  return tx
}

export interface BuildAddToWhitelistParams {
  whitelist: PublicKey | string
  accountToAdd: PublicKey | string
  authority: PublicKey | string
  connection: Connection
  wallet: Wallet
}

export async function buildAddToWhitelistTransaction(
  params: BuildAddToWhitelistParams
): Promise<Transaction> {
  const { whitelist, accountToAdd, authority, connection, wallet } = params
  const whitelistPubkey = toPublicKey(whitelist)
  const accountToAddPubkey = toPublicKey(accountToAdd)
  const authorityPubkey = toPublicKey(authority)

  const entryPda = deriveWhitelistEntryPda(accountToAddPubkey, whitelistPubkey)

  const program = getWhitelistProgram(connection, wallet)
  const ix = await program.methods
    .addToWhitelist(accountToAddPubkey)
    .accounts({
      entry: entryPda,
      whitelist: whitelistPubkey,
      authority: authorityPubkey,
      systemProgram: SystemProgram.programId,
    })
    .instruction()

  return new Transaction().add(ix)
}

export interface BuildRemoveFromWhitelistParams {
  whitelist: PublicKey | string
  accountToDelete: PublicKey | string
  authority: PublicKey | string
  connection: Connection
  wallet: Wallet
}

export async function buildRemoveFromWhitelistTransaction(
  params: BuildRemoveFromWhitelistParams
): Promise<Transaction> {
  const { whitelist, accountToDelete, authority, connection, wallet } = params
  const whitelistPubkey = toPublicKey(whitelist)
  const accountToDeletePubkey = toPublicKey(accountToDelete)
  const authorityPubkey = toPublicKey(authority)

  const entryPda = deriveWhitelistEntryPda(accountToDeletePubkey, whitelistPubkey)

  const program = getWhitelistProgram(connection, wallet)
  const ix = await program.methods
    .removeFromWhitelist(accountToDeletePubkey)
    .accounts({
      entry: entryPda,
      whitelist: whitelistPubkey,
      authority: authorityPubkey,
    })
    .instruction()

  return new Transaction().add(ix)
}

export interface BuildDeleteWhitelistParams {
  name: string
  authority: PublicKey | string
  connection: Connection
  wallet: Wallet
}

export async function buildDeleteWhitelistTransaction(
  params: BuildDeleteWhitelistParams
): Promise<Transaction> {
  const { name, authority, connection, wallet } = params
  const authorityPubkey = toPublicKey(authority)
  const whitelistPda = deriveWhitelistPda(authorityPubkey, name)

  const program = getWhitelistProgram(connection, wallet)
  const ix = await program.methods
    .deleteWhitelist(name)
    .accounts({
      whitelist: whitelistPda,
      authority: authorityPubkey,
    })
    .instruction()

  return new Transaction().add(ix)
}
