/**
 * Full platform mint list for metadata / indexing (Address Book defaults, catalogs, watches, marketplace, vouchers).
 */

import type { getAdminClient } from './supabase-admin.ts'
import { ADDRESS_BOOK_DEFAULT_MINTS_DATA } from './address-book-defaults.data.ts'

type Db = ReturnType<typeof getAdminClient>

export async function loadPlatformMetadataScope(db: Db): Promise<{
  mints: string[]
  kindByMint: Map<string, 'SPL' | 'NFT'>
}> {
  const kindByMint = new Map<string, 'SPL' | 'NFT'>()
  const mints = new Set<string>()

  for (const row of ADDRESS_BOOK_DEFAULT_MINTS_DATA) {
    mints.add(row.mint)
    kindByMint.set(row.mint, row.kind)
  }

  const [catalogRes, watchesRes, scopeRes, tenantColScopeRes, bundleVoucherRes, individualVoucherRes] = await Promise.all([
    db.from('tenant_mint_catalog').select('mint, kind'),
    db.from('watchtower_watches').select('mint'),
    db.from('marketplace_mint_scope').select('mint, source, collection_mint'),
    db.from('tenant_collection_scope').select('collection_mint'),
    db.from('bundle_vouchers').select('token_mint'),
    db.from('individual_vouchers').select('mint'),
  ])

  for (const r of catalogRes.data ?? []) {
    const m = r.mint as string
    mints.add(m)
    kindByMint.set(m, (r.kind as 'SPL' | 'NFT') ?? 'SPL')
  }
  for (const r of watchesRes.data ?? []) mints.add(r.mint as string)
  for (const r of scopeRes.data ?? []) {
    mints.add(r.mint as string)
    const cm = r.collection_mint as string | null | undefined
    if (cm) mints.add(cm)
  }
  for (const r of tenantColScopeRes.data ?? []) mints.add(r.collection_mint as string)
  for (const r of bundleVoucherRes.data ?? []) mints.add((r as { token_mint: string }).token_mint)
  for (const r of individualVoucherRes.data ?? []) mints.add((r as { mint: string }).mint)

  const collectionRoots = new Set<string>()
  for (const m of mints) {
    if (kindByMint.get(m) === 'NFT') collectionRoots.add(m)
  }
  for (const r of scopeRes.data ?? []) {
    if (r.source === 'collection') collectionRoots.add((r.collection_mint ?? r.mint) as string)
  }
  for (const r of tenantColScopeRes.data ?? []) collectionRoots.add(r.collection_mint as string)

  const roots = [...collectionRoots]
  for (let i = 0; i < roots.length; i += 100) {
    const chunk = roots.slice(i, i + 100)
    if (chunk.length === 0) continue
    const { data: memberRows } = await db.from('collection_members').select('mint').in('collection_mint', chunk)
    for (const row of memberRows ?? []) mints.add(row.mint as string)
  }

  return { mints: [...mints].sort(), kindByMint }
}

export async function loadPlatformMetadataMintList(db: Db): Promise<string[]> {
  const { mints } = await loadPlatformMetadataScope(db)
  return mints
}
