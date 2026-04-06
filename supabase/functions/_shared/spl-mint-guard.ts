const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
/** Metaplex Core — collection and asset accounts are owned by this program, not SPL Token. */
export const MPL_CORE_PROGRAM_ID = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d'

export type SplMintTokenProgram = 'legacy' | 'token_2022'

export type OnChainSplMintState =
  | { ok: false }
  | { ok: true; decimals: number; tokenProgram: SplMintTokenProgram }

export async function getOnChainSplMintState(rpcUrl: string, address: string): Promise<OnChainSplMintState> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [address, { encoding: 'jsonParsed' }],
      }),
    })
    const json = (await res.json()) as { result?: { value: Record<string, unknown> | null } }
    const value = json.result?.value
    if (!value) return { ok: false }
    const owner = value.owner as string | undefined
    if (owner !== TOKEN_PROGRAM_ID && owner !== TOKEN_2022_PROGRAM_ID) return { ok: false }
    const data = value.data as Record<string, unknown> | undefined
    const parsed = data?.parsed as Record<string, unknown> | undefined
    if (parsed?.type !== 'mint') return { ok: false }
    const info = parsed.info as Record<string, unknown> | undefined
    const decimals = typeof info?.decimals === 'number' ? info.decimals : null
    if (decimals === null || decimals < 0 || decimals > 9) return { ok: false }
    const tokenProgram: SplMintTokenProgram = owner === TOKEN_2022_PROGRAM_ID ? 'token_2022' : 'legacy'
    return { ok: true, decimals, tokenProgram }
  } catch {
    return { ok: false }
  }
}

export async function isMplCoreAccount(rpcUrl: string, address: string): Promise<boolean> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [address, { encoding: 'jsonParsed' }],
      }),
    })
    const json = (await res.json()) as { result?: { value: { owner?: string } | null } }
    const owner = json.result?.value?.owner
    return owner === MPL_CORE_PROGRAM_ID
  } catch {
    return false
  }
}

export function isDasCompressedNft(asset: Record<string, unknown>): boolean {
  const comp = asset.compression as Record<string, unknown> | undefined
  if (comp && comp.compressed === true) return true
  const iface = String(asset.interface ?? '')
  if (/compressed/i.test(iface)) return true
  return false
}

export function classifyDasAssetKind(asset: Record<string, unknown>): 'SPL' | 'NFT' | null {
  const iface = String(asset.interface ?? '')
  if (/MplCore/i.test(iface)) return 'NFT'
  const tokenInfo = asset.token_info as Record<string, unknown> | undefined
  const decimals = typeof tokenInfo?.decimals === 'number' ? tokenInfo.decimals : null
  const content = asset.content as Record<string, unknown> | undefined
  const meta = (content?.metadata as Record<string, unknown>) ?? {}
  const tokenStandard = String(meta?.token_standard ?? '').toLowerCase()

  if (/FungibleToken/i.test(iface)) return 'SPL'
  if (/NonFungible|ProgrammableNonFungible|NonFungibleEdition|V1_NFT/i.test(iface)) return 'NFT'
  if (/FungibleAsset/i.test(iface)) return 'SPL'
  if (tokenStandard === 'fungible') return 'SPL'
  if (tokenStandard === 'fungibleasset') return 'SPL'
  if (tokenStandard.includes('non-fungible') || tokenStandard === 'nonfungible') return 'NFT'
  if (decimals != null && decimals > 0) return 'SPL'
  if (decimals === 0) {
    if (/fungible/i.test(iface)) return 'SPL'
    return 'NFT'
  }
  return null
}
