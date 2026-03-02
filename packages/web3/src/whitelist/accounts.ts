import { PublicKey } from '@solana/web3.js'
import { WHITELIST_PROGRAM_ID } from '@decentraguild/contracts'

/**
 * Derive the whitelist account PDA for the given authority and list name.
 * Seeds: [authority.toBuffer(), Buffer.from(name, 'utf8')]
 * Verified against _integrate/dapp.skullnbones.xyz-master CreateWhitelist.vue
 */
export function deriveWhitelistPda(
  authority: PublicKey,
  name: string,
  programId: PublicKey | string = WHITELIST_PROGRAM_ID
): PublicKey {
  const progId =
    typeof programId === 'string' ? new PublicKey(programId) : programId
  const [pda] = PublicKey.findProgramAddressSync(
    [authority.toBuffer(), Buffer.from(name, 'utf8')],
    progId
  )
  return pda
}

export { deriveWhitelistEntryPda } from '../escrow/accounts.js'
