import { PublicKey, type Connection } from '@solana/web3.js'
import { getWhitelistProgramReadOnly } from './provider.js'
import { deriveWhitelistEntryPda } from './accounts.js'
import { WHITELIST_PROGRAM_ID } from '@decentraguild/contracts'

function toPublicKey(v: string | PublicKey): PublicKey {
  return typeof v === 'string' ? new PublicKey(v) : v
}

export interface WhitelistAccount {
  authority: PublicKey
  name: string
  hasChilds: boolean
  accessCount: number
}

export interface WhitelistEntryAccount {
  parent: PublicKey
  whitelisted: PublicKey
}

export interface WhitelistWithAddress {
  publicKey: PublicKey
  account: WhitelistAccount
}

export interface WhitelistEntryWithAddress {
  publicKey: PublicKey
  account: WhitelistEntryAccount
}

export async function fetchWhitelist(
  connection: Connection,
  address: string | PublicKey
): Promise<WhitelistWithAddress | null> {
  const program = getWhitelistProgramReadOnly(connection)
  const pubkey = toPublicKey(address)
  try {
    const account = await program.account.whitelist.fetch(pubkey)
    return {
      publicKey: pubkey,
      account: {
        authority: account.authority as PublicKey,
        name: account.name as string,
        hasChilds: account.hasChilds as boolean,
        accessCount: account.accessCount as number,
      },
    }
  } catch {
    return null
  }
}

export async function fetchAllWhitelistsByAuthority(
  connection: Connection,
  authority: string | PublicKey
): Promise<WhitelistWithAddress[]> {
  const program = getWhitelistProgramReadOnly(connection)
  const authorityPubkey = toPublicKey(authority)
  const accounts = await program.account.whitelist.all([
    { memcmp: { offset: 8, bytes: authorityPubkey.toBase58() } },
  ])
  return accounts.map(({ publicKey, account }) => ({
    publicKey,
    account: {
      authority: account.authority as PublicKey,
      name: account.name as string,
      hasChilds: account.hasChilds as boolean,
      accessCount: account.accessCount as number,
    },
  }))
}

export async function fetchWhitelistEntries(
  connection: Connection,
  whitelistAddress: string | PublicKey
): Promise<WhitelistEntryWithAddress[]> {
  const program = getWhitelistProgramReadOnly(connection)
  const whitelistPubkey = toPublicKey(whitelistAddress)
  const accounts = await program.account.whitelistEntry.all([
    { memcmp: { offset: 8, bytes: whitelistPubkey.toBase58() } },
  ])
  return accounts.map(({ publicKey, account }) => ({
    publicKey,
    account: {
      parent: account.parent as PublicKey,
      whitelisted: account.whitelisted as PublicKey,
    },
  }))
}

export async function isWalletOnWhitelist(
  connection: Connection,
  wallet: string | PublicKey,
  whitelistAddress: string | PublicKey
): Promise<boolean> {
  const walletPubkey = toPublicKey(wallet)
  const whitelistPubkey = toPublicKey(whitelistAddress)
  const entryPda = deriveWhitelistEntryPda(
    walletPubkey,
    whitelistPubkey,
    WHITELIST_PROGRAM_ID
  )
  try {
    const program = getWhitelistProgramReadOnly(connection)
    await program.account.whitelistEntry.fetch(entryPda)
    return true
  } catch {
    return false
  }
}
