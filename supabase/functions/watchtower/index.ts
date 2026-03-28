/**
 * Watchtower Edge Function.
 * Public catalog and mint detail for member-facing Watchtower page.
 *
 * Actions:
 *   catalog – List mints with any track enabled (public).
 *   mint-detail – Metadata, holders (SPL paginated, 1000 per page), snapshot summaries for a mint (public).
 *   mint-holders-csv – Full holder_current or snapshot row as CSV (public, mint must be in tenant catalog).
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { isMintWithinLimit } from '../_shared/watchtower-billing.ts'

function firstParallelError(
  results: Array<{ error?: { message: string } | null }>,
): string | null {
  for (const r of results) {
    const e = r.error
    if (e?.message) return e.message
  }
  return null
}
import { compareMintCatalogDisplay } from '../_shared/mint-display-sort.ts'
import { buildHoldersCsv } from '../_shared/holders-csv.ts'

function sortHoldersByAmountDesc(h: Array<{ wallet: string; amount: string }>): Array<{ wallet: string; amount: string }> {
  return [...h].sort((a, b) => {
    const na = BigInt(a.amount || '0')
    const nb = BigInt(b.amount || '0')
    if (nb > na) return 1
    if (nb < na) return -1
    return 0
  })
}

Deno.serve(async (req: Request) => {
  try {
    const preflight = handlePreflight(req)
    if (preflight) return preflight

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

    // ---------------------------------------------------------------------------
    // catalog – mints with any track enabled (public)
    // ---------------------------------------------------------------------------
    if (action === 'catalog') {
      const { data: watches, error: watchesError } = await db
        .from('watchtower_watches')
        .select('mint, track_holders, track_snapshot, track_transactions')
        .eq('tenant_id', tenantId)

      if (watchesError) return errorResponse(watchesError.message, req, 500)

      const mints = (watches ?? []).map((w) => w.mint as string)
      if (mints.length === 0) return jsonResponse({ entries: [] }, req)

      const [catalogResult, metaResult] = await Promise.all([
        db
          .from('tenant_mint_catalog')
          .select('id, mint, kind, label')
          .eq('tenant_id', tenantId)
          .in('mint', mints)
          .order('mint'),
        db
          .from('mint_metadata')
          .select('mint, name, symbol, image')
          .in('mint', mints),
      ])

      const catalogRes = catalogResult as { data: unknown[] | null; error: { message: string } | null }
      const metaRes = metaResult as { data: unknown[] | null; error: { message: string } | null }
      if (catalogRes.error) return errorResponse(catalogRes.error.message, req, 500)
      if (metaRes.error) return errorResponse(metaRes.error.message, req, 500)

      const catalog = catalogRes.data ?? []
      const metaRows = metaRes.data ?? []

      const metaByMint = new Map(
        metaRows.map((m) => [(m as { mint: string }).mint, m as Record<string, unknown>])
      )
      const watchMap = new Map((watches ?? []).map((w) => [w.mint as string, w]))
      const entries = catalog.map((r) => {
        const row = r as Record<string, unknown>
        const meta = metaByMint.get(row.mint as string)
        const label =
          (row.label as string) ?? (row.name as string) ?? (meta?.name as string) ?? (row.mint as string)
        const name = (row.name as string) ?? (meta?.name as string) ?? null
        const image = (row.image as string) ?? (meta?.image as string) ?? null
        return {
          id: row.id,
          mint: row.mint,
          kind: row.kind,
          label,
          name,
          image,
          track_holders: watchMap.get(row.mint as string)?.track_holders ?? false,
          track_snapshot: watchMap.get(row.mint as string)?.track_snapshot ?? false,
          track_transactions: watchMap.get(row.mint as string)?.track_transactions ?? false,
        }
      })

      entries.sort(compareMintCatalogDisplay)
      return jsonResponse({ entries }, req)
    }

    // ---------------------------------------------------------------------------
    // mint-detail – metadata, holders, snapshots for a mint (public)
    // ---------------------------------------------------------------------------
    if (action === 'mint-detail') {
      const mint = (body.mint as string)?.trim()
      if (!mint) return errorResponse('mint required', req)

      const [
        catalogRes,
        metaRes,
        watchRes,
        holderRes,
        trackerRes,
        scopeRes,
      ] = await Promise.all([
        db
          .from('tenant_mint_catalog')
          .select('id, mint, kind, label')
          .eq('tenant_id', tenantId)
          .eq('mint', mint)
          .maybeSingle(),
        db
          .from('mint_metadata')
          .select('mint, name, symbol, image, decimals, seller_fee_basis_points, traits, trait_index, update_authority, uri, primary_sale_happened, is_mutable, edition_nonce, token_standard')
          .eq('mint', mint)
          .maybeSingle(),
        db
          .from('watchtower_watches')
          .select('track_holders, track_snapshot, track_transactions')
          .eq('tenant_id', tenantId)
          .eq('mint', mint)
          .maybeSingle(),
        db
          .from('holder_current')
          .select('holder_wallets, last_updated')
          .eq('mint', mint)
          .maybeSingle(),
        db
          .from('holder_snapshots')
          .select('snapshot_date, snapshot_at, holder_wallets')
          .eq('mint', mint)
          .order('snapshot_at', { ascending: false })
          .limit(30),
        db
          .from('tenant_collection_members')
          .select('mint, name, image, traits, owner')
          .eq('tenant_id', tenantId)
          .eq('collection_mint', mint)
          .limit(2000),
      ])

      const parallelErr = firstParallelError([
        catalogRes as { error?: { message: string } | null },
        metaRes as { error?: { message: string } | null },
        watchRes as { error?: { message: string } | null },
        holderRes as { error?: { message: string } | null },
        trackerRes as { error?: { message: string } | null },
        scopeRes as { error?: { message: string } | null },
      ])
      if (parallelErr) return errorResponse(parallelErr, req, 500)

      const catalogRow = (catalogRes as { data: unknown }).data
      const metaRow = (metaRes as { data: unknown }).data
      const watchRow = (watchRes as { data: unknown }).data
      const holderSnapshot = (holderRes as { data: unknown }).data
      const trackerSnapshots = (trackerRes as { data: unknown[] | null }).data ?? []
      const memberCatalogRows = (scopeRes as { data: unknown[] | null }).data ?? []

      if (!catalogRow) return errorResponse('Mint not found in catalog', req, 404)

      const watch = watchRow as { track_holders?: boolean; track_snapshot?: boolean; track_transactions?: boolean } | null
      const [holdersWithinCurrent, holdersWithinSnapshot] = await Promise.all([
        watch?.track_holders ? isMintWithinLimit(db, tenantId, mint, 'mints_current') : Promise.resolve(true),
        watch?.track_snapshot ? isMintWithinLimit(db, tenantId, mint, 'mintsSnapshot') : Promise.resolve(true),
      ])
      const rawHolders = (holderSnapshot as { holder_wallets?: Array<{ wallet?: string; amount?: string } | string> } | null)?.holder_wallets ?? []
      const allHoldersNorm = holdersWithinCurrent
        ? rawHolders
            .map((h) => (typeof h === 'string' ? { wallet: h, amount: '1' } : { wallet: h.wallet ?? '', amount: h.amount ?? '1' }))
            .filter((h) => h.wallet)
        : []

      const catalogKind = ((catalogRow as Record<string, unknown> | null)?.kind as string) ?? 'SPL'
      const defaultLimit = 1000
      const maxLimit = 1000
      const holdersLimitRaw = Number(body.holdersLimit)
      const holdersOffsetRaw = Number(body.holdersOffset)
      const holdersLimit = Number.isFinite(holdersLimitRaw) && holdersLimitRaw > 0
        ? Math.min(Math.floor(holdersLimitRaw), maxLimit)
        : defaultLimit
      const holdersOffset = Number.isFinite(holdersOffsetRaw) && holdersOffsetRaw > 0 ? Math.floor(holdersOffsetRaw) : 0

      let holdersPage = allHoldersNorm
      let holdersTotal = allHoldersNorm.length
      if (catalogKind === 'SPL' && allHoldersNorm.length > 0) {
        const sorted = sortHoldersByAmountDesc(allHoldersNorm)
        holdersTotal = sorted.length
        holdersPage = sorted.slice(holdersOffset, holdersOffset + holdersLimit)
      }

      const snapshots = holdersWithinSnapshot
        ? trackerSnapshots.map((s) => {
        const row = s as { snapshot_date: string; snapshot_at?: string; holder_wallets?: unknown[] }
        const hw = row.holder_wallets ?? []
        const dateLabel = row.snapshot_at
          ? new Date(row.snapshot_at).toISOString().slice(0, 16).replace('T', ' ')
          : row.snapshot_date
        return {
          date: dateLabel,
          holderCount: hw.length,
          snapshotAt: row.snapshot_at ?? null,
        }
      })
        : []

      // Merge catalog + mint_metadata: prefer metadata when catalog is empty
      const catalog = catalogRow as Record<string, unknown>
      const meta = metaRow as Record<string, unknown> | null
      const label =
        (catalog.label as string) ?? (catalog.name as string) ?? (meta?.name as string) ?? mint
      const name = (catalog.name as string) ?? (meta?.name as string) ?? null
      const image = (catalog.image as string) ?? (meta?.image as string) ?? null
      const symbol = (meta?.symbol as string) ?? null
      const decimals = meta?.decimals as number | null
      const sellerFeeBasisPoints = meta?.seller_fee_basis_points as number | null
      const updateAuthority = meta?.update_authority as string | null
      const uri = meta?.uri as string | null
      const primarySaleHappened = meta?.primary_sale_happened as boolean | null
      const isMutable = meta?.is_mutable as boolean | null
      const editionNonce = meta?.edition_nonce as number | null
      const tokenStandard = meta?.token_standard as string | null

      // Trait types from mint_metadata.trait_index or mint_metadata.traits
      const metaTraitIndex = meta?.trait_index as { trait_keys?: string[] } | null
      const metaTraits = meta?.traits as Array<{ trait_type?: string }> | null
      const traitTypes: string[] = []
      if (metaTraitIndex?.trait_keys?.length) {
        traitTypes.push(...metaTraitIndex.trait_keys)
      } else if (Array.isArray(metaTraits)) {
        const seen = new Set<string>()
        for (const t of metaTraits) {
          const k = t.trait_type ?? (t as Record<string, unknown>).traitType
          if (typeof k === 'string' && k && !seen.has(k)) {
            seen.add(k)
            traitTypes.push(k)
          }
        }
      }

      // Member NFTs from tenant_collection_members (separate list)
      const memberNfts = memberCatalogRows.map((r) => {
        const row = r as { mint: string; name?: string | null; image?: string | null; traits?: unknown; owner?: string | null }
        const traits = Array.isArray(row.traits) ? row.traits : []
        return {
          mint: row.mint,
          name: row.name ?? null,
          image: row.image ?? null,
          traits,
          owner: row.owner ?? null,
        }
      })

      const holder = holderSnapshot as { last_updated?: string } | null
      const graceMessage =
        (watch?.track_holders && !holdersWithinCurrent) || (watch?.track_snapshot && !holdersWithinSnapshot)
          ? 'Pay to activate this track'
          : undefined
      return jsonResponse({
        mint: catalog.mint ?? mint,
        kind: catalog.kind ?? 'SPL',
        label,
        name,
        image,
        symbol,
        decimals,
        sellerFeeBasisPoints,
        updateAuthority,
        uri,
        primarySaleHappened,
        isMutable,
        editionNonce,
        tokenStandard,
        traitTypes,
        track_holders: watch?.track_holders ?? false,
        track_snapshot: watch?.track_snapshot ?? false,
        track_transactions: watch?.track_transactions ?? false,
        holders: holdersPage.map((h) => ({ wallet: h.wallet, amount: h.amount })),
        ...(catalogKind === 'SPL'
          ? { holdersTotal, holdersOffset, holdersLimit }
          : {}),
        holdersUpdatedAt: holder?.last_updated ?? null,
        snapshots,
        transactions: [],
        memberNfts,
        ...(graceMessage && { graceMessage }),
      }, req)
    }

    // ---------------------------------------------------------------------------
    // mint-holders-csv – full wallet list as CSV (current or snapshot row)
    // ---------------------------------------------------------------------------
    if (action === 'mint-holders-csv') {
      const mint = (body.mint as string)?.trim()
      if (!mint) return errorResponse('mint required', req)
      const snapshotAtRaw = (body.snapshotAt as string | undefined)?.trim()
      const snapshotAt = snapshotAtRaw || null

      const { data: catRow, error: catErr } = await db
        .from('tenant_mint_catalog')
        .select('mint, kind')
        .eq('tenant_id', tenantId)
        .eq('mint', mint)
        .maybeSingle()
      if (catErr) return errorResponse(catErr.message, req, 500)
      if (!catRow) return errorResponse('Mint not found in catalog', req, 404)

      const { data: watchRow, error: watchErr } = await db
        .from('watchtower_watches')
        .select('track_holders, track_snapshot')
        .eq('tenant_id', tenantId)
        .eq('mint', mint)
        .maybeSingle()
      if (watchErr) return errorResponse(watchErr.message, req, 500)
      const watch = watchRow as { track_holders?: boolean; track_snapshot?: boolean } | null

      const catalogKind = ((catRow as { kind?: string }).kind as string) ?? 'SPL'

      let rawHolders: unknown[] = []
      if (snapshotAt) {
        const { data: snap, error: snapErr } = await db
          .from('holder_snapshots')
          .select('holder_wallets')
          .eq('mint', mint)
          .eq('snapshot_at', snapshotAt)
          .maybeSingle()
        if (snapErr) return errorResponse(snapErr.message, req, 500)
        rawHolders = (snap?.holder_wallets as unknown[]) ?? []
      } else {
        const { data: cur, error: curErr } = await db
          .from('holder_current')
          .select('holder_wallets')
          .eq('mint', mint)
          .maybeSingle()
        if (curErr) return errorResponse(curErr.message, req, 500)
        rawHolders = (cur?.holder_wallets as unknown[]) ?? []
      }

      if (snapshotAt) {
        if (!watch?.track_snapshot) {
          return errorResponse('Snapshot track not enabled for this mint', req, 403)
        }
        const within = await isMintWithinLimit(db, tenantId, mint, 'mintsSnapshot')
        if (!within) return errorResponse('Pay to activate this track', req, 403)
      } else {
        if (!watch?.track_holders) {
          return errorResponse('Holders track not enabled for this mint', req, 403)
        }
        const within = await isMintWithinLimit(db, tenantId, mint, 'mints_current')
        if (!within) return errorResponse('Pay to activate this track', req, 403)
      }

      const allHoldersNorm = rawHolders
        .map((h) =>
          typeof h === 'string'
            ? { wallet: h, amount: '1' }
            : { wallet: (h as { wallet?: string }).wallet ?? '', amount: (h as { amount?: string }).amount ?? '1' },
        )
        .filter((h) => h.wallet)

      let rows = allHoldersNorm
      if (catalogKind === 'SPL' && rows.length > 0) {
        rows = sortHoldersByAmountDesc(rows)
      }

      const csv = buildHoldersCsv(rows)
      return jsonResponse({ csv }, req)
    }

    return errorResponse(`Unknown action: ${action}`, req, 400)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return errorResponse(msg, req, 500)
  }
})
