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
                  <th>Module</th>
                  <th>Amount</th>
                  <th>Period</th>
                  <th>Confirmed</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in recentPayments" :key="p.id">
                  <td>{{ p.tenantSlug }}</td>
                  <td>{{ p.moduleId }}</td>
                  <td>{{ formatUsdc(p.amountUsdc) }} USDC</td>
                  <td>{{ p.billingPeriod }}</td>
                  <td>
                    <span v-if="p.confirmedAt">{{ formatDateTime(p.confirmedAt) }}</span>
                    <span v-else class="ops-table__muted">n/a</span>
                  </td>
                </tr>
              </tbody>
            </table>
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

import { formatDate, formatDateTime, formatUsdc } from '@decentraguild/core'
import { PageSection, Button } from '@decentraguild/ui/components'
import { useApiBase } from '~/composables/useApiBase'

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
  billingPeriod: string
  periodStart: string
  periodEnd: string
  confirmedAt: string | null
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

const apiBase = useApiBase()

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

onMounted(async () => {
  await Promise.all([loadTenants(), loadBilling(), loadAudit()])
})

async function loadTenants() {
  tenantsLoading.value = true
  tenantsError.value = null
  try {
    const res = await fetch(`${apiBase.value}/api/v1/platform/tenants`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('Failed to load tenants')
    const data = (await res.json()) as { tenants?: TenantSummary[] }
    tenants.value = data.tenants ?? []
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
    const res = await fetch(`${apiBase.value}/api/v1/platform/billing`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('Failed to load billing overview')
    const data = (await res.json()) as {
      summary?: BillingSummary
      recentPayments?: BillingPaymentSummary[]
    }
    billingSummary.value = data.summary ?? { totalMrrUsdc: 0, activeSubscriptions: 0 }
    recentPayments.value = data.recentPayments ?? []
  } catch (e) {
    billingError.value = e instanceof Error ? e.message : 'Failed to load billing overview'
  } finally {
    billingLoading.value = false
  }
}

async function loadAudit() {
  auditLoading.value = true
  auditError.value = null
  try {
    const res = await fetch(`${apiBase.value}/api/v1/platform/audit?limit=50`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('Failed to load audit log')
    const data = (await res.json()) as { entries?: AuditEntry[] }
    auditEntries.value = data.entries ?? []
  } catch (e) {
    auditError.value = e instanceof Error ? e.message : 'Failed to load audit log'
  } finally {
    auditLoading.value = false
  }
}

async function logout() {
  try {
    await fetch(`${apiBase.value}/api/v1/platform/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
  } finally {
    await navigateTo('/ops/login')
  }
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

