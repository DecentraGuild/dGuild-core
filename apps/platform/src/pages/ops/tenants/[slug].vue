<template>
  <PageSection>
    <div class="ops-tenant">
      <header class="ops-tenant__header">
        <div>
          <button type="button" class="ops-tenant__back" @click="back">
            ← Back to overview
          </button>
          <h1 class="ops-tenant__title">
            {{ tenant?.name ?? 'Tenant' }}
          </h1>
          <p class="ops-tenant__subtitle">
            {{ tenantIdentifier }}
          </p>
        </div>
        <div class="ops-tenant__meta">
          <div class="ops-tenant__meta-item">
            <span class="ops-tenant__meta-label">Active modules</span>
            <span class="ops-tenant__meta-value">{{ stats?.activeModules ?? 0 }}</span>
          </div>
          <div class="ops-tenant__meta-item">
            <span class="ops-tenant__meta-label">Payments</span>
            <span class="ops-tenant__meta-value">{{ stats?.totalPayments ?? 0 }}</span>
          </div>
        </div>
      </header>

      <div v-if="loading" class="ops-tenant__body">Loading tenant…</div>
      <div v-else-if="error" class="ops-tenant__body ops-tenant__body--error">
        {{ error }}
      </div>
      <div v-else-if="tenant" class="ops-tenant__body ops-tenant__grid">
        <section class="ops-tenant__panel" aria-label="Config">
          <h2 class="ops-tenant__panel-title">Config</h2>
          <dl class="ops-tenant__config">
            <div>
              <dt>ID</dt>
              <dd><code>{{ tenant.id }}</code></dd>
            </div>
            <div>
              <dt>Slug</dt>
              <dd>
                <span v-if="tenant.slug"><code>{{ tenant.slug }}</code></span>
                <span v-else class="ops-tenant__muted">none</span>
              </dd>
            </div>
            <div class="ops-tenant__slug-override">
              <dt>Set slug (ops)</dt>
              <dd>
                <input
                  v-model="opsSlugInput"
                  type="text"
                  class="ops-tenant__slug-input"
                  placeholder="e.g. my-community"
                  :disabled="slugSetLoading"
                  @keydown.enter.prevent="checkOpsSlug()"
                />
                <span v-if="opsSlugCheckStatus === 'available'" class="ops-tenant__slug-ok">Available</span>
                <span v-else-if="opsSlugCheckStatus === 'taken'" class="ops-tenant__slug-taken">Taken</span>
                <span v-else-if="opsSlugCheckStatus === 'checking'" class="ops-tenant__slug-checking">Checking…</span>
                <Button
                  size="xs"
                  variant="ghost"
                  :disabled="!opsSlugInput.trim() || slugSetLoading"
                  @click="checkOpsSlug()"
                >
                  Check
                </Button>
                <Button
                  size="xs"
                  variant="primary"
                  :disabled="opsSlugCheckStatus !== 'available' || slugSetLoading"
                  @click="setOpsSlug()"
                >
                  {{ slugSetLoading ? 'Saving…' : 'Set slug' }}
                </Button>
                <span v-if="opsSlugError" class="ops-tenant__error-inline">{{ opsSlugError }}</span>
              </dd>
            </div>
            <div>
              <dt>Treasury</dt>
              <dd>
                <span v-if="tenant.treasury"><code>{{ tenant.treasury }}</code></span>
                <span v-else class="ops-tenant__muted">none</span>
              </dd>
            </div>
            <div>
              <dt>Admins</dt>
              <dd>
                <ul class="ops-tenant__list">
                  <li v-for="a in tenant.admins" :key="a"><code>{{ a }}</code></li>
                  <li v-if="!tenant.admins?.length" class="ops-tenant__muted">none</li>
                </ul>
              </dd>
            </div>
          </dl>
        </section>

        <section class="ops-tenant__panel" aria-label="Modules">
          <h2 class="ops-tenant__panel-title">Modules</h2>
          <table class="ops-tenant__table">
            <thead>
              <tr>
                <th>Module</th>
                <th>State</th>
                <th>Subscription</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in moduleRows" :key="entry.id">
                <td>{{ entry.id }}</td>
                <td>{{ entry.state }}</td>
                <td>
                  <span v-if="entry.subscription">
                    {{ entry.subscription.billingPeriod }} until
                    {{ formatDate(entry.subscription.periodEnd) }}
                  </span>
                  <span v-else class="ops-tenant__muted">none</span>
                </td>
                <td class="ops-tenant__actions-cell">
                  <div v-if="entry.state === 'off'" class="ops-tenant__enable-row">
                    <input
                      v-model="endDateByModule[entry.id]"
                      type="date"
                      class="ops-tenant__date-input"
                      :min="minDateForNewSub"
                      aria-label="End date (optional)"
                    />
                    <Button
                      size="xs"
                      variant="ghost"
                      :disabled="toggleLoading === entry.id"
                      @click="toggleModule(entry.id, true, endDateByModule[entry.id] || undefined)"
                    >
                      Enable
                    </Button>
                  </div>
                  <template v-else>
                    <Button
                      size="xs"
                      variant="ghost"
                      :disabled="toggleLoading === entry.id"
                      @click="toggleModule(entry.id, false)"
                    >
                      Disable
                    </Button>
                  </template>
                  <Button
                    size="xs"
                    variant="ghost"
                    class="ops-tenant__set-date-btn"
                    :disabled="setPeriodEndLoading === entry.id"
                    @click="openSetPeriodEnd(entry.id)"
                  >
                    Set end date
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="moduleError" class="ops-tenant__error">
            {{ moduleError }}
          </p>
        </section>

        <section class="ops-tenant__panel ops-tenant__panel--full" aria-label="Billing">
          <h2 class="ops-tenant__panel-title">Billing</h2>
          <div class="ops-tenant__billing-grid">
            <div>
              <h3 class="ops-tenant__section-subtitle">Subscriptions</h3>
              <table class="ops-tenant__table ops-tenant__table--compact">
                <thead>
                  <tr>
                    <th>Module</th>
                    <th>Billing</th>
                    <th>Period end</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="entry in moduleRows" :key="entry.id">
                    <td>{{ entry.id }}</td>
                    <td>
                      <span v-if="entry.subscription">
                        {{ entry.subscription.billingPeriod }}
                      </span>
                      <span v-else class="ops-tenant__muted">none</span>
                    </td>
                    <td>
                      <span v-if="entry.subscription">
                        {{ formatDate(entry.subscription.periodEnd) }}
                      </span>
                      <span v-else class="ops-tenant__muted">n/a</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3 class="ops-tenant__section-subtitle">Payments</h3>
              <table class="ops-tenant__table ops-tenant__table--compact">
                <thead>
                  <tr>
                    <th>Module</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Confirmed</th>
                    <th>Tx</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in payments" :key="p.id">
                    <td>{{ p.moduleId }}</td>
                    <td>{{ formatUsdc(p.amountUsdc) }} USDC</td>
                    <td>{{ p.status }}</td>
                    <td>
                      <span v-if="p.confirmedAt">{{ formatDateTime(p.confirmedAt) }}</span>
                      <span v-else class="ops-tenant__muted">n/a</span>
                    </td>
                    <td>
                      <a
                        v-if="p.txSignature"
                        :href="`https://solscan.io/tx/${p.txSignature}`"
                        target="_blank"
                        rel="noopener"
                        class="ops-tenant__tx-link"
                      >
                        View
                      </a>
                      <span v-else class="ops-tenant__muted">n/a</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>

    <Modal
      :model-value="setPeriodEndModuleId !== null"
      title="Set end date"
      @update:model-value="(v) => { if (!v) setPeriodEndModuleId = null }"
    >
      <form
        v-if="setPeriodEndModuleId"
        class="ops-tenant__set-date-form"
        @submit.prevent="submitSetPeriodEnd"
      >
        <p class="ops-tenant__set-date-module">
          Module: <code>{{ setPeriodEndModuleId }}</code>
        </p>
        <div class="ops-tenant__form-row">
          <label for="set-period-end-date">End date</label>
          <input
            id="set-period-end-date"
            v-model="setPeriodEndForm.periodEnd"
            type="date"
            required
            :min="minDateForNewSub"
            class="ops-tenant__date-input"
          />
        </div>
        <div class="ops-tenant__form-row">
          <label for="set-period-end-billing">Billing period (for new subscription)</label>
          <select
            id="set-period-end-billing"
            v-model="setPeriodEndForm.billingPeriod"
            class="ops-tenant__select"
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <p v-if="setPeriodEndError" class="ops-tenant__error">
          {{ setPeriodEndError }}
        </p>
        <div class="ops-tenant__form-actions">
          <Button type="button" variant="secondary" @click="setPeriodEndModuleId = null">
            Cancel
          </Button>
          <Button type="submit" variant="primary" :disabled="setPeriodEndSaving">
            {{ setPeriodEndSaving ? 'Saving…' : 'Set end date' }}
          </Button>
        </div>
      </form>
    </Modal>
  </PageSection>
