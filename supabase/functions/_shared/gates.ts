import { Connection, PublicKey } from 'npm:@solana/web3.js@1'

export const WHITELIST_PROGRAM_ID =
  Deno.env.get('WHITELIST_PROGRAM_ID') ?? 'WLSTEvb5PEG1HN6M5HAomdWQ6NyR7zFPwSVbzVJKHDZ'

export interface GateEntry {
  wallet: string
}

export async function fetchGateEntries(
  connection: Connection,
  listAddress: string,
): Promise<GateEntry[]> {
  try {
    const programId = new PublicKey(WHITELIST_PROGRAM_ID)
    const listPk = new PublicKey(listAddress)

    const accounts = await connection.getProgramAccounts(programId, {
      filters: [{ memcmp: { offset: 8, bytes: listPk.toBase58() } }],
    })

    const entries: GateEntry[] = []
    for (const { account } of accounts) {
      try {
        const data = account.data as Uint8Array
        if (data.length >= 72) {
          const wallet = new PublicKey(data.slice(40, 72)).toBase58()
          entries.push({ wallet })
        }
      } catch {
        // skip malformed accounts
      }
    }
    return entries
  } catch {
    return []
  }
}

export async function isWalletOnList(
  connection: Connection,
  listAddress: string,
  wallet: string,
): Promise<boolean> {
  const entries = await fetchGateEntries(connection, listAddress)
  return entries.some((e) => e.wallet === wallet)
}
