/**
 * Tenant mint catalog Edge Function (invoke as tenant_catalog).
 * Central mint list (tenant_mint_catalog) CRUD. Uses service role to bypass RLS.
 * All actions require tenant admin (wallet in tenant_config.admins).
 */

const BASE_CURRENCY_MINTS = new Set([
  'So11111111111111111111111111111111111111112',
  '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
])

function isBaseCurrencyMint(mint: string): boolean {
  return BASE_CURRENCY_MINTS.has(mint)
}

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { requireTenantAdmin } from '../_shared/auth.ts'
import { compareMintCatalogDisplay } from '../_shared/mint-display-sort.ts'
import { isMintSupportedByMarketplaceEscrow } from '@decentraguild/core'
import type { MintMetadataResult } from '../_shared/mint-metadata.ts'

function marketplaceEscrowFields(meta: MintMetadataResult) {
  const splTokenProgram = meta.splTokenProgram ?? null
  const isMplCore = meta.isMplCore ?? false
  const isCompressedNft = meta.isCompressedNft ?? false
  return {
    splTokenProgram,
    isMplCore,
    isCompressedNft,
    marketplaceEscrowSupported: isMintSupportedByMarketplaceEscrow({
      kind: meta.kind,
      splTokenProgram,
      isMplCore,
      isCompressedNft,
    }),
  }
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  const authHeader = req.headers.get('Authorization')
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', req)
  }

  const action = body.action as string
  const tenantId = (body.tenantId as string)?.trim()
  if (!tenantId) return errorResponse('tenantId required', req)

  const db = getAdminClient()
  const check = await requireTenantAdmin(authHeader, tenantId, db)
  if (!check.ok) return check.response
  const now = new Date().toISOString()

  if (action === 'resolve-full') {
    const mint = (body.mint as string)?.trim()
    const kindHint = body.kind as 'SPL' | 'NFT' | 'auto' | undefined
    if (!mint) return errorResponse('mint required', req)
    const { fetchMintMetadata } = await import('../_shared/mint-metadata.ts')
    const hint = kindHint === 'auto' || !kindHint ? undefined : kindHint
    const meta = await fetchMintMetadata(mint, hint)
    if (!meta) return errorResponse('Mint not found or invalid', req, 404)
    const escrow = marketplaceEscrowFields(meta)
    if (meta.kind === 'SPL') {
      return jsonResponse({
        kind: 'SPL',
        spl: { mint, name: meta.name ?? undefined, symbol: meta.label ?? undefined, image: meta.image ?? undefined },
        ...escrow,
      }, req)
    }
    const traitKeys = meta.traitIndex && typeof meta.traitIndex === 'object' && 'trait_keys' in meta.traitIndex
      ? (meta.traitIndex.trait_keys as string[])
      : undefined
    return jsonResponse({
      kind: 'NFT',
      collection: {
        mint,
        name: meta.name ?? undefined,
        image: meta.image ?? undefined,
        collectionSize: meta.collectionSize ?? undefined,
        uniqueTraitCount: traitKeys?.length ?? undefined,
        traitTypes: traitKeys,
      },
      ...escrow,
    }, req)
  }

  if (action === 'list') {
    const { data: rows, error } = await db
      .from('tenant_mint_catalog')
      .select('id, mint, kind, label, shipment_banner_image')
      .eq('tenant_id', tenantId)
      .order('mint')

    if (error) return errorResponse(error.message, req, 500)

    const allEntries = (rows ?? []) as Array<{
      id: number
      mint: string
      kind: string
      label: string | null
    }>
    const entries = allEntries.filter((e) => !isBaseCurrencyMint(e.mint))

    if (entries.length === 0) return jsonResponse({ entries: [] }, req)

    const nftMints = entries.filter((e) => e.kind === 'NFT').map((e) => e.mint)
    let memberCountByCollection: Record<string, number> = {}
    if (nftMints.length > 0) {
      const { data: memberRows } = await db
        .from('tenant_collection_members')
        .select('collection_mint')
        .eq('tenant_id', tenantId)
        .in('collection_mint', nftMints)
      const counts: Record<string, number> = {}
      for (const m of nftMints) counts[m] = 0
      for (const row of (memberRows ?? []) as Array<{ collection_mint: string }>) {
        counts[row.collection_mint] = (counts[row.collection_mint] ?? 0) + 1
      }
      memberCountByCollection = counts
    }

    const nftMintSet = new Set(entries.filter((e) => e.kind === 'NFT').map((e) => e.mint))
    let traitCountByMint: Record<string, number> = {}
    if (nftMintSet.size > 0) {
      const { data: metaRows } = await db
        .from('mint_metadata')
        .select('mint, trait_index')
        .in('mint', [...nftMintSet])
      traitCountByMint = (metaRows ?? []).reduce((acc, m) => {
        const keys = (m.trait_index as { trait_keys?: string[] } | null)?.trait_keys ?? []
        acc[m.mint as string] = keys.length
        return acc
      }, {} as Record<string, number>)
    }

    const allMints = entries.map((e) => e.mint)
    const { data: metaRows } = await db
      .from('mint_metadata')
      .select('mint, name, image, symbol, spl_token_program, is_mpl_core, is_compressed_nft')
      .in('mint', allMints)
    const metaByMint = new Map((metaRows ?? []).map((m) => [(m.mint as string), m]))

    const enriched = entries.map((r) => {
      const meta = metaByMint.get(r.mint) as {
        name?: string | null
        image?: string | null
        symbol?: string | null
        spl_token_program?: string | null
        is_mpl_core?: boolean | null
        is_compressed_nft?: boolean | null
      } | undefined
      const row = r as { shipment_banner_image?: string | null }
      const splTokenProgram = (meta?.spl_token_program as 'legacy' | 'token_2022' | null | undefined) ?? null
      const isMplCore = meta?.is_mpl_core === true
      const isCompressedNft = meta?.is_compressed_nft === true
      const out: Record<string, unknown> = {
        ...r,
        name: meta?.name ?? null,
        image: meta?.image ?? null,
        symbol: meta?.symbol ?? null,
        shipment_banner_image: row?.shipment_banner_image ?? null,
        splTokenProgram,
        isMplCore,
        isCompressedNft,
        marketplaceEscrowSupported: isMintSupportedByMarketplaceEscrow({
          kind: r.kind as 'SPL' | 'NFT',
          splTokenProgram,
          isMplCore,
          isCompressedNft,
        }),
      }
      if (r.kind === 'NFT') {
        out.collectionSize = memberCountByCollection[r.mint] ?? 0
        out.uniqueTraitCount = traitCountByMint[r.mint] ?? 0
      }
      return out
    })

    enriched.sort(compareMintCatalogDisplay)
    return jsonResponse({ entries: enriched }, req)
  }

  if (action === 'list-members') {
    const collectionMint = (body.collectionMint as string)?.trim()
    if (!collectionMint) return errorResponse('collectionMint required', req)

    const { data, error } = await db
      .from('tenant_collection_members')
      .select('mint, name, image, traits, owner')
      .eq('tenant_id', tenantId)
      .eq('collection_mint', collectionMint)
      .order('mint')
      .limit(2000)

    if (error) return errorResponse(error.message, req, 500)

    const entries = (data ?? []).map((r) => {
      const traits = Array.isArray(r.traits) ? r.traits : []
      return {
        mint: r.mint,
        name: (r.name as string) ?? null,
        image: (r.image as string) ?? null,
        traits,
        owner: (r.owner as string) ?? null,
      }
    })
    return jsonResponse({ entries }, req)
  }

  if (action === 'list-discord') {
    const { data: watches } = await db
      .from('watchtower_watches')
      .select('mint, track_holders, track_snapshot, track_transactions')
      .eq('tenant_id', tenantId)
      .or('track_holders.eq.true,track_snapshot.eq.true,track_transactions.eq.true')
    if (!watches?.length) return jsonResponse({ entries: [] }, req)

    const watchByMint = new Map<string, { track_holders: boolean; track_snapshot: boolean; track_transactions: boolean }>()
    for (const w of watches) {
      watchByMint.set(w.mint as string, {
        track_holders: w.track_holders === true,
        track_snapshot: w.track_snapshot === true,
        track_transactions: w.track_transactions === true,
      })
    }

    const mints = [...watchByMint.keys()]
    const [catalogRes, metaRes] = await Promise.all([
      db
        .from('tenant_mint_catalog')
        .select('id, mint, kind, label')
        .eq('tenant_id', tenantId)
        .in('mint', mints)
        .order('mint'),
      db
        .from('mint_metadata')
        .select('mint, name, image, symbol, trait_index, decimals, spl_token_program, is_mpl_core, is_compressed_nft')
        .in('mint', mints),
    ])

    const { data: catalogRows, error } = catalogRes as { data: unknown[] | null; error: { message: string } | null }
    if (error) return errorResponse(error.message, req, 500)

    const metaRows = (metaRes as {
      data: Array<{ mint: string; name?: string; image?: string; symbol?: string | null; trait_index?: unknown; decimals?: number | null }> | null
    }).data ?? []
    const metaByMint = new Map(metaRows.map((m) => [m.mint, m]))

    const entries = (catalogRows ?? []).map((r) => {
      const w = watchByMint.get(r.mint as string)
      const meta = metaByMint.get(r.mint as string) as {
        name?: string
        image?: string
        symbol?: string | null
        trait_index?: unknown
        decimals?: number | null
        spl_token_program?: string | null
        is_mpl_core?: boolean | null
        is_compressed_nft?: boolean | null
      } | undefined
      const splTokenProgram = (meta?.spl_token_program as 'legacy' | 'token_2022' | null | undefined) ?? null
      const isMplCore = meta?.is_mpl_core === true
      const isCompressedNft = meta?.is_compressed_nft === true
      return {
        ...r,
        name: meta?.name ?? null,
        image: meta?.image ?? null,
        symbol: meta?.symbol ?? null,
        trait_index: meta?.trait_index ?? null,
        decimals: meta?.decimals ?? null,
        splTokenProgram,
        isMplCore,
        isCompressedNft,
        marketplaceEscrowSupported: isMintSupportedByMarketplaceEscrow({
          kind: r.kind as 'SPL' | 'NFT',
          splTokenProgram,
          isMplCore,
          isCompressedNft,
        }),
        track_holders: w?.track_holders ?? false,
        track_snapshot: w?.track_snapshot ?? false,
        track_transactions: w?.track_transactions ?? false,
      }
    })
    entries.sort(compareMintCatalogDisplay)
    return jsonResponse({ entries }, req)
  }

  if (action === 'add') {
    const mint = (body.mint as string)?.trim()
    if (isBaseCurrencyMint(mint)) {
      return errorResponse('Base currencies (SOL, USDC, USDT, WBTC) are platform-level and cannot be added to the tenant catalog.', req, 400)
    }
    const kindInput = body.kind as string | undefined
    const kindHint = kindInput === 'auto' || kindInput === undefined ? undefined : kindInput as 'SPL' | 'NFT'
    let name = (body.name as string) ?? null
    let label = (body.label as string) ?? name
    let image = (body.image as string) ?? null
    const shipmentBannerImage = (body.shipmentBannerImage as string)?.trim() || null
    let traitIndex: Record<string, unknown> | null = null

    if (!mint) return errorResponse('mint required', req)

    const { fetchMintMetadata } = await import('../_shared/mint-metadata.ts')
    const meta = await fetchMintMetadata(mint, kindHint)
    if (!meta) {
      return errorResponse('Not a valid SPL token or NFT mint address.', req, 400)
    }
    const kind = meta.kind
    if (!name && !label && !image) {
      name = meta.name ?? null
      label = meta.label ?? meta.name ?? null
      image = meta.image ?? null
    }
    traitIndex = meta.traitIndex ?? null

    await db.from('mint_metadata').upsert({
      mint,
      name: name ?? null,
      symbol: (meta as { symbol?: string }).symbol ?? null,
      image: image ?? null,
      trait_index: traitIndex,
      decimals: meta.decimals ?? null,
      update_authority: meta.updateAuthority ?? null,
      uri: meta.uri ?? null,
      seller_fee_basis_points: meta.sellerFeeBasisPoints ?? null,
      primary_sale_happened: meta.primarySaleHappened ?? null,
      is_mutable: meta.isMutable ?? null,
      edition_nonce: meta.editionNonce ?? null,
      token_standard: meta.tokenStandard ?? null,
      spl_token_program: meta.splTokenProgram ?? null,
      is_mpl_core: meta.isMplCore ?? false,
      is_compressed_nft: meta.isCompressedNft ?? false,
      updated_at: now,
    }, { onConflict: 'mint' })

    const { data: entry, error } = await db
      .from('tenant_mint_catalog')
      .upsert(
        {
          tenant_id: tenantId,
          mint,
          kind,
          label: label ?? null,
          shipment_banner_image: shipmentBannerImage,
          updated_at: now,
        },
        { onConflict: 'tenant_id,mint' },
      )
      .select()
      .single()

    if (error) return errorResponse(error.message, req, 500)

    if (kind === 'NFT' && (meta?.collectionSize ?? 0) > 0) {
      await db.from('tenant_collection_scope').upsert(
        { tenant_id: tenantId, collection_mint: mint },
        { onConflict: 'tenant_id,collection_mint' },
      )
      const { enqueueCollectionIndexing } = await import('../_shared/mint-catalog-index-worker.ts')
      await enqueueCollectionIndexing(db, mint, now)
    }

    const traitKeys = meta.traitIndex && typeof meta.traitIndex === 'object' && 'trait_keys' in meta.traitIndex
      ? (meta.traitIndex.trait_keys as string[])
      : undefined
    const resolved = {
      kind: meta.kind,
      name: meta.name ?? null,
      symbol: (meta as { symbol?: string }).symbol ?? null,
      image: meta.image ?? null,
      decimals: meta.decimals ?? null,
      collectionSize: meta.collectionSize ?? undefined,
      uniqueTraitCount: traitKeys?.length ?? undefined,
      splTokenProgram: meta.splTokenProgram ?? null,
      isMplCore: meta.isMplCore ?? false,
      isCompressedNft: meta.isCompressedNft ?? false,
      marketplaceEscrowSupported: isMintSupportedByMarketplaceEscrow({
        kind: meta.kind,
        splTokenProgram: meta.splTokenProgram ?? null,
        isMplCore: meta.isMplCore ?? false,
        isCompressedNft: meta.isCompressedNft ?? false,
      }),
    }

    return jsonResponse({ entry, resolved }, req)
  }

  if (action === 'remove') {
    const mint = (body.mint as string)?.trim()
    if (!mint) return errorResponse('mint required', req)

    const { error: errMembers } = await db
      .from('tenant_collection_scope')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('collection_mint', mint)
    if (errMembers) return errorResponse(errMembers.message, req, 500)

    const { error } = await db
      .from('tenant_mint_catalog')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('mint', mint)

    if (error) return errorResponse(error.message, req, 500)
    return jsonResponse({ ok: true }, req)
  }

  if (action === 'catalog-refresh-traits') {
    const catalogId = body.id as number
    if (!catalogId) return errorResponse('id required', req)

    const { data: existing } = await db
      .from('tenant_mint_catalog')
      .select('mint')
      .eq('id', catalogId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (!existing) return errorResponse('Catalog entry not found', req, 404)
    const mint = existing.mint as string

    const { fetchMintMetadata } = await import('../_shared/mint-metadata.ts')
    const {
      emptyPartialTraitState,
      mergeAttributesIntoPartialTraitState,
      partialTraitStateToTraitIndex,
    } = await import('../_shared/index-collection-members.ts')

    const meta = await fetchMintMetadata(mint, 'NFT')
    let traitIndex: Record<string, unknown> | null = null
    const fromMeta = meta?.traitIndex
    if (fromMeta && typeof fromMeta === 'object' && 'trait_keys' in fromMeta) {
      const tk = (fromMeta as { trait_keys?: unknown }).trait_keys
      if (Array.isArray(tk) && tk.length > 0) traitIndex = fromMeta as Record<string, unknown>
    }
    if (!traitIndex) {
      const { data: memberRows } = await db
        .from('collection_members')
        .select('traits')
        .eq('collection_mint', mint)
        .limit(5000)
      const partial = emptyPartialTraitState()
      const attrsList = (memberRows ?? []).map((r) =>
        Array.isArray(r.traits) ? (r.traits as Array<{ trait_type?: string; value?: string }>) : undefined,
      )
      mergeAttributesIntoPartialTraitState(partial, attrsList)
      traitIndex = partialTraitStateToTraitIndex(partial)
    }
    const keys = traitIndex?.trait_keys as unknown
    if (!Array.isArray(keys) || keys.length === 0) {
      return errorResponse('Could not fetch traits for collection', req, 500)
    }

    await db.from('mint_metadata').update({
      trait_index: traitIndex,
      updated_at: now,
    }).eq('mint', mint)

    const { data: entry } = await db
      .from('tenant_mint_catalog')
      .select('id, mint, kind, label')
      .eq('id', catalogId)
      .eq('tenant_id', tenantId)
      .single()
    return jsonResponse({ entry: entry ?? { id: catalogId, mint, kind: 'NFT', label: null } }, req)
  }

  if (action === 'update-shipment-display') {
    const mint = (body.mint as string)?.trim()
    if (!mint) return errorResponse('mint required', req)

    const shipmentBannerImage = (body.shipmentBannerImage as string)?.trim() || null

    const { error } = await db
      .from('tenant_mint_catalog')
      .update({
        shipment_banner_image: shipmentBannerImage,
        updated_at: now,
      })
      .eq('tenant_id', tenantId)
      .eq('mint', mint)

    if (error) return errorResponse(error.message, req, 500)
    return jsonResponse({ ok: true }, req)
  }

  if (action === 'sync') {
    const mints = body.mints as Array<{ mint: string; kind: 'SPL' | 'NFT'; label?: string | null }>
    if (!Array.isArray(mints) || mints.length === 0) {
      return jsonResponse({ synced: 0 }, req)
    }

    const filtered = mints.filter((m) => !isBaseCurrencyMint(String(m.mint).trim()))
    const rows = filtered.map((m) => ({
      tenant_id: tenantId,
      mint: String(m.mint).trim(),
      kind: m.kind ?? 'SPL',
      label: m.label ?? null,
      updated_at: now,
    }))

    const { error } = await db.from('tenant_mint_catalog').upsert(rows, { onConflict: 'tenant_id,mint' })
    if (error) return errorResponse(error.message, req, 500)
    return jsonResponse({ synced: rows.length, skipped: mints.length - filtered.length }, req)
  }

  return errorResponse(`Unknown action: ${action}`, req, 400)
})
