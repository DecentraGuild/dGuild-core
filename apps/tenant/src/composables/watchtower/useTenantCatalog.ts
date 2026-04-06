/**
 * Tenant mint catalog – central list for all modules.
 * Uses tenant_catalog Edge Function (bypasses RLS) for admin CRUD.
 */

import { invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useTenantStore } from '~/stores/tenant'
import { useSupabase } from '~/composables/core/useSupabase'

export interface CatalogEntry {
  id: number
  mint: string
  kind: 'SPL' | 'NFT'
  label: string | null
  image: string | null
  name: string | null
  shipment_banner_image?: string | null
  trait_index?: unknown
  /** SPL decimals from mint_metadata; null for NFT or when not yet fetched. */
  decimals?: number | null
  /** NFT collections: total member NFTs in tenant_collection_members. */
  collectionSize?: number
  /** NFT collections: number of trait types from trait_index. */
  uniqueTraitCount?: number
  splTokenProgram?: 'legacy' | 'token_2022' | null
  isMplCore?: boolean
  isCompressedNft?: boolean
  marketplaceEscrowSupported?: boolean
}

export interface CatalogAddResolved {
  kind: 'SPL' | 'NFT'
  name: string | null
  symbol: string | null
  image: string | null
  decimals: number | null
  collectionSize?: number
  uniqueTraitCount?: number
  splTokenProgram?: 'legacy' | 'token_2022' | null
  isMplCore?: boolean
  isCompressedNft?: boolean
  marketplaceEscrowSupported?: boolean
}

export interface CatalogAddResult {
  entry: CatalogEntry
  resolved: CatalogAddResolved
}

export function useTenantCatalog() {
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId)

  async function list(): Promise<CatalogEntry[]> {
    const id = tenantId.value
    if (!id) return []

    const supabase = useSupabase()
    const data = await invokeEdgeFunction<{ entries?: CatalogEntry[] }>(supabase, 'tenant_catalog', { action: 'list', tenantId: id }, { errorFallback: 'Failed to load catalog' })
    return (data?.entries ?? []) as CatalogEntry[]
  }

  /** List mints with track_holders=true (current holders track). Uses Edge Function to bypass RLS. */
  async function listDiscord(): Promise<CatalogEntry[]> {
    const id = tenantId.value
    if (!id) return []

    const supabase = useSupabase()
    const data = await invokeEdgeFunction<{ entries?: CatalogEntry[] }>(supabase, 'tenant_catalog', { action: 'list-discord', tenantId: id }, { errorFallback: 'Failed to load Discord catalog' })
    return (data?.entries ?? []) as CatalogEntry[]
  }

  async function add(params: {
    mint: string
    kind?: 'SPL' | 'NFT' | 'auto'
    name?: string | null
    label?: string | null
    image?: string | null
  }): Promise<CatalogAddResult> {
    const id = tenantId.value
    if (!id) throw new Error('No tenant')

    const supabase = useSupabase()
    const data = await invokeEdgeFunction<CatalogAddResult>(
      supabase,
      'tenant_catalog',
      {
        action: 'add',
        tenantId: id,
        mint: params.mint,
        kind: params.kind ?? 'auto',
        name: params.name ?? null,
        label: params.label ?? params.name ?? null,
        image: params.image ?? null,
      },
      { errorFallback: 'Failed to add mint' },
    )
    if (!data?.entry || !data?.resolved) throw new Error('Invalid catalog add response')
    return data
  }

  async function updateShipmentDisplay(mint: string, params: { image?: string | null }): Promise<void> {
    const id = tenantId.value
    if (!id) throw new Error('No tenant')

    const supabase = useSupabase()
    await invokeEdgeFunction(
      supabase,
      'tenant_catalog',
      {
        action: 'update-shipment-display',
        tenantId: id,
        mint,
        shipmentBannerImage: params.image ?? null,
      },
      { errorFallback: 'Failed to update shipment display' },
    )
  }

  async function remove(mint: string): Promise<void> {
    const id = tenantId.value
    if (!id) throw new Error('No tenant')

    const supabase = useSupabase()
    await invokeEdgeFunction(supabase, 'tenant_catalog', { action: 'remove', tenantId: id, mint }, { errorFallback: 'Failed to remove mint' })
  }

  async function sync(
    mints: Array<{ mint: string; kind: 'SPL' | 'NFT'; name?: string | null; label?: string | null; image?: string | null }>,
  ): Promise<number> {
    const id = tenantId.value
    if (!id || !mints.length) return 0

    const supabase = useSupabase()
    const data = await invokeEdgeFunction<{ synced?: number }>(supabase, 'tenant_catalog', { action: 'sync', tenantId: id, mints }, { errorFallback: 'Failed to sync catalog' })
    return (data?.synced as number) ?? 0
  }

  return { list, listDiscord, add, remove, sync, updateShipmentDisplay }
}
