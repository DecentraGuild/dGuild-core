import { isBaseCurrencyMint, getModuleGateFromTenant } from '@decentraguild/core'
import type { MarketplaceGateSettings } from '@decentraguild/core'
import { invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantStore } from '~/stores/tenant'
import type { SubscriptionInfo, WatchtowerSubscriptionByScope } from './useAdminSubscriptions'

interface MintRow {
  mint: string
  kind: string
  label: string | null
  name: string | null
  image: string | null
}

interface WatchRow {
  mint: string
  track_holders: boolean
  track_snapshot: boolean
  track_transactions: boolean
  enabled_at_holders: string | null
  enabled_at_snapshot: string | null
  enabled_at_transactions: string | null
}

export function useAdminWatchtowerScope(
  subscription: Ref<WatchtowerSubscriptionByScope | SubscriptionInfo | null>,
) {
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId)
  const tenant = computed(() => tenantStore.tenant)

  const loading = ref(true)
  const localSaveError = ref<string | null>(null)
  const mints = ref<MintRow[]>([])
  const watches = ref<WatchRow[]>([])

  const mintsSpl = computed(() => mints.value.filter((m) => m.kind === 'SPL'))
  const mintsNft = computed(() => mints.value.filter((m) => m.kind === 'NFT'))

  const watchesByMint = computed(() => {
    const map: Record<string, WatchRow> = {}
    for (const w of watches.value) map[w.mint] = w
    return map
  })

  const liveConditions = computed(() => {
    let mints_current = 0, mints_snapshot = 0, mints_transactions = 0
    for (const w of watches.value) {
      if (w.track_holders) mints_current++
      if (w.track_snapshot) mints_snapshot++
      if (w.track_transactions) mints_transactions++
    }
    return { mints_current, mints_snapshot, mints_transactions }
  })

  const byScope = computed((): WatchtowerSubscriptionByScope | null => {
    const sub = subscription.value
    if (!sub || typeof (sub as SubscriptionInfo).periodEnd === 'string') return null
    return sub as WatchtowerSubscriptionByScope
  })

  const storedConditionsSnapshot = computed((): { mints_current: number; mints_snapshot: number; mints_transactions: number } | null => {
    const scope = byScope.value
    if (!scope) return null
    return {
      mints_current: scope.mints_current?.conditionsSnapshot?.mints_current ?? 0,
      mints_snapshot: scope.mintsSnapshot?.conditionsSnapshot?.mintsSnapshot ?? 0,
      mints_transactions: scope.mints_transactions?.conditionsSnapshot?.mints_transactions ?? 0,
    }
  })

  const showGraceHint = computed(() => {
    const live = liveConditions.value
    const stored = storedConditionsSnapshot.value
    if (!stored) return live.mints_current > 0 || live.mints_snapshot > 0 || live.mints_transactions > 0
    return live.mints_current > stored.mints_current || live.mints_snapshot > stored.mints_snapshot || live.mints_transactions > stored.mints_transactions
  })

  const widgetSubscription = computed((): SubscriptionInfo | null => {
    const scope = byScope.value
    if (!scope || Object.keys(scope).length === 0) return null
    const subs = Object.values(scope).filter((s) => s.periodEnd && new Date(s.periodEnd) > new Date())
    if (subs.length === 0) return null
    const earliest = subs.reduce((a, b) => (new Date(a.periodEnd) < new Date(b.periodEnd) ? a : b))
    const totalRecurring = subs.reduce((sum, s) => sum + (s.recurringAmountUsdc ?? 0), 0)
    return { billingPeriod: earliest.billingPeriod, periodEnd: earliest.periodEnd, recurringAmountUsdc: totalRecurring, selectedTierId: earliest.selectedTierId }
  })

  // Gate management
  const initialGateStr = ref<string | null>(null)

  const gateFormValue = computed((): MarketplaceGateSettings | null | 'use-default' | 'admin-only' => {
    const sj = tenant.value?.modules?.watchtower?.settingsjson as Record<string, unknown> | undefined
    const v = sj?.gate
    if (v === undefined || v === null) return 'use-default'
    if (typeof v === 'string' && v === 'admin-only') return 'admin-only'
    if (typeof v === 'object' && (v as { account?: string }).account) return v as MarketplaceGateSettings
    return null
  })

  function gateToCompareStr(v: MarketplaceGateSettings | null | 'use-default' | 'admin-only'): string {
    if (v === 'use-default') return '__use_default__'
    if (v === 'admin-only') return '__admin_only__'
    return (v && typeof v === 'object' ? v.account : null) ?? ''
  }

  const gateDirty = computed(() => gateToCompareStr(gateFormValue.value) !== (initialGateStr.value ?? ''))
  const savingGate = ref(false)
  const gateSaveSuccess = ref(false)
  const gateSaveError = ref<string | null>(null)

  function onGateUpdate(value: MarketplaceGateSettings | null | 'use-default' | 'admin-only') {
    const t = tenant.value
    if (!t) return
    const prev = t.modules ?? {}
    const wt = prev.watchtower ?? {}
    const sj = (wt.settingsjson ?? {}) as Record<string, unknown>
    const newGate = value === 'use-default' ? undefined : value
    tenantStore.setTenant({ ...t, modules: { ...prev, watchtower: { ...wt, settingsjson: { ...sj, gate: newGate } } } })
  }

  async function saveGate(): Promise<boolean> {
    const id = tenantId.value
    if (!id) return false
    savingGate.value = true; gateSaveError.value = null; gateSaveSuccess.value = false
    try {
      const prev = tenant.value?.modules ?? {}
      const wt = prev.watchtower ?? {}
      const sj = (wt.settingsjson ?? {}) as Record<string, unknown>
      const v = gateFormValue.value
      const gateVal = v === 'use-default' ? undefined : (v ?? null)
      const modules = { ...prev, watchtower: { ...wt, settingsjson: { ...sj, gate: gateVal } } }
      const supabase = useSupabase()
      const { error } = await supabase.from('tenant_config').update({ modules, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw new Error(error.message)
      initialGateStr.value = gateToCompareStr(v)
      gateSaveSuccess.value = true
      return true
    } catch (e) {
      gateSaveError.value = e instanceof Error ? e.message : 'Failed to save'
      return false
    } finally { savingGate.value = false }
  }

  async function fetchData() {
    const id = tenantId.value
    if (!id) return
    loading.value = true; localSaveError.value = null
    try {
      const supabase = useSupabase()
      const catalogRes = await supabase.from('tenant_mint_catalog').select('mint, kind, label').eq('tenant_id', id)
      if (catalogRes.error) throw new Error(catalogRes.error.message)
      const catalogRows = catalogRes.data ?? []
      const catalogMints = catalogRows.map((r) => r.mint as string)

      const [watchesRes, metaData] = await Promise.all([
        supabase.from('watchtower_watches').select('mint, track_holders, track_snapshot, track_transactions, enabled_at_holders, enabled_at_snapshot, enabled_at_transactions').eq('tenant_id', id),
        catalogMints.length > 0
          ? supabase.from('mint_metadata').select('mint, name, image').in('mint', catalogMints).then((r) => r.data ?? [])
          : Promise.resolve([] as Array<{ mint: string; name: string | null; image: string | null }>),
      ])
      if (watchesRes.error) throw new Error(watchesRes.error.message)
      const metaByMint = new Map<string, { name: string | null; image: string | null }>(
        metaData.map((m) => [m.mint, { name: m.name, image: m.image }])
      )
      mints.value = catalogRows
        .filter((r) => !isBaseCurrencyMint(r.mint as string))
        .map((r) => {
          const meta = metaByMint.get(r.mint as string)
          return { mint: r.mint as string, kind: r.kind as string, label: r.label as string | null, name: meta?.name ?? null, image: meta?.image ?? null }
        })
      watches.value = (watchesRes.data ?? []).map((r) => ({
        mint: r.mint as string,
        track_holders: Boolean(r.track_holders),
        track_snapshot: Boolean(r.track_snapshot),
        track_transactions: Boolean(r.track_transactions),
        enabled_at_holders: (r.enabled_at_holders as string) ?? null,
        enabled_at_snapshot: (r.enabled_at_snapshot as string) ?? null,
        enabled_at_transactions: (r.enabled_at_transactions as string) ?? null,
      }))
      const gateVal = getModuleGateFromTenant(tenant.value, 'watchtower')
      initialGateStr.value =
        gateVal === undefined
          ? '__use_default__'
          : gateVal && typeof gateVal === 'object' && gateVal.account?.trim()
            ? gateVal.account
            : null
    } catch (e) {
      localSaveError.value = e instanceof Error ? e.message : 'Failed to load'
    } finally { loading.value = false }
  }

  function peerMinEnabledAt(mint: string, field: 'track_holders' | 'track_snapshot' | 'track_transactions'): string | null {
    const enabledKey = field === 'track_holders' ? 'enabled_at_holders' : field === 'track_snapshot' ? 'enabled_at_snapshot' : 'enabled_at_transactions'
    const trackKey = field === 'track_holders' ? 'track_holders' : field === 'track_snapshot' ? 'track_snapshot' : 'track_transactions'
    let best: string | null = null
    for (const w of watches.value) {
      if (w.mint === mint) continue
      if (!w[trackKey]) continue
      const t = w[enabledKey]
      if (typeof t === 'string' && t && (!best || t < best)) best = t
    }
    return best
  }

  function onTrackChange(mint: string, field: 'track_holders' | 'track_snapshot' | 'track_transactions', value: boolean) {
    const existing = watchesByMint.value[mint]
    const now = new Date().toISOString()
    const next: WatchRow = {
      mint,
      track_holders: field === 'track_holders' ? value : (existing?.track_holders ?? false),
      track_snapshot: field === 'track_snapshot' ? value : (existing?.track_snapshot ?? false),
      track_transactions: field === 'track_transactions' ? value : (existing?.track_transactions ?? false),
      enabled_at_holders: field === 'track_holders' && value ? (existing?.enabled_at_holders ?? peerMinEnabledAt(mint, 'track_holders') ?? now) : (existing?.enabled_at_holders ?? null),
      enabled_at_snapshot: field === 'track_snapshot' && value ? (existing?.enabled_at_snapshot ?? peerMinEnabledAt(mint, 'track_snapshot') ?? now) : (existing?.enabled_at_snapshot ?? null),
      enabled_at_transactions: field === 'track_transactions' && value ? (existing?.enabled_at_transactions ?? peerMinEnabledAt(mint, 'track_transactions') ?? now) : (existing?.enabled_at_transactions ?? null),
    }
    const idx = watches.value.findIndex((w) => w.mint === mint)
    if (idx >= 0) watches.value = [...watches.value.slice(0, idx), next, ...watches.value.slice(idx + 1)]
    else watches.value = [...watches.value, next]
  }

  async function saveWatches(): Promise<boolean> {
    const id = tenantId.value
    if (!id) return false
    localSaveError.value = null
    try {
      const supabase = useSupabase()
      const now = new Date().toISOString()
      for (const w of watches.value) {
        const payload = { tenant_id: id, mint: w.mint, track_holders: w.track_holders, track_snapshot: w.track_snapshot, track_transactions: w.track_transactions, enabled_at_holders: w.enabled_at_holders, enabled_at_snapshot: w.enabled_at_snapshot, enabled_at_transactions: w.enabled_at_transactions, updated_at: now }
        await supabase.from('watchtower_watches').upsert(payload, { onConflict: 'tenant_id,mint' })
        if (w.track_holders || w.track_snapshot) {
          try {
            try {
              await invokeEdgeFunction(supabase, 'cron-tracker', { mode: 'full', syncMint: w.mint, tenantId: id })
            } catch { /* best-effort; pg_cron will sync on schedule */ }
          } catch { /* network/timeout; pg_cron will sync */ }
        }
      }
      return true
    } catch (e) {
      localSaveError.value = e instanceof Error ? e.message : 'Failed to save'
      return false
    }
  }

  onMounted(fetchData)

  return {
    loading, localSaveError, mints, watches,
    mintsSpl, mintsNft, watchesByMint, liveConditions,
    storedConditionsSnapshot, showGraceHint, widgetSubscription,
    gateFormValue, gateDirty, savingGate, gateSaveSuccess, gateSaveError,
    onGateUpdate, saveGate, onTrackChange, saveWatches,
  }
}
