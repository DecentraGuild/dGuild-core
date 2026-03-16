<template>
  <PageSection>
    <div class="ops">
      <header class="ops__header">
        <div>
          <h1 class="ops__title">Platform operations</h1>
          <p class="ops__subtitle">
            Internal view of tenants, billing, and recent changes. Only available to the owner wallet.
          </p>
        </div>
        <Button size="sm" variant="ghost" @click="logout">
          Sign out
        </Button>
      </header>

      <div class="ops__grid">
        <section class="ops__panel" aria-label="Tenant overview">
          <h2 class="ops__panel-title">Tenants</h2>
          <div v-if="tenantsLoading" class="ops__panel-body">Loading tenants…</div>
          <div v-else-if="tenantsError" class="ops__panel-body ops__panel-body--error">
            {{ tenantsError }}
          </div>
          <div v-else class="ops__panel-body">
            <table class="ops-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Modules</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="t in tenants"
                  :key="t.id"
                  class="ops-table__row"
                  @click="goToTenant(t)"
                >
                  <td>{{ t.name }}</td>
                  <td>
                    <span v-if="t.slug" class="ops-table__slug">{{ t.slug }}</span>
                    <span v-else class="ops-table__slug ops-table__slug--muted">id only</span>
                  </td>
                  <td>{{ Object.keys(t.modules ?? {}).length }}</td>
                  <td>
                    <span v-if="t.createdAt">{{ formatDate(t.createdAt) }}</span>
                    <span v-else class="ops-table__muted">n/a</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="ops__panel" aria-label="Billing overview">
          <h2 class="ops__panel-title">Billing</h2>
          <div v-if="billingLoading" class="ops__panel-body">Loading billing…</div>
          <div v-else-if="billingError" class="ops__panel-body ops__panel-body--error">
            {{ billingError }}
          </div>
          <div v-else class="ops__panel-body ops__panel-body--stack">
            <div class="ops-metrics">
              <div class="ops-metrics__item">
                <span class="ops-metrics__label">MRR</span>
                <span class="ops-metrics__value">
                  {{ formatUsdc(billingSummary.totalMrrUsdc) }} USDC / month
                </span>
              </div>
              <div class="ops-metrics__item">
                <span class="ops-metrics__label">Active subscriptions</span>
                <span class="ops-metrics__value">
                  {{ billingSummary.activeSubscriptions }}
                </span>
              </div>
            </div>

            <div class="ops__panel-subtitle">Recent payments</div>
            <table class="ops-table ops-table--compact">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Product</th>
                  <th>Amount</th>
                  <th>Confirmed</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in recentPayments" :key="p.id">
                  <td>{{ p.tenantSlug }}</td>
                  <td>{{ p.moduleId }}</td>
                  <td>{{ formatUsdc(p.amountUsdc) }} USDC</td>
                  <td>
                    <span v-if="p.confirmedAt">{{ formatDateTime(p.confirmedAt) }}</span>
                    <span v-else class="ops-table__muted">n/a</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="ops__panel" aria-label="Mint metadata refresh">
          <h2 class="ops__panel-title">Mint metadata</h2>
          <div class="ops__panel-body">
            <p class="ops__panel-desc">
              After db reset, run <strong>Seed from configs</strong> first to populate <code>mint_metadata</code> from tenant catalog, watchtower, and marketplace scope. Then use <strong>Refresh</strong> to refetch from chain.
            </p>
            <div class="ops__metadata-actions">
              <Button
                size="sm"
                variant="default"
                :disabled="metadataRefreshLoading"
                @click="seedMetadataFromConfigs"
              >
                {{ metadataRefreshLoading ? 'Seeding…' : 'Seed from configs' }}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                :disabled="metadataRefreshLoading"
                @click="refreshMetadata(200)"
              >
                {{ metadataRefreshLoading ? 'Refreshing…' : 'Refresh batch (200)' }}
              </Button>
              <Button
                size="sm"
                variant="outline"
                :disabled="metadataRefreshLoading"
                @click="refreshMetadata(500)"
              >
                Refresh batch (500)
              </Button>
            </div>
            <p v-if="metadataRefreshResult" class="ops__metadata-result">
              {{ metadataRefreshResult }}
            </p>
            <p v-if="metadataRefreshError" class="ops__metadata-error">
              {{ metadataRefreshError }}
            </p>
          </div>
        </section>

        <section class="ops__panel ops__panel--full" aria-label="Recent platform changes">
          <h2 class="ops__panel-title">Audit log</h2>
          <div v-if="auditLoading" class="ops__panel-body">Loading audit log…</div>
          <div v-else-if="auditError" class="ops__panel-body ops__panel-body--error">
            {{ auditError }}
          </div>
          <div v-else class="ops__panel-body">
            <table class="ops-table ops-table--compact">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in auditEntries" :key="entry.id">
                  <td>{{ formatDateTime(entry.createdAt) }}</td>
                  <td class="ops-table__wallet">{{ entry.actorWallet }}</td>
                  <td>{{ entry.action }}</td>
                  <td>
                    <span v-if="entry.targetType">
                      {{ entry.targetType }}: {{ entry.targetId ?? 'n/a' }}
                    </span>
                    <span v-else class="ops-table__muted">n/a</span>
                  </td>
                  <td>
                    <pre v-if="entry.details" class="ops-table__details">
{{ formatDetails(entry.details) }}
                    </pre>
                    <span v-else class="ops-table__muted">n/a</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  </PageSection>