</template>

<script setup lang="ts">
definePageMeta({ title: 'Tenant detail' })

import type { TenantConfig } from '@decentraguild/core'
import { formatDate, formatDateTime, formatUsdc } from '@decentraguild/core'
import { getModuleCatalogListWithAddons } from '@decentraguild/config'
import { PageSection, Button, Modal } from '@decentraguild/ui/components'
import { useApiBase } from '~/composables/useApiBase'

interface SubscriptionSummary {
  billingPeriod: string
  periodStart: string
  periodEnd: string
  recurringAmountUsdc: number
}

interface BillingPayment {
  id: string
  tenantSlug: string
  moduleId: string
  amountUsdc: number
  billingPeriod: string
  periodStart: string
  periodEnd: string
  status: string
  confirmedAt: string | null
  txSignature: string | null
}

interface TenantStats {
  activeModules: number
  totalPayments: number
  lastPaymentAt: string | null
}

interface TenantDetailResponse {
  tenant: TenantConfig
  billing: {
    subscriptions: Record<string, SubscriptionSummary | null>
    payments: BillingPayment[]
  }
  stats: TenantStats
}

const route = useRoute()
const router = useRouter()
const apiBase = useApiBase()

const tenant = ref<TenantConfig | null>(null)
const catalogModules = getModuleCatalogListWithAddons()
const stats = ref<TenantStats | null>(null)
const subscriptions = ref<Record<string, SubscriptionSummary | null>>({})
const payments = ref<BillingPayment[]>([])

