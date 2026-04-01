import { Connection, PublicKey } from '@solana/web3.js'
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { RAFFLE_PROGRAM_ID, RAFFLE_IDL } from '@decentraguild/contracts'
import type { Wallet } from '../escrow/types.js'

/** Anchor 0.29 coder expects `publicKey`; Anchor 0.30 IDL exports `pubkey` in account type defs. */
function normalizeIdlPubkeyTypesForAnchor029(idl: Record<string, unknown>): void {
  const walk = (node: unknown): void => {
    if (node === null || node === undefined) return
    if (Array.isArray(node)) {
      for (const x of node) walk(x)
      return
    }
    if (typeof node !== 'object') return
    const o = node as Record<string, unknown>
    if (o.type === 'pubkey') o.type = 'publicKey'
    for (const v of Object.values(o)) walk(v)
  }
  walk(idl)
}

function getIdlWithAddress(): Record<string, unknown> {
  const idl = JSON.parse(JSON.stringify(RAFFLE_IDL)) as Record<string, unknown>
  idl.address = RAFFLE_PROGRAM_ID
  normalizeIdlPubkeyTypesForAnchor029(idl)
  if (idl.types && Array.isArray(idl.types) && idl.types.length === 0) {
    delete idl.types
  }
  return idl
}

export function getRaffleProgram(connection: Connection, wallet: Wallet): Program {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  })
  const programId = new PublicKey(RAFFLE_PROGRAM_ID)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Program(getIdlWithAddress() as any, programId, provider)
}

export function getRaffleProgramReadOnly(connection: Connection): Program {
  const dummyWallet: Wallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  }
  const provider = new AnchorProvider(connection, dummyWallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  })
  const programId = new PublicKey(RAFFLE_PROGRAM_ID)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Program(getIdlWithAddress() as any, programId, provider)
}
