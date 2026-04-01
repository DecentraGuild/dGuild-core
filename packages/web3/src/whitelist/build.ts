import { PublicKey, Transaction, type Connection } from '@solana/web3.js'
import { getWhitelistProgram } from './provider.js'
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

  const program = getWhitelistProgram(connection, wallet)
  const ix = await program.methods
    .initialize(name)
    .accountsPartial({
      signer: authorityPubkey,
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

  const program = getWhitelistProgram(connection, wallet)
  const ix = await program.methods
    .addToWhitelist(accountToAddPubkey)
    .accountsPartial({
      whitelist: whitelistPubkey,
      authority: authorityPubkey,
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

  const program = getWhitelistProgram(connection, wallet)
  const ix = await program.methods
    .removeFromWhitelist(accountToDeletePubkey)
    .accountsPartial({
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

  const program = getWhitelistProgram(connection, wallet)
  const ix = await program.methods
    .deleteWhitelist(name)
    .accountsPartial({
      authority: authorityPubkey,
    })
    .instruction()

  return new Transaction().add(ix)
}
