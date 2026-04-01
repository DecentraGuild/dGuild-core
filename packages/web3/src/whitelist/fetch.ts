import { PublicKey, type Connection } from '@solana/web3.js'
import { getWhitelistProgramReadOnly } from './provider.js'
import { resolveWhitelistEntryPubkey } from './pda.js'

function toPublicKey(v: string | PublicKey): PublicKey {
  return typeof v === 'string' ? new PublicKey(v) : v
}

type WhitelistProgramAccountNs = {
  whitelist: {
    fetch: (a: PublicKey) => Promise<unknown>
    all: (filters?: unknown[]) => Promise<Array<{ publicKey: PublicKey; account: unknown }>>
  }
  whitelistEntry: {
    fetch: (a: PublicKey) => Promise<unknown>
    all: (filters?: unknown[]) => Promise<Array<{ publicKey: PublicKey; account: unknown }>>
  }
}

function whitelistAccounts(program: ReturnType<typeof getWhitelistProgramReadOnly>): WhitelistProgramAccountNs {
  return program.account as unknown as WhitelistProgramAccountNs
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
    const account = await whitelistAccounts(program).whitelist.fetch(pubkey)
    const a = account as {
      authority: PublicKey
      name: string
      hasChilds: boolean
      accessCount: number
    }
    return {
      publicKey: pubkey,
      account: {
        authority: a.authority,
        name: a.name,
        hasChilds: a.hasChilds,
        accessCount: a.accessCount,
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
  const accounts = await whitelistAccounts(program).whitelist.all([
    { memcmp: { offset: 8, bytes: authorityPubkey.toBase58() } },
  ])
  return accounts.map(({ publicKey, account }: { publicKey: PublicKey; account: unknown }) => {
    const a = account as {
      authority: PublicKey
      name: string
      hasChilds: boolean
      accessCount: number
    }
    return {
      publicKey,
      account: { authority: a.authority, name: a.name, hasChilds: a.hasChilds, accessCount: a.accessCount },
    }
  })
}

export async function fetchAllWhitelists(connection: Connection): Promise<WhitelistWithAddress[]> {
  const program = getWhitelistProgramReadOnly(connection)
  const accounts = await whitelistAccounts(program).whitelist.all([])
  return accounts.map(({ publicKey, account }: { publicKey: PublicKey; account: unknown }) => {
    const a = account as {
      authority: PublicKey
      name: string
      hasChilds: boolean
      accessCount: number
    }
    return {
      publicKey,
      account: { authority: a.authority, name: a.name, hasChilds: a.hasChilds, accessCount: a.accessCount },
    }
  })
}

export async function fetchWhitelistEntries(
  connection: Connection,
  whitelistAddress: string | PublicKey
): Promise<WhitelistEntryWithAddress[]> {
  const program = getWhitelistProgramReadOnly(connection)
  const whitelistPubkey = toPublicKey(whitelistAddress)
  const accounts = await whitelistAccounts(program).whitelistEntry.all([
    { memcmp: { offset: 8, bytes: whitelistPubkey.toBase58() } },
  ])
  return accounts.map(({ publicKey, account }: { publicKey: PublicKey; account: unknown }) => {
    const a = account as { parent: PublicKey; whitelisted: PublicKey }
    return { publicKey, account: { parent: a.parent, whitelisted: a.whitelisted } }
  })
}

export async function isWalletOnWhitelist(
  connection: Connection,
  wallet: string | PublicKey,
  whitelistAddress: string | PublicKey
): Promise<boolean> {
  const walletPubkey = toPublicKey(wallet)
  const whitelistPubkey = toPublicKey(whitelistAddress)
  const program = getWhitelistProgramReadOnly(connection)
  const entryPda = await resolveWhitelistEntryPubkey(program, walletPubkey, whitelistPubkey)
  try {
    await whitelistAccounts(program).whitelistEntry.fetch(entryPda)
    return true
  } catch {
    return false
  }
}
