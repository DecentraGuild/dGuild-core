import type { Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

/**
 * Whitelist list PDA from `initialize` (IDL-driven; matches on-chain seeds).
 */
export async function resolveWhitelistListPubkey(
  program: Program,
  authority: PublicKey,
  name: string
): Promise<PublicKey> {
  const ix = await program.methods
    .initialize(name)
    .accountsPartial({ signer: authority })
    .instruction()
  return ix.keys[0].pubkey
}

/**
 * Entry PDA for `add_to_whitelist` (IDL-driven). Authority is only a placeholder for resolution.
 */
export async function resolveWhitelistEntryPubkey(
  program: Program,
  whitelisted: PublicKey,
  whitelist: PublicKey
): Promise<PublicKey> {
  const ix = await program.methods
    .addToWhitelist(whitelisted)
    .accountsPartial({ whitelist, authority: whitelisted })
    .instruction()
  return ix.keys[0].pubkey
}
