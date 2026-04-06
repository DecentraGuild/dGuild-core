/**
 * Resumable DAS getAssetsByGroup → collection_members rows + per-item metadata fields.
 */

import { extractImageFromDasAsset } from './mint-metadata.ts'

export type CollectionMemberRow = {
  collection_mint: string
  mint: string
  name: string | null
  image: string | null
  traits: unknown
  owner: string | null
}

export type PartialTraitState = {
  trait_keys: string[]
  trait_options: Record<string, string[]>
}

export function emptyPartialTraitState(): PartialTraitState {
  return { trait_keys: [], trait_options: {} }
}

export function parsePartialTraitState(raw: unknown): PartialTraitState {
  if (!raw || typeof raw !== 'object') return emptyPartialTraitState()
  const o = raw as Record<string, unknown>
  const keys = Array.isArray(o.trait_keys) ? (o.trait_keys as string[]).filter((k) => typeof k === 'string') : []
  const optsRaw = o.trait_options
  const trait_options: Record<string, string[]> = {}
  if (optsRaw && typeof optsRaw === 'object') {
    for (const [k, v] of Object.entries(optsRaw as Record<string, unknown>)) {
      if (Array.isArray(v)) trait_options[k] = v.filter((x) => typeof x === 'string') as string[]
    }
  }
  return { trait_keys: keys, trait_options }
}

export function partialTraitStateToTraitIndex(p: PartialTraitState): Record<string, unknown> {
  return {
    trait_keys: [...p.trait_keys],
    trait_options: { ...p.trait_options },
  }
}

export function mergeAttributesIntoPartialTraitState(
  partial: PartialTraitState,
  attributesList: Array<Array<{ trait_type?: string; value?: string }> | undefined>,
): void {
  const keySet = new Set(partial.trait_keys)
  const optSets: Record<string, Set<string>> = {}
  for (const [k, arr] of Object.entries(partial.trait_options)) {
    optSets[k] = new Set(arr)
  }
  for (const attrs of attributesList) {
    if (!attrs) continue
    for (const a of attrs) {
      if (!a.trait_type) continue
      keySet.add(a.trait_type)
      if (!optSets[a.trait_type]) optSets[a.trait_type] = new Set()
      if (a.value) optSets[a.trait_type].add(String(a.value))
    }
  }
  partial.trait_keys = [...keySet].sort()
  partial.trait_options = Object.fromEntries(
    [...Object.entries(optSets)].map(([k, s]) => [k, [...s].sort()]),
  )
}

export function dasItemToCollectionMember(collectionMint: string, item: Record<string, unknown>): CollectionMemberRow {
  const id = item.id as string
  const content = item.content as Record<string, unknown> | undefined
  const metadata = content?.metadata as Record<string, unknown> | undefined
  const ownership = item.ownership as { owner?: string } | undefined
  const attrs = metadata?.attributes as Array<{ trait_type?: string; value?: string }> | undefined
  const traits = Array.isArray(attrs) ? attrs : []
  const nftName = metadata?.name as string ?? null
  const nftImage = extractImageFromDasAsset(item) ?? (content?.links as Record<string, unknown> | undefined)?.image as string ?? null
  return {
    collection_mint: collectionMint,
    mint: id,
    name: nftName,
    image: typeof nftImage === 'string' ? nftImage : null,
    traits,
    owner: ownership?.owner ?? null,
  }
}

export async function fetchCollectionGroupPage(
  rpcUrl: string,
  collectionMint: string,
  page: number,
): Promise<{ ok: boolean; items: Record<string, unknown>[] }> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getAssetsByGroup',
      params: { groupKey: 'collection', groupValue: collectionMint, limit: 1000, page },
    }),
  })
  if (!res.ok) return { ok: false, items: [] }
  const data = await res.json() as { result?: { items?: Array<Record<string, unknown>> } }
  return { ok: true, items: data.result?.items ?? [] }
}
