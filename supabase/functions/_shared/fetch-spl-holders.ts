/**
 * SPL token holders via getProgramAccounts with dataSlice (low memory).
 * Dynamic-imports web3 + spl-token so NFT-only cron batches do not load native bindings.
 */
const SPL_DATA_SIZE = 165
const OWNER_AMOUNT_SLICE_OFFSET = 32
const OWNER_AMOUNT_SLICE_LEN = 40

export async function fetchSplHolders(
  rpcUrl: string,
  mint: string,
): Promise<Array<{ wallet: string; amount: string }>> {
  const { Connection, PublicKey } = await import('npm:@solana/web3.js@1')
  const { TOKEN_PROGRAM_ID } = await import('npm:@solana/spl-token@0.4')
  const connection = new Connection(rpcUrl, 'confirmed')
  const mintPk = new PublicKey(mint)
  const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    commitment: 'confirmed',
    dataSlice: { offset: OWNER_AMOUNT_SLICE_OFFSET, length: OWNER_AMOUNT_SLICE_LEN },
    filters: [
      { dataSize: SPL_DATA_SIZE },
      { memcmp: { offset: 0, bytes: mintPk.toBase58() } },
    ],
  })
  const byWallet = new Map<string, bigint>()
  for (const { account } of accounts) {
    const data = account.data as Uint8Array
    if (data.length < OWNER_AMOUNT_SLICE_LEN) continue
    const owner = new PublicKey(data.slice(0, 32)).toBase58()
    const view = new DataView(data.buffer, data.byteOffset)
    const amount = view.getBigUint64(32, true)
    if (amount > 0n) byWallet.set(owner, (byWallet.get(owner) ?? 0n) + amount)
  }
  return [...byWallet.entries()].map(([wallet, amount]) => ({ wallet, amount: String(amount) }))
}
