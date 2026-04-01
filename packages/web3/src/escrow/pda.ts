import type { Program } from '@coral-xyz/anchor'
import BN from 'bn.js'
import { PublicKey } from '@solana/web3.js'

export interface ResolveEscrowPdasParams {
  maker: PublicKey
  seed: BN
  makerAta: PublicKey
  depositToken: PublicKey
  requestToken: PublicKey
  recipient: PublicKey
  fee: PublicKey
  whitelistProgram: PublicKey
  whitelist: PublicKey
  entry: PublicKey
}

/**
 * Resolves escrow / auth / vault PDAs using the same `initialize` instruction layout as the IDL
 * (dummy amounts; only maker + seed affect escrow PDA).
 */
export async function resolveEscrowPdasForSeed(
  program: Program,
  params: ResolveEscrowPdasParams
): Promise<{ escrow: PublicKey; auth: PublicKey; vault: PublicKey }> {
  const ix = await program.methods
    .initialize(
      params.seed,
      new BN(1),
      new BN(1),
      new BN(0),
      true,
      false,
      1
    )
    .accountsPartial({
      maker: params.maker,
      makerAta: params.makerAta,
      recipient: params.recipient,
      depositToken: params.depositToken,
      requestToken: params.requestToken,
      fee: params.fee,
      whitelistProgram: params.whitelistProgram,
      whitelist: params.whitelist,
      entry: params.entry,
    })
    .instruction()
  return {
    auth: ix.keys[5].pubkey,
    vault: ix.keys[6].pubkey,
    escrow: ix.keys[7].pubkey,
  }
}