const loading = ref(true)
const error = ref<string | null>(null)
const moduleError = ref<string | null>(null)
const toggleLoading = ref<string | null>(null)
const endDateByModule = ref<Record<string, string>>({})

const setPeriodEndModuleId = ref<string | null>(null)
const setPeriodEndForm = ref({ periodEnd: '', billingPeriod: 'yearly' })
const setPeriodEndError = ref<string | null>(null)
const setPeriodEndSaving = ref(false)
const setPeriodEndLoading = ref<string | null>(null)

const opsSlugInput = ref('')
const opsSlugCheckStatus = ref<'idle' | 'checking' | 'available' | 'taken'>('idle')
const opsSlugError = ref<string | null>(null)
const slugSetLoading = ref(false)

const minDateForNewSub = computed(() => {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
})

const tenantIdentifier = computed(() => {
  if (!tenant.value) return ''
  return tenant.value.slug ?? tenant.value.id
})

const moduleRows = computed(() =>
  catalogModules.map((entry) => {
    const id = entry.id
    const tenantEntry = (tenant.value?.modules ?? {})[id] as { state?: string } | undefined
    const state = ((tenantEntry?.state ?? 'off') as string) || 'off'
    const sub = subscriptions.value[id] ?? null
    return {
      id,
      state,
      subscription: sub,
    }
  }),
)

onMounted(async () => {
  await loadTenant()
})

async function checkOpsSlug() {
  const s = opsSlugInput.value.trim().toLowerCase()
  if (!s || !tenant.value) return
  opsSlugError.value = null
  opsSlugCheckStatus.value = 'checking'
  try {
    const res = await fetch(
      `${apiBase.value}/api/v1/platform/tenants/${encodeURIComponent(tenant.value.id)}/slug/check?slug=${encodeURIComponent(s)}`,
      { credentials: 'include' },
    )
    const data = (await res.json().catch(() => ({}))) as { available?: boolean; error?: string }
    if (!res.ok) {
      opsSlugCheckStatus.value = 'idle'
      opsSlugError.value = data.error ?? 'Check failed'
      return
    }
    opsSlugCheckStatus.value = data.available ? 'available' : 'taken'
  } catch {
    opsSlugCheckStatus.value = 'idle'
    opsSlugError.value = 'Check failed'
  }
}

