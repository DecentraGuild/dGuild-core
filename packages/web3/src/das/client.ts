/**
 * DAS (Digital Asset Standard) RPC client.
 * Uses HELIUS_RPC or HELIUS_RPC_URL; throws if not configured.
 */

import type { DasAsset } from './types.js'

const DAS_METHODS = {
  getAsset: 'getAsset',
  getAssetsByGroup: 'getAssetsByGroup',
  searchAssets: 'searchAssets',
} as const

export function getDasRpcUrl(): string {
  const url = process.env.HELIUS_RPC ?? process.env.HELIUS_RPC_URL
  if (!url?.trim()) {
    throw new Error('HELIUS_RPC or HELIUS_RPC_URL required for DAS')
  }
  return url.replace(/\/$/, '')
}

export async function dasRequest<T>(
  method: string,
  params: Record<string, unknown>
): Promise<T | null> {
  const rpcUrl = getDasRpcUrl()
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method,
      params,
    }),
  })
  if (!res.ok) return null
  const json = (await res.json()) as { result?: T; error?: { message: string } }
  if (json.error) return null
  return json.result ?? null
}

export async function fetchAsset(mint: string): Promise<DasAsset | null> {
  return dasRequest<DasAsset>(DAS_METHODS.getAsset, { id: mint })
}

export async function fetchAssetsByGroup(
  groupKey: string,
  groupValue: string,
  page = 1,
  limit = 1000
): Promise<{ items?: DasAsset[]; total?: number } | null> {
  return dasRequest<{ items?: DasAsset[]; total?: number }>(
    DAS_METHODS.getAssetsByGroup,
    { groupKey, groupValue, page, limit }
  )
}

export interface SearchAssetsParams {
  ownerAddress?: string
  authorityAddress?: string
  tokenType?: 'fungible' | 'nonFungible' | 'all'
  page?: number
  limit?: number
}

export interface SearchAssetsResult {
  items?: DasAsset[]
  total?: number
  page?: number
  limit?: number
}

export async function searchAssets(
  params: SearchAssetsParams
): Promise<SearchAssetsResult | null> {
  const { ownerAddress, authorityAddress, tokenType = 'fungible', page = 1, limit = 100 } = params
  const searchParams: Record<string, unknown> = {
    tokenType,
    page,
    limit,
  }
  if (ownerAddress) searchParams.ownerAddress = ownerAddress
  if (authorityAddress) searchParams.authorityAddress = authorityAddress
  return dasRequest<SearchAssetsResult>(DAS_METHODS.searchAssets, searchParams)
}
