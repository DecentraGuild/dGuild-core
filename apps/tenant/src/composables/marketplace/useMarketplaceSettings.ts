/**
 * Marketplace admin settings: mint catalog, currencies, fees, whitelist.
 * Form state, add/remove mints, save to Supabase.
 */

import { BASE_CURRENCY_MINTS } from '@decentraguild/core'
import { getModuleCatalogEntry } from '@decentraguild/catalog'
import type { TieredAddonsPricing } from '@decentraguild/catalog'
import { invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantCatalog } from '~/composables/watchtower/useTenantCatalog'
import type { AddressBookEntry, CatalogMintItem } from '~/types/mints'
import type { CatalogEntry } from '~/composables/watchtower/useTenantCatalog'
import { reactive, ref, watch, computed, nextTick } from 'vue'

export interface CollectionMint {
  mint: string
  name?: string
  image?: string
  sellerFeeBasisPoints?: number
  updateAuthority?: string
  uri?: string
  primarySaleHappened?: boolean
  isMutable?: boolean
  editionNonce?: number
  tokenStandard?: string
  groupPath?: string[]
  collectionSize?: number
  uniqueTraitCount?: number
  traitTypes?: string[]
  _loading?: boolean
  _error?: string
}

export interface SplAssetMint {
  mint: string
  name?: string
  symbol?: string
  image?: string
  decimals?: number | null
  sellerFeeBasisPoints?: number | null
  updateAuthority?: string
  uri?: string
  primarySaleHappened?: boolean
  isMutable?: boolean
  editionNonce?: number
  tokenStandard?: string
  _loading?: boolean
  _error?: string
}

export interface CurrencyMint {
  mint: string
  name: string
  symbol: string
  image?: string
  decimals?: number | null
  sellerFeeBasisPoints?: number | null
  _loading?: boolean
  _error?: string
}

export interface ShopFee {
  wallet: string
  makerFlatFee: number
  takerFlatFee: number
  makerPercentFee: number
  takerPercentFee: number
}

export interface WhitelistSettings {
  programId: string
  account: string
}

export type WhitelistFormValue = WhitelistSettings | null | 'use-default' | 'admin-only'

export interface MarketplaceForm {
  collectionMints: CollectionMint[]
  splAssetMints: SplAssetMint[]
  currencyMints: CurrencyMint[]
  shopFee: ShopFee
  whitelist: WhitelistFormValue
}

const DEFAULT_WHITELIST: WhitelistSettings = {
  programId: 'whi5uDPWK4rAE9Sus6hdxdHwsG1hjDBn6kXM6pyqwTn',
  account: '',
}

const MARKETPLACE_UI_MINT_CAP_MULTIPLIER = 4

function getMarketplaceUiMintsCap(): number {
  const marketplace = getModuleCatalogEntry('marketplace')
  const pricing = marketplace?.pricing
  if (!pricing || pricing.modelType !== 'tiered_addons') return 1000

  const tiers = (pricing as TieredAddonsPricing).tiers ?? []
  const maxTierIncludedMints = tiers.reduce((max, t) => Math.max(max, (t.included as { mintsCount?: number } | undefined)?.mintsCount ?? 0), 0)
  const base = Math.max(1, maxTierIncludedMints)
  return base * MARKETPLACE_UI_MINT_CAP_MULTIPLIER
}

const MARKETPLACE_UI_MINTS_CAP = getMarketplaceUiMintsCap()

