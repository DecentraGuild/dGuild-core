import { PublicKey } from '@solana/web3.js'
import { RAFFLE_PROGRAM_ID } from '@decentraguild/contracts'

/**
 * Derive the raffle account PDA.
 * Seeds match packaged IDL `initialize` / on-chain: ["raffle", name utf-8, seed as 8-byte u64 LE].
 * Anchor resolves this when building instructions; this helper must use the same seeds so DB/UI
 * addresses match the account that was actually created.
 */
export function deriveRafflePda(
  name: string,
  seed: Uint8Array | Buffer,
  programId: PublicKey | string = RAFFLE_PROGRAM_ID
): PublicKey {
  const progId = typeof programId === 'string' ? new PublicKey(programId) : programId
  const seedBuf = Buffer.isBuffer(seed) ? Buffer.from(seed) : Buffer.from(seed)
  if (seedBuf.length !== 8) {
    throw new Error('Raffle seed must be exactly 8 bytes (u64 LE)')
  }
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('raffle', 'utf8'), Buffer.from(name, 'utf8'), seedBuf],
    progId
  )
  return pda
}

/**
 * Derive the tickets account PDA for a raffle.
 * Seeds: ["tickets", raffle] per reference program.
 */
export function deriveTicketsPda(
  raffle: PublicKey,
  programId: PublicKey | string = RAFFLE_PROGRAM_ID
): PublicKey {
  const progId = typeof programId === 'string' ? new PublicKey(programId) : programId
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('tickets', 'utf8'), raffle.toBuffer()],
    progId
  )
  return pda
}

/**
 * Derive the ticket vault PDA for a raffle (holds ticket-mint tokens from buyers).
 * Seeds: ["vaultTickets", raffle] per reference program.
 */
export function deriveTicketVaultPda(
  raffle: PublicKey,
  programId: PublicKey | string = RAFFLE_PROGRAM_ID
): PublicKey {
  const progId = typeof programId === 'string' ? new PublicKey(programId) : programId
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vaultTickets', 'utf8'), raffle.toBuffer()],
    progId
  )
  return pda
}

/** Legacy entrant PDA from buys that used PDA as `entrant`; still used to match on-chain `winner` to a wallet. */
export function deriveEntrantPda(
  raffle: PublicKey,
  signer: PublicKey,
  programId: PublicKey | string = RAFFLE_PROGRAM_ID
): PublicKey {
  const progId = typeof programId === 'string' ? new PublicKey(programId) : programId
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('entrant', 'utf8'), raffle.toBuffer(), signer.toBuffer()],
    progId
  )
  return pda
}

/**
 * Derive the prize vault PDA for a raffle.
 * Seeds: ["vaultPrize", raffle] per DDD_live raffleConfig.
 */
export function derivePrizeVaultPda(
  raffle: PublicKey,
  programId: PublicKey | string = RAFFLE_PROGRAM_ID
): PublicKey {
  const progId = typeof programId === 'string' ? new PublicKey(programId) : programId
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vaultPrize', 'utf8'), raffle.toBuffer()],
    progId
  )
  return pda
}
