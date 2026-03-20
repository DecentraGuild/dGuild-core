<template>
  <div class="admin__split">
    <div class="admin__panel">
      <Card>
        <GateSelectRowModule
          layout="stacked"
          :slug="slug"
          :model-value="gateFormValue"
          title="Who can see Watchtower"
          hint="Who can see Watchtower. Use dGuild default, admins only, public, or a specific list."
          show-use-default
          show-admin-only
          show-save
          save-label="Save"
          :dirty="gateDirty"
          :loading="savingGate"
          :save-success="gateSaveSuccess"
          :save-error="gateSaveError"
          @update:model-value="onGateUpdate"
          @save="saveGate"
        />
        <h3>Watchtower</h3>
        <p class="watchtower-tab__hint">
          Enable tracking per mint. Current holders: short refresh rate for conditions, shipment, Discord. Snapshot: daily holder snapshots. Transactions track is coming soon.
        </p>

        <div v-if="loading" class="watchtower-tab__loading">
          <Icon icon="lucide:loader-2" class="watchtower-tab__spinner" />
          Loading...
        </div>

        <template v-else>
          <p v-if="!mints.length" class="watchtower-tab__empty">
            Add mints in Admin > Address Book first.
          </p>
          <template v-else>
            <section v-if="mintsSpl.length" class="watchtower-tab__section">
              <h4 class="watchtower-tab__section-title">SPL tokens</h4>
              <ul class="watchtower-tab__list">
                <li
                  v-for="mint in mintsSpl"
                  :key="mint.mint"
                  class="watchtower-tab__item"
                >
                  <div class="watchtower-tab__item-info">
                    <span class="watchtower-tab__item-name">{{ mint.name ?? mint.label ?? truncateAddress(mint.mint, 8, 6) }}</span>
                    <code class="watchtower-tab__item-addr">{{ truncateAddress(mint.mint, 8, 6) }}</code>
                  </div>
                  <div class="watchtower-tab__item-tracks">
                    <label class="watchtower-tab__check">
                      <input
                        type="checkbox"
                        :checked="watchesByMint[mint.mint]?.track_holders ?? false"
                        @change="onTrackChange(mint.mint, 'track_holders', ($event.target as HTMLInputElement).checked)"
                      />
                      <span>Current holders</span>
                    </label>
                    <label class="watchtower-tab__check">
                      <input
                        type="checkbox"
                        :checked="watchesByMint[mint.mint]?.track_snapshot ?? false"
                        @change="onTrackChange(mint.mint, 'track_snapshot', ($event.target as HTMLInputElement).checked)"
                      />
                      <span>Snapshot</span>
                    </label>
                    <label class="watchtower-tab__check watchtower-tab__check--disabled" title="Coming soon">
                      <input type="checkbox" :checked="false" disabled />
                      <span>Transactions</span>
                    </label>
                  </div>
                </li>
              </ul>
            </section>
            <section v-if="mintsNft.length" class="watchtower-tab__section">
              <h4 class="watchtower-tab__section-title">NFT collections</h4>
              <ul class="watchtower-tab__list">
                <li
                  v-for="mint in mintsNft"
                  :key="mint.mint"
                  class="watchtower-tab__item"
                >
                  <div class="watchtower-tab__item-info">
                    <span class="watchtower-tab__item-name">{{ mint.name ?? mint.label ?? truncateAddress(mint.mint, 8, 6) }}</span>
                    <code class="watchtower-tab__item-addr">{{ truncateAddress(mint.mint, 8, 6) }}</code>
                  </div>
                  <div class="watchtower-tab__item-tracks">
                    <label class="watchtower-tab__check">
                      <input
                        type="checkbox"
                        :checked="watchesByMint[mint.mint]?.track_holders ?? false"
                        @change="onTrackChange(mint.mint, 'track_holders', ($event.target as HTMLInputElement).checked)"
                      />
                      <span>Current holders</span>
                    </label>
                    <label class="watchtower-tab__check">
                      <input
                        type="checkbox"
                        :checked="watchesByMint[mint.mint]?.track_snapshot ?? false"
                        @change="onTrackChange(mint.mint, 'track_snapshot', ($event.target as HTMLInputElement).checked)"
                      />
                      <span>Snapshot</span>
                    </label>
                    <label class="watchtower-tab__check watchtower-tab__check--disabled" title="Coming soon">
                      <input type="checkbox" :checked="false" disabled />
                      <span>Transactions</span>
                    </label>
                  </div>
                </li>
              </ul>
            </section>
          </template>
          <div v-if="localSaveError" class="watchtower-tab__error">{{ localSaveError }}</div>
          <p v-else-if="showGraceHint" class="watchtower-tab__grace-hint">
            Deploy and pay for the new tracks to make them active for members.
          </p>
          <p class="watchtower-tab__save-hint">
            Changes are saved when you click Save in the pricing widget.
          </p>
        </template>
      </Card>
    </div>

    <AdminPricingWidget
      module-id="watchtower"
      :module-state="moduleState"
      :conditions="liveConditions"
      :stored-conditions="storedConditionsSnapshot"
      :subscription="widgetSubscription"
      :saving="saving"
      :deploying="deploying"
      :save-error="saveError"
      @save="(p: BillingPeriod, c?: Record<string, number>) => emit('save', p, c)"
      @deploy="(p: BillingPeriod, c?: Record<string, number>) => emit('deploy', p, c)"
      @reactivate="(p: BillingPeriod) => emit('reactivate', p)"
    />
  </div>