async function setOpsSlug() {
  const s = opsSlugInput.value.trim().toLowerCase()
  if (!s || !tenant.value || opsSlugCheckStatus.value !== 'available') return
  opsSlugError.value = null
  slugSetLoading.value = true
  try {
    const res = await fetch(
      `${apiBase.value}/api/v1/platform/tenants/${encodeURIComponent(tenant.value.id)}/slug`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slug: s }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as { tenant?: TenantConfig; error?: string }
    if (!res.ok) {
      opsSlugError.value = data.error ?? 'Failed to set slug'
      return
    }
    if (data.tenant) tenant.value = data.tenant
    opsSlugInput.value = ''
    opsSlugCheckStatus.value = 'idle'
    await loadTenant()
  } catch {
    opsSlugError.value = 'Failed to set slug'
  } finally {
    slugSetLoading.value = false
  }
}

async function loadTenant() {
  loading.value = true
  error.value = null
  try {
    const tenantId = route.params.slug as string
    const res = await fetch(`${apiBase.value}/api/v1/platform/tenants/${encodeURIComponent(tenantId)}`, {
      credentials: 'include',
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? 'Failed to load tenant')
    }
    const data = (await res.json()) as TenantDetailResponse
    tenant.value = data.tenant
    stats.value = data.stats
    subscriptions.value = data.billing.subscriptions ?? {}
    payments.value = data.billing.payments ?? []
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load tenant'
  } finally {
    loading.value = false
  }
}

async function toggleModule(moduleId: string, enabled: boolean, periodEnd?: string) {
  if (!tenant.value) return
  moduleError.value = null
  toggleLoading.value = moduleId
  try {
    const body: { moduleId: string; enabled: boolean; periodEnd?: string; billingPeriod?: string } = {
      moduleId,
      enabled,
    }
    if (enabled && periodEnd) {
      body.periodEnd = periodEnd
      body.billingPeriod = 'yearly'
    }
    const res = await fetch(
      `${apiBase.value}/api/v1/platform/tenants/${encodeURIComponent(tenant.value.id)}/modules`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      },
    )
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? 'Failed to update module state')
    }
    const data = (await res.json()) as { tenant: TenantConfig }
    tenant.value = data.tenant
    if (enabled && periodEnd) endDateByModule.value[moduleId] = ''
  } catch (e) {
    moduleError.value = e instanceof Error ? e.message : 'Failed to update module'
  } finally {
    toggleLoading.value = null
  }
}

function openSetPeriodEnd(moduleId: string) {
  setPeriodEndModuleId.value = moduleId
  setPeriodEndError.value = null
  const sub = subscriptions.value[moduleId]
  setPeriodEndForm.value = {
    periodEnd: sub?.periodEnd ? sub.periodEnd.slice(0, 10) : minDateForNewSub.value,
    billingPeriod: 'yearly',
  }
}

async function submitSetPeriodEnd() {
  const moduleId = setPeriodEndModuleId.value
  if (!moduleId || !tenant.value) return
  setPeriodEndError.value = null
  setPeriodEndSaving.value = true
  try {
    const res = await fetch(
      `${apiBase.value}/api/v1/platform/tenants/${encodeURIComponent(tenant.value.id)}/billing/set-period-end`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          moduleId,
          periodEnd: setPeriodEndForm.value.periodEnd,
          billingPeriod: setPeriodEndForm.value.billingPeriod,
        }),
      },
    )
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? 'Failed to set end date')
    }
    setPeriodEndModuleId.value = null
    await loadTenant()
  } catch (e) {
    setPeriodEndError.value = e instanceof Error ? e.message : 'Failed to set end date'
  } finally {
    setPeriodEndSaving.value = false
  }
}

function back() {
  if (history.length > 1) {
    router.back()
  } else {
    router.push('/ops')
  }
}
</script>

<style scoped>
.ops-tenant {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-lg);
}

.ops-tenant__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--theme-space-lg);
}

.ops-tenant__back {
  border: none;
  padding: 0;
  background: none;
  color: var(--theme-text-secondary);
  font-size: var(--theme-font-xs);
  cursor: pointer;
  margin-bottom: var(--theme-space-xs);
}

.ops-tenant__title {
  margin: 0;
  font-size: var(--theme-font-xl);
  font-weight: 600;
}

