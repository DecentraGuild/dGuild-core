import { PublicKey } from '@solana/web3.js'
import { RAFFLE_PROGRAM_ID } from '@decentraguild/contracts'

/**
 * Derive the raffle account PDA for program rafxXx… (deployed build).
 * On-chain seeds: ["raffle", seed u64 LE] only — raffle display name is stored in account data, not in seeds.
 * `name` is kept on the signature for call-site clarity; it does not affect the address.
 */
export function deriveRafflePda(
  _name: string,
  seed: Uint8Array | Buffer,
  programId: PublicKey | string = RAFFLE_PROGRAM_ID
): PublicKey {
  const progId = typeof programId === 'string' ? new PublicKey(programId) : programId
  const seedBuf = Buffer.isBuffer(seed) ? Buffer.from(seed) : Buffer.from(seed)
  if (seedBuf.length !== 8) {
    throw new Error('Raffle seed must be exactly 8 bytes (u64 LE)')
  }
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('raffle', 'utf8'), seedBuf], progId)
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