</template>

<script setup lang="ts">
import { truncateAddress } from '@decentraguild/display'
import { isBaseCurrencyMint, getModuleGateFromTenant } from '@decentraguild/core'
import { Icon } from '@iconify/vue'
import { Card } from '~/components/ui/card'
import type { ModuleState } from '@decentraguild/core'
import type { BillingPeriod } from '@decentraguild/billing'
import type { MarketplaceGateSettings } from '@decentraguild/core'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantStore } from '~/stores/tenant'
import AdminPricingWidget from '~/components/admin/AdminPricingWidget.vue'
import type { SubscriptionInfo, WatchtowerSubscriptionByScope } from '~/composables/admin/useAdminSubscriptions'

const props = defineProps<{
  slug: string
  moduleState: ModuleState
  subscription: WatchtowerSubscriptionByScope | SubscriptionInfo | null
  saving: boolean
  deploying: boolean
  saveError: string | null
}>()

const emit = defineEmits<{
  save: [period: BillingPeriod]
  deploy: [period: BillingPeriod]
  reactivate: [period: BillingPeriod]
}>()

const tenantStore = useTenantStore()
const tenantId = computed(() => tenantStore.tenantId)
const tenant = computed(() => tenantStore.tenant)

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

const initialGateStr = ref<string | null>(null)
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
  tenantStore.setTenant({
    ...t,
    modules: {
      ...prev,
      watchtower: { ...wt, settingsjson: { ...sj, gate: newGate } },
    },
  })
}

async function saveGate(): Promise<boolean> {
  const id = tenantId.value
  if (!id) return false
  savingGate.value = true
  gateSaveError.value = null
  gateSaveSuccess.value = false
  try {
    const prev = tenant.value?.modules ?? {}
    const wt = prev.watchtower ?? {}
    const sj = (wt.settingsjson ?? {}) as Record<string, unknown>
    const v = gateFormValue.value
    const gateVal = v === 'use-default' ? undefined : (v ?? null)

    const modules = {
      ...prev,
      watchtower: { ...wt, settingsjson: { ...sj, gate: gateVal } },
    }

    const supabase = useSupabase()
    const { error } = await supabase
      .from('tenant_config')
      .update({ modules, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw new Error(error.message)

    initialGateStr.value = gateToCompareStr(v)
    gateSaveSuccess.value = true
    return true
  } catch (e) {
    gateSaveError.value = e instanceof Error ? e.message : 'Failed to save'
    return false
  } finally {
    savingGate.value = false
  }
}

const loading = ref(true)
const localSaveError = ref<string | null>(null)

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

const mints = ref<MintRow[]>([])
const watches = ref<WatchRow[]>([])

const mintsSpl = computed(() => mints.value.filter((m) => m.kind === 'SPL'))
const mintsNft = computed(() => mints.value.filter((m) => m.kind === 'NFT'))

const storedConditionsSnapshot = computed((): { mints_current: number; mints_snapshot: number; mints_transactions: number } | null => {
  const scope = byScope.value
  if (!scope) return null
  return {
    mints_current: scope.mints_current?.conditionsSnapshot?.mints_current ?? 0,
    mints_snapshot: scope.mintsSnapshot?.conditionsSnapshot?.mintsSnapshot ?? 0,
    mints_transactions: scope.mints_transactions?.conditionsSnapshot?.mints_transactions ?? 0,
  }
})

const watchesByMint = computed(() => {
  const map: Record<string, WatchRow> = {}
  for (const w of watches.value) {
    map[w.mint] = w
  }
  return map
})

const liveConditions = computed(() => {
  let mints_current = 0
  let mints_snapshot = 0
  let mints_transactions = 0
  for (const w of watches.value) {
    if (w.track_holders) mints_current++
    if (w.track_snapshot) mints_snapshot++
    if (w.track_transactions) mints_transactions++
  }
  return { mints_current, mints_snapshot, mints_transactions }
})

const byScope = computed((): WatchtowerSubscriptionByScope | null => {
  const sub = props.subscription
  if (!sub || typeof (sub as SubscriptionInfo).periodEnd === 'string') return null
  return sub as WatchtowerSubscriptionByScope
})

function isTrackActive(scopeKey: string): boolean {
  const sub = byScope.value?.[scopeKey]
  if (!sub?.periodEnd) return false
  try {
    return new Date(sub.periodEnd) > new Date()
  } catch {
    return false
  }
}

function entitledForTrack(scopeKey: string): number {
  const sub = byScope.value?.[scopeKey]
  if (!sub || !isTrackActive(scopeKey)) return 0
  const cond = sub.conditionsSnapshot ?? {}
  return (Number(cond[scopeKey]) || 0)
}

const _trackLimits = computed(() => ({
  track_holders: { entitled: entitledForTrack('mints_current'), active: isTrackActive('mints_current') },
  track_snapshot: { entitled: entitledForTrack('mintsSnapshot'), active: isTrackActive('mintsSnapshot') },
  track_transactions: { entitled: entitledForTrack('mints_transactions'), active: isTrackActive('mints_transactions') },
}))

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
  return {
    billingPeriod: earliest.billingPeriod,
    periodEnd: earliest.periodEnd,
    recurringAmountUsdc: totalRecurring,
    selectedTierId: earliest.selectedTierId,
  }
})