.ops-tenant__subtitle {
  margin: 0;
  color: var(--theme-text-secondary);
}

.ops-tenant__meta {
  display: flex;
  gap: var(--theme-space-lg);
}

.ops-tenant__meta-item {
  min-width: 120px;
}

.ops-tenant__meta-label {
  display: block;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.ops-tenant__meta-value {
  font-size: var(--theme-font-lg);
  font-weight: 600;
}

.ops-tenant__body {
  background: var(--theme-bg-card);
  border-radius: var(--theme-radius-lg);
  border: 1px solid var(--theme-border);
  padding: var(--theme-space-lg);
}

.ops-tenant__body--error {
  color: var(--theme-error);
}

.ops-tenant__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.4fr);
  grid-auto-rows: minmax(0, auto);
  gap: var(--theme-space-md);
  background: none;
  border: none;
  padding: 0;
}

.ops-tenant__panel {
  background: var(--theme-bg-card);
  border-radius: var(--theme-radius-lg);
  border: 1px solid var(--theme-border);
  padding: var(--theme-space-md) var(--theme-space-lg) var(--theme-space-lg);
}

.ops-tenant__panel--full {
  grid-column: 1 / -1;
}

.ops-tenant__panel-title {
  margin: 0 0 var(--theme-space-sm);
  font-size: var(--theme-font-md);
  font-weight: 600;
}

.ops-tenant__config {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--theme-space-md);
}

.ops-tenant__config dt {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.ops-tenant__config dd {
  margin: 0;
}

.ops-tenant__slug-override {
  grid-column: 1 / -1;
}

.ops-tenant__slug-override dd {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.ops-tenant__slug-input {
  font-size: var(--theme-font-sm);
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  background: var(--theme-bg);
  min-width: 10rem;
}

.ops-tenant__slug-ok {
  font-size: var(--theme-font-xs);
  color: var(--theme-success, green);
}

.ops-tenant__slug-taken {
  font-size: var(--theme-font-xs);
  color: var(--theme-error);
}

.ops-tenant__slug-checking {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.ops-tenant__error-inline {
  font-size: var(--theme-font-xs);
  color: var(--theme-error);
  width: 100%;
}

.ops-tenant__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.ops-tenant__muted {
  color: var(--theme-text-muted);
}

.ops-tenant__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--theme-font-xs);
}

.ops-tenant__table th,
.ops-tenant__table td {
  padding: 0.35rem 0.5rem;
  text-align: left;
  border-bottom: 1px solid var(--theme-border-subtle);
}

.ops-tenant__table th {
  font-weight: 500;
  color: var(--theme-text-secondary);
}

.ops-tenant__table--compact th,
.ops-tenant__table--compact td {
  padding: 0.25rem 0.4rem;
}

.ops-tenant__billing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--theme-space-md);
}

.ops-tenant__section-subtitle {
  margin: 0 0 var(--theme-space-xs);
  font-size: var(--theme-font-sm);
  font-weight: 500;
}

.ops-tenant__error {
  margin-top: var(--theme-space-sm);
  font-size: var(--theme-font-xs);
  color: var(--theme-error);
}

.ops-tenant__tx-link {
  color: var(--theme-text-link);
  text-decoration: none;
}

.ops-tenant__tx-link:hover {
  text-decoration: underline;
}

.ops-tenant__actions-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.ops-tenant__enable-row {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.ops-tenant__date-input {
  font-size: var(--theme-font-xs);
  padding: 0.25rem 0.35rem;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  background: var(--theme-bg);
}

.ops-tenant__set-date-btn {
  margin-left: 0.25rem;
}

.ops-tenant__set-date-form {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.ops-tenant__set-date-module {
  margin: 0;
  font-size: var(--theme-font-sm);
}

.ops-tenant__set-date-module code {
  font-size: var(--theme-font-xs);
}

.ops-tenant__form-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.ops-tenant__form-row label {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
}

.ops-tenant__select {
  font-size: var(--theme-font-sm);
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  background: var(--theme-bg);
  max-width: 12rem;
}

.ops-tenant__form-actions {
  display: flex;
  gap: var(--theme-space-sm);
  margin-top: var(--theme-space-sm);
}

@media (max-width: var(--theme-breakpoint-md)) {
  .ops-tenant__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .ops-tenant__meta {
    flex-direction: column;
  }
}
</style>