</template>

<script setup lang="ts">
definePageMeta({ title: 'Platform operations' })

import { useAuth } from '@decentraguild/auth'
import { formatDate, formatDateTime, formatUsdc } from '@decentraguild/core'
import { PageSection, Button } from '@decentraguild/ui/components'
import { useSupabase } from '~/composables/useSupabase'

const auth = useAuth()

interface TenantSummary {
  id: string
  slug: string | null
  name: string
  description: string | null
  modules: Record<string, unknown>
  admins: string[]
  treasury: string | null
  createdAt: string | null
}

interface BillingSummary {
  totalMrrUsdc: number
  activeSubscriptions: number
}

interface BillingPaymentSummary {
  id: string
  tenantSlug: string
  moduleId: string
  amountUsdc: number
  confirmedAt: string | null
  txSignature?: string | null
}

interface AuditEntry {
  id: string
  actorWallet: string
  action: string
  targetType: string | null
  targetId: string | null
  details: Record<string, unknown> | null
  createdAt: string
}

const tenants = ref<TenantSummary[]>([])
const tenantsLoading = ref(true)
const tenantsError = ref<string | null>(null)

const billingSummary = ref<BillingSummary>({ totalMrrUsdc: 0, activeSubscriptions: 0 })
const recentPayments = ref<BillingPaymentSummary[]>([])
const billingLoading = ref(true)
const billingError = ref<string | null>(null)

const auditEntries = ref<AuditEntry[]>([])
const auditLoading = ref(true)
const auditError = ref<string | null>(null)

const metadataRefreshLoading = ref(false)
const metadataRefreshResult = ref<string | null>(null)
const metadataRefreshError = ref<string | null>(null)
const metadataRefreshOffset = ref(0)

onMounted(async () => {
  await Promise.all([loadTenants(), loadBilling(), loadAudit()])
})

async function loadTenants() {
  tenantsLoading.value = true
  tenantsError.value = null
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('platform', {
      body: { action: 'tenants-list' },
    })
    if (error) throw new Error(error.message)
    tenants.value = (data as { tenants?: TenantSummary[] }).tenants ?? []
  } catch (e) {
    tenantsError.value = e instanceof Error ? e.message : 'Failed to load tenants'
  } finally {
    tenantsLoading.value = false
  }
}

async function loadBilling() {
  billingLoading.value = true
  billingError.value = null
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('platform', {
      body: { action: 'billing-summary' },
    })
    if (error) throw new Error(error.message)
    const result = data as { activeSubscriptions?: number; totalMrrUsdc?: number; recentPayments?: BillingPaymentSummary[] }
    billingSummary.value = {
      totalMrrUsdc: result.totalMrrUsdc ?? 0,
      activeSubscriptions: result.activeSubscriptions ?? 0,
    }
    recentPayments.value = result.recentPayments ?? []
  } catch (e) {
    billingError.value = e instanceof Error ? e.message : 'Failed to load billing overview'
  } finally {
    billingLoading.value = false
  }
}

async function seedMetadataFromConfigs() {
  metadataRefreshLoading.value = true
  metadataRefreshResult.value = null
  metadataRefreshError.value = null
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('marketplace', {
      body: { action: 'metadata-seed-from-configs', limit: 100 },
    })
    if (error) throw new Error(error.message)
    const res = data as { seeded?: number; total?: number; message?: string; remaining?: number }
    metadataRefreshResult.value = res.message ?? `Seeded ${res.seeded ?? 0} mints.`
    if ((res.remaining ?? 0) > 0) {
      metadataRefreshResult.value += ' Click again to continue.'
    }
  } catch (e) {
    metadataRefreshError.value = e instanceof Error ? e.message : 'Failed to seed metadata'
  } finally {
    metadataRefreshLoading.value = false
  }
}

async function refreshMetadata(limit: number) {
  metadataRefreshLoading.value = true
  metadataRefreshResult.value = null
  metadataRefreshError.value = null
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('marketplace', {
      body: { action: 'metadata-refresh-all', limit, offset: metadataRefreshOffset.value },
    })
    if (error) throw new Error(error.message)
    const res = data as { refreshed?: number; total?: number; message?: string; nextOffset?: number | null }
    metadataRefreshResult.value = res.message ?? `Refreshed ${res.refreshed ?? 0} of ${res.total ?? 0} mints.`
    if (res.nextOffset != null) {
      metadataRefreshOffset.value = res.nextOffset
      metadataRefreshResult.value += ` Click again to continue.`
    } else {
      metadataRefreshOffset.value = 0
    }
  } catch (e) {
    metadataRefreshError.value = e instanceof Error ? e.message : 'Failed to refresh metadata'
  } finally {
    metadataRefreshLoading.value = false
  }
}