async function fetchData() {
  const id = tenantId.value
  if (!id) return
  loading.value = true
  localSaveError.value = null
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
        return {
          mint: r.mint as string,
          kind: r.kind as string,
          label: r.label as string | null,
          name: meta?.name ?? null,
          image: meta?.image ?? null,
        }
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
  } finally {
    loading.value = false
  }
}

function onTrackChange(mint: string, field: 'track_holders' | 'track_snapshot' | 'track_transactions', value: boolean) {
  const existing = watchesByMint.value[mint]
  const now = new Date().toISOString()
  const next: WatchRow = {
    mint,
    track_holders: field === 'track_holders' ? value : (existing?.track_holders ?? false),
    track_snapshot: field === 'track_snapshot' ? value : (existing?.track_snapshot ?? false),
    track_transactions: field === 'track_transactions' ? value : (existing?.track_transactions ?? false),
    enabled_at_holders: field === 'track_holders' && value ? (existing?.enabled_at_holders ?? now) : (existing?.enabled_at_holders ?? null),
    enabled_at_snapshot: field === 'track_snapshot' && value ? (existing?.enabled_at_snapshot ?? now) : (existing?.enabled_at_snapshot ?? null),
    enabled_at_transactions: field === 'track_transactions' && value ? (existing?.enabled_at_transactions ?? now) : (existing?.enabled_at_transactions ?? null),
  }
  const idx = watches.value.findIndex((w) => w.mint === mint)
  if (idx >= 0) {
    watches.value = [...watches.value.slice(0, idx), next, ...watches.value.slice(idx + 1)]
  } else {
    watches.value = [...watches.value, next]
  }
}

async function saveWatches(): Promise<boolean> {
  const id = tenantId.value
  if (!id) return false
  localSaveError.value = null
  try {
    const supabase = useSupabase()
    const now = new Date().toISOString()
    for (const w of watches.value) {
      const payload = {
        tenant_id: id,
        mint: w.mint,
        track_holders: w.track_holders,
        track_snapshot: w.track_snapshot,
        track_transactions: w.track_transactions,
        enabled_at_holders: w.enabled_at_holders,
        enabled_at_snapshot: w.enabled_at_snapshot,
        enabled_at_transactions: w.enabled_at_transactions,
        updated_at: now,
      }
      await supabase.from('watchtower_watches').upsert(payload, { onConflict: 'tenant_id,mint' })
      if (w.track_holders || w.track_snapshot) {
        try {
          const { error: syncErr } = await supabase.functions.invoke('cron-tracker', {
            body: { mode: 'full', syncMint: w.mint, tenantId: id },
          })
          if (syncErr) {
            // Best-effort: cron-tracker may 503 on cold start (heavy Solana deps).
            // pg_cron runs every 5 min and will sync; deploy still succeeds.
          }
        } catch {
          // Network/timeout: same as above; pg_cron will sync.
        }
      }
    }
    return true
  } catch (e) {
    localSaveError.value = e instanceof Error ? e.message : 'Failed to save'
    return false
  }
}

defineExpose({ saveWatches })

onMounted(fetchData)
</script>

<style scoped>
.watchtower-tab__hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin-bottom: var(--theme-space-md);
}

.watchtower-tab__loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  color: var(--theme-text-muted);
  font-size: var(--theme-font-sm);
}

.watchtower-tab__spinner {
  animation: watchtower-spin 1s linear infinite;
}

@keyframes watchtower-spin {
  to { transform: rotate(360deg); }
}

.watchtower-tab__empty {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.watchtower-tab__section {
  margin-bottom: var(--theme-space-lg);
}

.watchtower-tab__section:last-child {
  margin-bottom: 0;
}

.watchtower-tab__section-title {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  margin: 0 0 var(--theme-space-sm);
  color: var(--theme-text-secondary);
}

.watchtower-tab__list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.watchtower-tab__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--theme-space-sm) 0;
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.watchtower-tab__item:last-child {
  border-bottom: none;
}

.watchtower-tab__item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.watchtower-tab__item-name {
  font-weight: 500;
}

.watchtower-tab__item-addr {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.watchtower-tab__item-tracks {
  display: flex;
  gap: var(--theme-space-md);
}

.watchtower-tab__check {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  font-size: var(--theme-font-sm);
  cursor: pointer;
}

.watchtower-tab__check--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.watchtower-tab__error {
  margin-top: var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}

.watchtower-tab__grace-hint {
  margin-top: var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.watchtower-tab__save-hint {
  margin-top: var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}
</style>
