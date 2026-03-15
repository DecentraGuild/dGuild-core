/**
 * Tenant mint catalog – central list for all modules.
 * Uses tenant-catalog Edge Function (bypasses RLS) for admin CRUD.
 */

import { useTenantStore } from '~/stores/tenant'
import { useSupabase } from '~/composables/core/useSupabase'
import { getEdgeFunctionErrorMessage } from '~/utils/edgeFunctionError'

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
}

export function useTenantCatalog() {
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId)

  async function list(): Promise<CatalogEntry[]> {
    const id = tenantId.value
    if (!id) return []

    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('tenant-catalog', {
      body: { action: 'list', tenantId: id },
    })

    if (error) throw new Error(getEdgeFunctionErrorMessage(error, 'Failed to load catalog'))
    return (data?.entries ?? []) as CatalogEntry[]
  }

  /** List mints with track_holders=true (current holders track). Uses Edge Function to bypass RLS. */
  async function listDiscord(): Promise<CatalogEntry[]> {
    const id = tenantId.value
    if (!id) return []

    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('tenant-catalog', {
      body: { action: 'list-discord', tenantId: id },
    })

    if (error) throw new Error(getEdgeFunctionErrorMessage(error, 'Failed to load Discord catalog'))
    return (data?.entries ?? []) as CatalogEntry[]
  }

  async function add(params: {
    mint: string
    kind: 'SPL' | 'NFT'
    name?: string | null
    label?: string | null
    image?: string | null
  }): Promise<CatalogEntry> {
    const id = tenantId.value
    if (!id) throw new Error('No tenant')

    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('tenant-catalog', {
      body: {
        action: 'add',
        tenantId: id,
        mint: params.mint,
        kind: params.kind,
        name: params.name ?? null,
        label: params.label ?? params.name ?? null,
        image: params.image ?? null,
      },
    })

    if (error) throw new Error(getEdgeFunctionErrorMessage(error, 'Failed to add mint'))
    return data?.entry as CatalogEntry
  }

  async function updateShipmentDisplay(mint: string, params: { image?: string | null }): Promise<void> {
    const id = tenantId.value
    if (!id) throw new Error('No tenant')

    const supabase = useSupabase()
    const { error } = await supabase.functions.invoke('tenant-catalog', {
      body: {
        action: 'update-shipment-display',
        tenantId: id,
        mint,
        shipmentBannerImage: params.image ?? null,
      },
    })

    if (error) throw new Error(getEdgeFunctionErrorMessage(error, 'Failed to update shipment display'))
  }

  async function remove(mint: string): Promise<void> {
    const id = tenantId.value
    if (!id) throw new Error('No tenant')

    const supabase = useSupabase()
    const { error } = await supabase.functions.invoke('tenant-catalog', {
      body: { action: 'remove', tenantId: id, mint },
    })

    if (error) throw new Error(getEdgeFunctionErrorMessage(error, 'Failed to remove mint'))
  }

  async function sync(
    mints: Array<{ mint: string; kind: 'SPL' | 'NFT'; name?: string | null; label?: string | null; image?: string | null }>,
  ): Promise<number> {
    const id = tenantId.value
    if (!id || !mints.length) return 0

    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('tenant-catalog', {
      body: { action: 'sync', tenantId: id, mints },
    })

    if (error) throw new Error(getEdgeFunctionErrorMessage(error, 'Failed to sync catalog'))
    return (data?.synced as number) ?? 0
  }

  return { list, listDiscord, add, remove, sync, updateShipmentDisplay }
}