export function useMarketplaceSettings(opts: {
  slug: () => string
  settings: () => Record<string, unknown> | null
  emit: (event: 'saved', payload: Record<string, unknown>) => void
  emitSaving: (value: boolean) => void
}) {
  const { slug, settings, emit, emitSaving } = opts
  const tenantId = computed(() => useTenantStore().tenantId)
  const tenantCatalog = useTenantCatalog()

  const form = reactive<MarketplaceForm>({
    collectionMints: [],
    splAssetMints: [],
    currencyMints: [],
    shopFee: {
      wallet: '',
      makerFlatFee: 0,
      takerFlatFee: 0,
      makerPercentFee: 0,
      takerPercentFee: 0,
    },
    whitelist: 'use-default' as WhitelistFormValue,
  })

  const totalMintsCount = computed(() => form.collectionMints.length + form.splAssetMints.length)

  const customCurrencies = computed(() => {
    const baseMints = new Set(BASE_CURRENCY_MINTS.map((b) => b.mint))
    return form.currencyMints.filter((c) => !baseMints.has(c.mint))
  })

  const anyLoading = computed(() => {
    const colLoading = form.collectionMints.some((m) => m._loading)
    const splLoading = form.splAssetMints.some((m) => m._loading)
    const currLoading = customCurrencies.value.some((c) => c._loading)
    return colLoading || splLoading || currLoading
  })

  const anyError = computed(() => {
    const colErr = form.collectionMints.some((m) => m._error)
    const splErr = form.splAssetMints.some((m) => m._error)
    const currErr = customCurrencies.value.some((c) => c._error)
    return colErr || splErr || currErr
  })

  const canSave = computed(() => !anyLoading.value && !anyError.value)

  const marketplaceGateSelectValue = computed(() => form.whitelist)

  const marketplaceWhitelistSelectValue = computed(() => {
    const w = form.whitelist
    if (w === 'use-default') return '__use_default__'
    if (w === 'admin-only') return '__admin_only__'
    if (w === null || (typeof w === 'object' && !(w.account?.trim()))) return ''
    return w.account
  })

  function onWhitelistSelectUpdate(value: WhitelistSettings | null | 'use-default' | 'admin-only') {
    if (value === 'use-default') {
      form.whitelist = 'use-default'
      return
    }
    if (value === 'admin-only') {
      form.whitelist = 'admin-only'
      return
    }
    if (value === null) {
      form.whitelist = null
      return
    }
    form.whitelist = value
  }

  const newMint = ref('')
  const newMintKind = ref<'auto' | 'SPL' | 'NFT'>('auto')
  const addMintError = ref('')
  const adding = ref(false)
  const newCurrencyMint = ref('')
  const newCurrencyKind = ref<'auto' | 'SPL' | 'NFT'>('auto')
  const addCurrencyError = ref('')
  const saving = ref(false)
  const saveError = ref<string | null>(null)
  const saveSuccess = ref(false)
  const selectedMint = ref<CatalogMintItem | null>(null)
  const showMintModal = ref(false)

  const metaByMint = ref<Map<string, { name?: string | null; symbol?: string | null; image?: string | null }>>(new Map())
  watch(
    () => [...form.collectionMints.map((c) => c.mint), ...form.splAssetMints.map((s) => s.mint)],
    async (mints) => {
      const unique = [...new Set(mints)]
      if (unique.length === 0) {
        metaByMint.value = new Map()
        return
      }
      const supabase = useSupabase()
      const { data } = await supabase
        .from('mint_metadata')
        .select('mint, name, symbol, image, decimals, seller_fee_basis_points, update_authority, uri, primary_sale_happened, is_mutable, edition_nonce, token_standard')
        .in('mint', unique)
      metaByMint.value = new Map((data ?? []).map((m) => [(m.mint as string), m]))
    },
    { immediate: true },
  )

  const catalogItems = computed<CatalogMintItem[]>(() => {
    const meta = metaByMint.value
    const enrich = <T extends { mint: string; name?: string; symbol?: string; image?: string; decimals?: number | null; sellerFeeBasisPoints?: number | null; updateAuthority?: string | null; uri?: string | null; primarySaleHappened?: boolean | null; isMutable?: boolean | null; editionNonce?: number | null; tokenStandard?: string | null }>(m: T) => {
      const fromMeta = meta.get(m.mint) as { name?: string; symbol?: string; image?: string; decimals?: number; seller_fee_basis_points?: number; update_authority?: string; uri?: string; primary_sale_happened?: boolean; is_mutable?: boolean; edition_nonce?: number; token_standard?: string } | undefined
      const name = m.name ?? fromMeta?.name ?? null
      const symbol = (m as { symbol?: string }).symbol ?? fromMeta?.symbol ?? null
      const image = m.image ?? fromMeta?.image ?? null
      const decimals = m.decimals ?? fromMeta?.decimals ?? null
      const sellerFeeBasisPoints = m.sellerFeeBasisPoints ?? fromMeta?.seller_fee_basis_points ?? null
      const updateAuthority = m.updateAuthority ?? fromMeta?.update_authority ?? null
      const uri = m.uri ?? fromMeta?.uri ?? null
      const primarySaleHappened = m.primarySaleHappened ?? fromMeta?.primary_sale_happened ?? null
      const isMutable = m.isMutable ?? fromMeta?.is_mutable ?? null
      const editionNonce = m.editionNonce ?? fromMeta?.edition_nonce ?? null
      const tokenStandard = m.tokenStandard ?? fromMeta?.token_standard ?? null
      return { ...m, name, symbol, image, decimals, sellerFeeBasisPoints, updateAuthority, uri, primarySaleHappened, isMutable, editionNonce, tokenStandard }
    }
    return [
      ...form.splAssetMints.map((m) => {
        const e = enrich({
          id: m.mint,
          mint: m.mint,
          kind: 'SPL' as const,
          label: '',
          symbol: m.symbol ?? null,
          image: m.image ?? null,
          decimals: m.decimals ?? null,
          sellerFeeBasisPoints: m.sellerFeeBasisPoints ?? null,
          updateAuthority: m.updateAuthority ?? null,
          uri: m.uri ?? null,
          primarySaleHappened: m.primarySaleHappened ?? null,
          isMutable: m.isMutable ?? null,
          editionNonce: m.editionNonce ?? null,
          tokenStandard: m.tokenStandard ?? null,
          _loading: m._loading,
          _error: m._error,
        })
        return { ...e, label: (e.name ?? e.symbol) || e.mint }
      }),
      ...form.collectionMints.map((m) => {
        const e = enrich({
          id: m.mint,
          mint: m.mint,
          kind: 'NFT' as const,
          label: '',
          image: m.image ?? null,
          sellerFeeBasisPoints: m.sellerFeeBasisPoints ?? null,
          updateAuthority: m.updateAuthority ?? null,
          uri: m.uri ?? null,
          primarySaleHappened: m.primarySaleHappened ?? null,
          isMutable: m.isMutable ?? null,
          editionNonce: m.editionNonce ?? null,
          tokenStandard: m.tokenStandard ?? null,
          traitTypes: m.traitTypes ?? null,
          _loading: m._loading,
          _error: m._error,
        })
        return { ...e, label: e.name || e.mint }
      }),
    ]
  })

  function onInspectMint(item: CatalogMintItem) {
    if (item._loading || item._error) return
    selectedMint.value = item
    showMintModal.value = true
  }

  function onDeleteMint(item: CatalogMintItem) {
    if (item.kind === 'NFT') {
      const idx = form.collectionMints.findIndex((m) => m.mint === item.mint)
      if (idx >= 0) form.collectionMints.splice(idx, 1)
    } else {
      const idx = form.splAssetMints.findIndex((m) => m.mint === item.mint)
      if (idx >= 0) form.splAssetMints.splice(idx, 1)
    }
  }

  async function addMint(mint: string, kind: 'auto' | 'SPL' | 'NFT', entry?: AddressBookEntry) {
    const trimmed = mint.trim()
    if (!trimmed || trimmed.length < 32) {
      addMintError.value = 'Invalid mint address'
      return
    }
    if (form.collectionMints.some((m) => m.mint === trimmed) || form.splAssetMints.some((m) => m.mint === trimmed)) {
      addMintError.value = 'Mint already added'
      return
    }
    if (totalMintsCount.value >= MARKETPLACE_UI_MINTS_CAP) {
      addMintError.value = `Maximum ${MARKETPLACE_UI_MINTS_CAP} mints (collections + SPL assets)`
      return
    }
    addMintError.value = ''
    adding.value = true
    try {
      if (entry) {
        const name = entry.name ?? entry.label ?? undefined
        const image = entry.image ?? undefined
        if (entry.kind === 'NFT') {
          form.collectionMints.push({
            mint: trimmed,
            name,
            image,
            collectionSize: entry.collectionSize ?? 0,
            uniqueTraitCount: entry.uniqueTraitCount ?? 0,
            traitTypes: [],
          })
        } else {
          form.splAssetMints.push({ mint: trimmed, name, symbol: entry.symbol ?? undefined, image })
        }
        newMint.value = ''
        newMintKind.value = 'auto'
        return
      }

      let rows: CatalogEntry[]
      try {
        rows = await tenantCatalog.list()
      } catch (e) {
        addMintError.value = e instanceof Error ? e.message : 'Failed to load Address book'
        return
      }
      const row = rows.find((r) => r.mint === trimmed)
      if (!row) {
        addMintError.value = 'Add this mint in Address book first (Admin → Address book).'
        return
      }
      const effectiveKind = kind === 'auto' ? row.kind : kind
      if (effectiveKind !== row.kind) {
        addMintError.value =
          row.kind === 'NFT'
            ? 'This mint is an NFT collection in your Address book. Choose NFT or Auto-detect.'
            : 'This mint is an SPL token in your Address book. Choose SPL or Auto-detect.'
        return
      }
      if (row.kind === 'NFT') {
        form.collectionMints.push({
          mint: trimmed,
          name: row.name ?? row.label ?? undefined,
          image: row.image ?? undefined,
          collectionSize: row.collectionSize ?? 0,
          uniqueTraitCount: row.uniqueTraitCount ?? 0,
          traitTypes: [],
        })
      } else {
        form.splAssetMints.push({
          mint: trimmed,
          name: row.name ?? row.label ?? undefined,
          symbol: row.symbol ?? undefined,
          image: row.image ?? undefined,
          decimals: row.decimals ?? null,
        })
      }
      newMint.value = ''
      newMintKind.value = 'auto'
    } catch (e) {
      addMintError.value = e instanceof Error ? e.message : 'Failed to resolve mint'
    } finally {
      adding.value = false
    }
  }

  async function fillMissingCollectionCounts() {
    let byMint = new Map<string, CatalogEntry>()
    try {
      const rows = await tenantCatalog.list()
      byMint = new Map(rows.map((r) => [r.mint, r]))
    } catch { /* ignore */ }
    const supabase = useSupabase()
    for (let i = 0; i < form.collectionMints.length; i++) {
      const m = form.collectionMints[i]
      if (m._loading || m._error || (m.collectionSize != null && m.collectionSize > 0)) continue
      const cat = byMint.get(m.mint)
      if (cat?.kind === 'NFT' && (cat.collectionSize ?? 0) > 0) {
        const existing = form.collectionMints[i]
        if (existing?.mint === m.mint) {
          existing.collectionSize = cat.collectionSize ?? 0
          existing.uniqueTraitCount = cat.uniqueTraitCount ?? 0
        }
        continue
      }
      try {
        const d = await invokeEdgeFunction<{ collectionSize?: number; uniqueTraitCount?: number; traitTypes?: string[] }>(
          supabase,
          'marketplace',
          { action: 'collection-preview', mint: m.mint },
        )
        if (!d) continue
        const existing = form.collectionMints[i]
        if (existing && existing.mint === m.mint) {
          existing.collectionSize = d.collectionSize ?? 0
          existing.uniqueTraitCount = d.uniqueTraitCount ?? 0
          existing.traitTypes = d.traitTypes ?? []
        }
      } catch { /* ignore per-mint errors */ }
    }
  }

  watch(
    () => settings(),
    (s) => {
      if (!s) return
      const cm = (s.collectionMints as Array<{ mint: string; name?: string; image?: string; sellerFeeBasisPoints?: number; updateAuthority?: string; uri?: string; primarySaleHappened?: boolean; isMutable?: boolean; editionNonce?: number; tokenStandard?: string; groupPath?: string[]; collectionSize?: number; uniqueTraitCount?: number; traitTypes?: string[] }>) ?? []
      form.collectionMints = cm.map((m) => ({
        mint: m.mint ?? '',
        name: m.name,
        image: m.image,
        sellerFeeBasisPoints: m.sellerFeeBasisPoints,
        updateAuthority: m.updateAuthority,
        uri: m.uri,
        primarySaleHappened: m.primarySaleHappened,
        isMutable: m.isMutable,
        editionNonce: m.editionNonce,
        tokenStandard: m.tokenStandard,
        groupPath: m.groupPath,
        collectionSize: m.collectionSize,
        uniqueTraitCount: m.uniqueTraitCount,
        traitTypes: m.traitTypes,
      }))
      const spl = (s.splAssetMints as Array<{ mint: string; name?: string; symbol?: string; image?: string; decimals?: number | null; sellerFeeBasisPoints?: number | null; updateAuthority?: string; uri?: string; primarySaleHappened?: boolean; isMutable?: boolean; editionNonce?: number; tokenStandard?: string }>) ?? []
      form.splAssetMints = spl.map((m) => ({
        mint: m.mint ?? '',
        name: m.name,
        symbol: m.symbol,
        image: m.image,
        decimals: m.decimals,
        sellerFeeBasisPoints: m.sellerFeeBasisPoints,
        updateAuthority: m.updateAuthority,
        uri: m.uri,
        primarySaleHappened: m.primarySaleHappened,
        isMutable: m.isMutable,
        editionNonce: m.editionNonce,
        tokenStandard: m.tokenStandard,
      }))
      const cmu = (s.currencyMints as CurrencyMint[]) ?? []
      form.currencyMints = cmu.map((c) => ({ ...c, _loading: false, _error: undefined }))
      const sf = s.shopFee as Partial<ShopFee> | undefined
      if (sf) {
        form.shopFee.wallet = sf.wallet ?? ''
        form.shopFee.makerFlatFee = Number(sf.makerFlatFee) || 0
        form.shopFee.takerFlatFee = Number(sf.takerFlatFee) || 0
        form.shopFee.makerPercentFee = Number(sf.makerPercentFee) || 0
        form.shopFee.takerPercentFee = Number(sf.takerPercentFee) || 0
      }
      const wl = s.gate as Partial<WhitelistSettings> | undefined | null | 'use-default' | 'admin-only' | 'public'
      if (wl === undefined || wl === 'use-default') {
        form.whitelist = 'use-default'
      } else if (wl === 'admin-only') {
        form.whitelist = 'admin-only'
      } else if (wl === null || wl === 'public' || (typeof wl === 'object' && !(wl.account?.trim()))) {
        form.whitelist = null
      } else {
        form.whitelist = {
          programId: (wl.programId as string) || DEFAULT_WHITELIST.programId,
          account: (wl.account as string) ?? '',
        }
      }
      nextTick(() => fillMissingCollectionCounts())
    },
    { immediate: true }
  )

  function onBaseToggle(symbol: string, checked: boolean) {
    const base = BASE_CURRENCY_MINTS.find((b) => b.symbol === symbol)
    if (!base) return
    if (checked) {
      if (!form.currencyMints.some((c) => c.mint === base.mint)) {
        form.currencyMints = [...form.currencyMints, base]
      }
    } else {
      form.currencyMints = form.currencyMints.filter((c) => c.mint !== base.mint)
    }
  }

  async function addCurrencyFromInput(mint: string, kind: 'auto' | 'SPL' | 'NFT', entry?: AddressBookEntry) {
    const trimmed = mint.trim()
    if (!trimmed || trimmed.length < 32) {
      addCurrencyError.value = 'Invalid mint address'
      return
    }
    const entryKind = entry?.kind
    if (kind === 'NFT' || entryKind === 'NFT') {
      addCurrencyError.value = 'Only SPL tokens can be used as a currency'
      return
    }
    const baseMints = new Set(BASE_CURRENCY_MINTS.map((b) => b.mint))
    if (baseMints.has(trimmed)) {
      addCurrencyError.value = 'Already in base currencies'
      return
    }
    if (form.currencyMints.some((c) => c.mint === trimmed)) {
      addCurrencyError.value = 'Currency already added'
      return
    }
    addCurrencyError.value = ''
    const item: CurrencyMint = {
      mint: trimmed,
      name: '',
      symbol: '',
      _loading: true,
    }
    form.currencyMints.push(item)
    newCurrencyMint.value = ''
    newCurrencyKind.value = 'auto'
    const idx = form.currencyMints.length - 1
    try {
      const supabase = useSupabase()
      const d = await invokeEdgeFunction<{ name?: string; symbol?: string; image?: string; decimals?: number; sellerFeeBasisPoints?: number }>(
        supabase,
        'marketplace',
        { action: 'spl-preview', mint: trimmed },
      )
      form.currencyMints[idx] = { mint: trimmed, name: d.name ?? '', symbol: d.symbol ?? '', image: d.image ?? undefined, decimals: d.decimals ?? undefined, sellerFeeBasisPoints: d.sellerFeeBasisPoints ?? undefined }
    } catch (e) {
      form.currencyMints[idx] = { ...item, _loading: false, _error: e instanceof Error ? e.message : 'Failed to load' }
    }
  }

  function removeCustomCurrency(idx: number) {
    const baseMints = new Set(BASE_CURRENCY_MINTS.map((b) => b.mint))
    const custom = form.currencyMints.filter((c) => !baseMints.has(c.mint))
    const removed = custom[idx]
    if (removed) {
      const i = form.currencyMints.indexOf(removed)
      if (i >= 0) form.currencyMints.splice(i, 1)
    }
  }

  function buildPayload(): Record<string, unknown> {
    return {
      collectionMints: form.collectionMints
        .filter((m) => !m._error)
        .map((m) => ({
          mint: m.mint,
          name: m.name,
          image: m.image,
          sellerFeeBasisPoints: m.sellerFeeBasisPoints,
          updateAuthority: m.updateAuthority,
          uri: m.uri,
          primarySaleHappened: m.primarySaleHappened,
          isMutable: m.isMutable,
          editionNonce: m.editionNonce,
          tokenStandard: m.tokenStandard,
          groupPath: m.groupPath,
          collectionSize: m.collectionSize,
          uniqueTraitCount: m.uniqueTraitCount,
          traitTypes: m.traitTypes,
        })),
      splAssetMints: form.splAssetMints
        .filter((m) => !m._error)
        .map((m) => ({
          mint: m.mint,
          name: m.name,
          symbol: m.symbol,
          decimals: m.decimals,
          image: m.image,
          sellerFeeBasisPoints: m.sellerFeeBasisPoints,
          updateAuthority: m.updateAuthority,
          uri: m.uri,
          primarySaleHappened: m.primarySaleHappened,
          isMutable: m.isMutable,
          editionNonce: m.editionNonce,
          tokenStandard: m.tokenStandard,
        })),
      currencyMints: form.currencyMints
        .filter((c) => !('_error' in c && c._error))
        .map((c) => ({ mint: c.mint, name: c.name ?? '', symbol: c.symbol ?? '', decimals: c.decimals, image: c.image, sellerFeeBasisPoints: c.sellerFeeBasisPoints })),
      shopFee: form.shopFee,
      gate: form.whitelist === 'use-default' ? 'use-default' : (form.whitelist === 'admin-only' ? 'admin-only' : (form.whitelist === null ? 'public' : form.whitelist)),
    }
  }

  async function save(): Promise<boolean> {
    if (!slug() || !canSave.value) return false
    saving.value = true
    emitSaving(true)
    saveError.value = null
    saveSuccess.value = false
    try {
      const payload = buildPayload()
      const supabase = useSupabase()
      const settingsForDb = { ...payload }
      delete (settingsForDb as Record<string, unknown>).currencyMints
      const { error } = await supabase
        .from('marketplace_settings')
        .upsert({ tenant_id: tenantId.value, settings: settingsForDb, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })
      if (error) throw new Error(error.message)

      const currencies = (payload.currencyMints as Array<{ mint: string }>) ?? []
      const { error: delErr } = await supabase.from('marketplace_currencies').delete().eq('tenant_id', tenantId.value)
      if (delErr) throw new Error(delErr.message)
      if (currencies.length > 0) {
        const { error: insErr } = await supabase.from('marketplace_currencies').insert(currencies.map((c) => ({ tenant_id: tenantId.value, mint: c.mint })))
        if (insErr) throw new Error(insErr.message)
      }

      const colls = (payload.collectionMints as Array<{ mint: string }>) ?? []
      const spls = (payload.splAssetMints as Array<{ mint: string }>) ?? []
      if (colls.length || spls.length || currencies.length) {
        try {
          await invokeEdgeFunction(supabase, 'marketplace', {
            action: 'scope-sync',
            tenantId: tenantId.value,
            collectionMints: colls,
            splAssetMints: spls,
            currencyMints: currencies,
          })
          if (colls.length > 0) {
            for (const c of colls) {
              try {
                await invokeEdgeFunction(supabase, 'marketplace', {
                  action: 'scope-expand',
                  tenantId: tenantId.value,
                  collectionMint: c.mint,
                })
              } catch { /* ignore per collection */ }
            }
          }
        } catch { /* ignore sync failures; DB state still saved */ }
      }

      saveSuccess.value = true
      setTimeout(() => { saveSuccess.value = false }, 3000)
      emit('saved', payload)
      return true
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        saveError.value = 'Request timed out. Check the server and try again.'
      } else {
        saveError.value = e instanceof Error ? e.message : 'Failed to save'
      }
      return false
    } finally {
      saving.value = false
      emitSaving(false)
    }
  }

  return {
    form,
    catalogItems,
    customCurrencies,
    canSave,
    marketplaceGateSelectValue,
    marketplaceWhitelistSelectValue,
    newMint,
    newMintKind,
    addMintError,
    adding,
    newCurrencyMint,
    newCurrencyKind,
    addCurrencyError,
    saving,
    saveError,
    saveSuccess,
    selectedMint,
    showMintModal,
    onGateSelectUpdate: onWhitelistSelectUpdate,
    onWhitelistSelectUpdate,
    onInspectMint,
    onDeleteMint,
    addMint,
    onBaseToggle,
    addCurrencyFromInput,
    removeCustomCurrency,
    save,
  }
}
