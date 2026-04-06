export type SplTokenProgramKind = 'legacy' | 'token_2022'

export function isMintSupportedByMarketplaceEscrow(params: {
  kind: 'SPL' | 'NFT'
  splTokenProgram?: SplTokenProgramKind | null
  isMplCore?: boolean | null
  isCompressedNft?: boolean | null
}): boolean {
  if (params.isMplCore === true) return false
  if (params.isCompressedNft === true) return false
  if (params.splTokenProgram === 'token_2022') return false
  return true
}
