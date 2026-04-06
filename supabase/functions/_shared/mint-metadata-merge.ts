import type { MintMetadataResult } from './mint-metadata.ts'

function pickStr(next: string | null | undefined, prev: unknown): string | null {
  if (next != null && String(next).trim() !== '') return next
  const p = prev
  if (typeof p === 'string' && p.trim() !== '') return p
  return null
}

function pickBool(next: boolean | null | undefined, prev: unknown): boolean | null {
  if (typeof next === 'boolean') return next
  if (typeof prev === 'boolean') return prev
  return null
}

export function mergeMintMetadataUpsertFromFetchResult(
  existing: Record<string, unknown> | null | undefined,
  mint: string,
  meta: MintMetadataResult,
  now: string,
): Record<string, unknown> {
  const ex = existing ?? {}
  const symbol = (meta as { symbol?: string }).symbol ?? null
  const traitIndex = meta.traitIndex != null ? meta.traitIndex : ex.trait_index ?? null
  return {
    mint,
    name: pickStr(meta.name, ex.name),
    symbol: pickStr(symbol, ex.symbol),
    image: pickStr(meta.image, ex.image),
    decimals: meta.decimals ?? ex.decimals ?? null,
    traits: ex.traits ?? null,
    trait_index: traitIndex,
    seller_fee_basis_points: meta.sellerFeeBasisPoints ?? ex.seller_fee_basis_points ?? null,
    update_authority: pickStr(meta.updateAuthority, ex.update_authority),
    uri: pickStr(meta.uri, ex.uri),
    primary_sale_happened: pickBool(meta.primarySaleHappened, ex.primary_sale_happened),
    is_mutable: pickBool(meta.isMutable, ex.is_mutable),
    edition_nonce: meta.editionNonce ?? ex.edition_nonce ?? null,
    token_standard: pickStr(meta.tokenStandard, ex.token_standard),
    updated_at: now,
  }
}