async function loadAudit() {
  auditLoading.value = true
  auditError.value = null
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('platform', {
      body: { action: 'audit-log', limit: 50 },
    })
    if (error) throw new Error(error.message)
    auditEntries.value = ((data as { entries?: AuditEntry[] }).entries ?? []).map((e) => ({
      id: (e as Record<string, unknown>).id as string,
      actorWallet: (e as Record<string, unknown>).actor_wallet as string,
      action: (e as Record<string, unknown>).action as string,
      targetType: (e as Record<string, unknown>).target_type as string | null,
      targetId: (e as Record<string, unknown>).target_id as string | null,
      details: (e as Record<string, unknown>).details as Record<string, unknown> | null,
      createdAt: (e as Record<string, unknown>).created_at as string,
    }))
  } catch (e) {
    auditError.value = e instanceof Error ? e.message : 'Failed to load audit log'
  } finally {
    auditLoading.value = false
  }
}

async function logout() {
  await auth.signOut()
  await navigateTo('/ops/login')
}

function goToTenant(t: TenantSummary) {
  navigateTo(`/ops/tenants/${encodeURIComponent(t.id)}`)
}

function formatDetails(details: Record<string, unknown> | null): string {
  if (!details) return ''
  return JSON.stringify(details, null, 2)
}
</script>

<style scoped>
.ops {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-lg);
}

.ops__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--theme-space-md);
}

.ops__title {
  margin: 0;
  font-size: var(--theme-font-xl);
  font-weight: 600;
  color: var(--theme-text-primary);
}

.ops__subtitle {
  margin: 0;
  color: var(--theme-text-secondary);
}

.ops__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.2fr);
  grid-auto-rows: minmax(0, auto);
  gap: var(--theme-space-md);
}

.ops__panel {
  background: var(--theme-bg-card);
  border-radius: var(--theme-radius-lg);
  border: 1px solid var(--theme-border);
  display: flex;
  flex-direction: column;
}

.ops__panel--full {
  grid-column: 1 / -1;
}

.ops__panel-title {
  margin: 0;
  padding: var(--theme-space-md) var(--theme-space-lg) 0;
  font-size: var(--theme-font-md);
  font-weight: 600;
}

.ops__panel-desc {
  margin: 0 0 var(--theme-space-md);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.ops__panel-desc code {
  font-size: 0.9em;
  background: var(--theme-bg-secondary);
  padding: 0.1rem 0.3rem;
  border-radius: var(--theme-radius-sm);
}

.ops__metadata-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-sm);
  margin-bottom: var(--theme-space-sm);
}

.ops__metadata-result {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.ops__metadata-error {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}

.ops__panel-body {
  padding: var(--theme-space-md) var(--theme-space-lg) var(--theme-space-lg);
}

.ops__panel-body--stack {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.ops__panel-body--error {
  color: var(--theme-error);
}

.ops__panel-subtitle {
  font-size: var(--theme-font-sm);
  font-weight: 500;
  color: var(--theme-text-secondary);
}

.ops-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-lg);
}

.ops-metrics__item {
  min-width: 160px;
}

.ops-metrics__label {
  display: block;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  margin-bottom: 0.25rem;
}

.ops-metrics__value {
  font-size: var(--theme-font-md);
  font-weight: 600;
}

.ops-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--theme-font-xs);
}

.ops-table th,
.ops-table td {
  padding: 0.35rem 0.5rem;
  text-align: left;
  border-bottom: 1px solid var(--theme-border-subtle);
}

.ops-table th {
  font-weight: 500;
  color: var(--theme-text-secondary);
}

.ops-table__row {
  cursor: pointer;
}

.ops-table__row:hover {
  background: var(--theme-bg-secondary);
}

.ops-table--compact th,
.ops-table--compact td {
  padding: 0.25rem 0.4rem;
}

.ops-table__slug {
  font-family: monospace;
}

.ops-table__slug--muted {
  color: var(--theme-text-muted);
}

.ops-table__muted {
  color: var(--theme-text-muted);
}

.ops-table__wallet {
  max-width: 180px;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ops-table__details {
  margin: 0;
  max-width: 260px;
  max-height: 5.5rem;
  overflow: auto;
  font-family: monospace;
  font-size: 0.65rem;
  background: var(--theme-bg-secondary);
  border-radius: var(--theme-radius-sm);
  padding: 0.25rem 0.35rem;
}

@media (max-width: var(--theme-breakpoint-md)) {
  .ops__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

