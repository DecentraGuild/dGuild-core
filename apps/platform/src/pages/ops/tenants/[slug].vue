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
            <div class="ops-tenant__admins-row">
              <dt>Admins</dt>
              <dd>
                <ul class="ops-tenant__list ops-tenant__admin-list">
                  <li v-for="a in tenant.admins" :key="a" class="ops-tenant__admin-item">
                    <code class="ops-tenant__admin-addr">{{ truncateAddress(a, 4, 4) }}</code>
                    <button type="button" class="ops-tenant__admin-btn" aria-label="Copy" @click="copyAdmin(a)">
                      <Icon :icon="copiedAdmin === a ? 'lucide:check' : 'lucide:copy'" />
                    </button>
                    <a :href="explorerLinks.accountUrl(a)" target="_blank" rel="noopener" class="ops-tenant__admin-btn" aria-label="Solscan">
                      <Icon icon="lucide:external-link" />
                    </a>
                  </li>
                  <li v-if="!tenant.admins?.length" class="ops-tenant__muted">none</li>
                </ul>
                <div class="ops-tenant__add-admin">
                  <div class="ops-tenant__add-admin-row">
                    <input
                      v-model="addAdminWallet"
                      type="text"
                      class="ops-tenant__slug-input"
                      placeholder="Wallet address"
                      :disabled="addAdminLoading"
                      @keydown.enter.prevent="addAdmin()"
                    />
                    <Button
                      size="xs"
                      variant="primary"
                      :disabled="!addAdminWallet.trim() || addAdminLoading"
                      @click="addAdmin()"
                    >
                      {{ addAdminLoading ? 'Adding…' : 'Add admin' }}
                    </Button>
                  </div>
                  <span v-if="addAdminError" class="ops-tenant__error-inline">{{ addAdminError }}</span>
                </div>
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

        <section class="ops-tenant__panel ops-tenant__panel--full" aria-label="Whitelists">
          <h2 class="ops-tenant__panel-title">Whitelists</h2>
          <p class="ops-tenant__panel-hint">
            Bind on-chain gates to this tenant when creation succeeded but DB assignment failed.
          </p>
          <div class="ops-tenant__bind-grid">
            <div>
              <h3 class="ops-tenant__section-subtitle">Bound lists</h3>
              <ul v-if="whitelists.length" class="ops-tenant__bound-list">
                <li v-for="w in whitelists" :key="w.address" class="ops-tenant__bound-item">
                  <span>{{ w.name }}</span>
                  <code class="ops-tenant__bound-address">{{ truncateAddress(w.address) }}</code>
                  <Button
                    size="xs"
                    variant="ghost"
                    :disabled="whitelistUnbindLoading === w.address"
                    @click="unbindWhitelist(w.address)"
                  >
                    {{ whitelistUnbindLoading === w.address ? 'Removing…' : 'Remove' }}
                  </Button>
                </li>
              </ul>
              <p v-else class="ops-tenant__muted">No gates bound.</p>
            </div>
            <div>
              <h3 class="ops-tenant__section-subtitle">Bind unbound list</h3>
              <div class="ops-tenant__bind-row">
                <Button
                  size="xs"
                  variant="secondary"
                  :disabled="whitelistFetchLoading"
                  @click="fetchUnboundWhitelists"
                >
                  {{ whitelistFetchLoading ? 'Fetching…' : 'Fetch unbound' }}
                </Button>
                <select
                  v-model="selectedUnboundWhitelist"
                  class="ops-tenant__select"
                  :disabled="!unboundWhitelists.length || whitelistBindLoading"
                >
                  <option value="">
                    {{ unboundWhitelists.length ? 'Select list…' : 'No unbound lists' }}
                  </option>
                  <option
                    v-for="u in unboundWhitelists"
                    :key="u.address"
                    :value="u.address"
                  >
                    {{ u.name }} ({{ truncateAddress(u.address) }})
                  </option>
                </select>
                <Button
                  size="xs"
                  variant="primary"
                  :disabled="!selectedUnboundWhitelist || whitelistBindLoading"
                  @click="bindWhitelist"
                >
                  {{ whitelistBindLoading ? 'Binding…' : 'Bind' }}
                </Button>
              </div>
              <p v-if="whitelistError" class="ops-tenant__error">{{ whitelistError }}</p>
            </div>
          </div>
        </section>

        <section class="ops-tenant__panel ops-tenant__panel--full" aria-label="Raffles">
          <h2 class="ops-tenant__panel-title">Raffles</h2>
          <p class="ops-tenant__panel-hint">
            Bind on-chain raffles to this tenant when creation succeeded but DB assignment failed.
          </p>
          <div class="ops-tenant__bind-grid">
            <div>
              <h3 class="ops-tenant__section-subtitle">Bound raffles</h3>
              <ul v-if="raffles.length" class="ops-tenant__bound-list">
                <li v-for="r in raffles" :key="r.raffle_pubkey" class="ops-tenant__bound-item">
                  <code class="ops-tenant__bound-address">{{ truncateAddress(r.raffle_pubkey) }}</code>
                  <span v-if="r.closed_at" class="ops-tenant__muted">(closed)</span>
                  <Button
                    size="xs"
                    variant="ghost"
                    :disabled="raffleUnbindLoading === r.raffle_pubkey"
                    @click="unbindRaffle(r.raffle_pubkey)"
                  >
                    {{ raffleUnbindLoading === r.raffle_pubkey ? 'Removing…' : 'Remove' }}
                  </Button>
                </li>
              </ul>
              <p v-else class="ops-tenant__muted">No raffles bound.</p>
            </div>
            <div>
              <h3 class="ops-tenant__section-subtitle">Bind unbound raffle</h3>
              <div class="ops-tenant__bind-row">
                <Button
                  size="xs"
                  variant="secondary"
                  :disabled="raffleFetchLoading"
                  @click="fetchUnboundRaffles"
                >
                  {{ raffleFetchLoading ? 'Fetching…' : 'Fetch unbound' }}
                </Button>
                <select
                  v-model="selectedUnboundRaffle"
                  class="ops-tenant__select"
                  :disabled="!unboundRaffles.length || raffleBindLoading"
                >
                  <option value="">
                    {{ unboundRaffles.length ? 'Select raffle…' : 'No unbound raffles' }}
                  </option>
                  <option
                    v-for="u in unboundRaffles"
                    :key="u.rafflePubkey"
                    :value="u.rafflePubkey"
                  >
                    {{ u.name }} ({{ truncateAddress(u.rafflePubkey) }})
                  </option>
                </select>
                <Button
                  size="xs"
                  variant="primary"
                  :disabled="!selectedUnboundRaffle || raffleBindLoading"
                  @click="bindRaffle"
                >
                  {{ raffleBindLoading ? 'Binding…' : 'Bind' }}
                </Button>
              </div>
              <p v-if="raffleError" class="ops-tenant__error">{{ raffleError }}</p>
            </div>
          </div>
        </section>

        <section class="ops-tenant__panel ops-tenant__panel--full" aria-label="Crafter">
          <h2 class="ops-tenant__panel-title">Crafter</h2>
          <p class="ops-tenant__panel-hint">
            Import tokens when creation succeeded on-chain but confirm failed (e.g. non-2xx from Edge Function).
          </p>
          <div class="ops-tenant__bind-grid">
            <div>
              <h3 class="ops-tenant__section-subtitle">Tokens</h3>
              <ul v-if="crafterTokens.length" class="ops-tenant__bound-list">
                <li v-for="t in crafterTokens" :key="t.mint" class="ops-tenant__bound-item">
                  <span>{{ t.name || t.symbol }}</span>
                  <code class="ops-tenant__bound-address">{{ truncateAddress(t.mint) }}</code>
                  <a
                    :href="explorerLinks.accountUrl(t.mint)"
                    target="_blank"
                    rel="noopener"
                    class="ops-tenant__admin-btn"
                    aria-label="Solscan"
                  >
                    <Icon icon="lucide:external-link" />
                  </a>
                  <Button
                    size="xs"
                    variant="ghost"
                    :disabled="crafterRemoveLoading === t.mint"
                    @click="removeCrafterToken(t.mint)"
                  >
                    {{ crafterRemoveLoading === t.mint ? 'Removing…' : 'Remove' }}
                  </Button>
                </li>
              </ul>
              <p v-else class="ops-tenant__muted">No crafter tokens.</p>
            </div>
            <div>
              <h3 class="ops-tenant__section-subtitle">Import token</h3>
              <div class="ops-tenant__bind-row ops-tenant__import-form">
                <input
                  v-model="crafterImportMint"
                  type="text"
                  class="ops-tenant__slug-input"
                  placeholder="Mint address"
                  :disabled="crafterImportLoading"
                />
                <input
                  v-model="crafterImportName"
                  type="text"
                  class="ops-tenant__slug-input ops-tenant__slug-input--short"
                  placeholder="Name (optional)"
                  :disabled="crafterImportLoading"
                />
                <input
                  v-model="crafterImportSymbol"
                  type="text"
                  class="ops-tenant__slug-input ops-tenant__slug-input--short"
                  placeholder="Symbol (optional)"
                  :disabled="crafterImportLoading"
                />
                <Button
                  size="xs"
                  variant="primary"
                  :disabled="!crafterImportMint.trim() || crafterImportLoading"
                  @click="importCrafterToken"
                >
                  {{ crafterImportLoading ? 'Importing…' : 'Import' }}
                </Button>
              </div>
              <p v-if="crafterImportError" class="ops-tenant__error">{{ crafterImportError }}</p>
            </div>
          </div>
        </section>

        <section class="ops-tenant__panel ops-tenant__panel--full" aria-label="Billing">
          <h2 class="ops-tenant__panel-title">Billing</h2>
          <div v-if="hasWatchtowerModule" class="ops-tenant__watchtower-tracks">
            <h3 class="ops-tenant__section-subtitle">Watchtower tracks (ops override)</h3>
            <p class="ops-tenant__panel-hint">
              Manually set paid track counts when billing sync was wrong. Changes apply immediately.
            </p>
            <div class="ops-tenant__tracks-row">
              <div v-for="t in watchtowerTracks" :key="t.scopeKey" class="ops-tenant__track-item">
                <label :for="`track-${t.scopeKey}`">{{ t.label }}</label>
                <input
                  :id="`track-${t.scopeKey}`"
                  v-model.number="watchtowerTrackInputs[t.scopeKey]"
                  type="number"
                  min="0"
                  class="ops-tenant__track-input"
                />
              </div>
              <Button
                size="xs"
                variant="primary"
                :disabled="watchtowerTracksSaving"
                @click="saveWatchtowerTracks"
              >
                {{ watchtowerTracksSaving ? 'Saving…' : 'Save tracks' }}
              </Button>
            </div>
            <p v-if="watchtowerTracksError" class="ops-tenant__error">{{ watchtowerTracksError }}</p>
          </div>
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
import { truncateAddress } from '@decentraguild/display'
import { Icon } from '@iconify/vue'
import { getModuleCatalogListWithAddons } from '@decentraguild/config'
import { PageSection, Button, Modal } from '@decentraguild/ui/components'
import { useSupabase } from '~/composables/useSupabase'
import { useExplorerLinks } from '~/composables/useExplorerLinks'

const explorerLinks = useExplorerLinks()
const copiedAdmin = ref<string | null>(null)

function copyAdmin(addr: string) {
  navigator.clipboard.writeText(addr).then(() => {
    copiedAdmin.value = addr
    setTimeout(() => { copiedAdmin.value = null }, 2000)
  })
}

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

const route = useRoute()
const router = useRouter()

const tenant = ref<TenantConfig | null>(null)
const catalogModules = getModuleCatalogListWithAddons()
const stats = ref<TenantStats | null>(null)
const subscriptions = ref<Record<string, SubscriptionSummary | null>>({})
const billingSubsRaw = ref<Array<Record<string, unknown>>>([])
const payments = ref<BillingPayment[]>([])

const watchtowerTrackInputs = ref<Record<string, number>>({ mints_current: 0, mintsSnapshot: 0, mintsTransactions: 0 })
const watchtowerTracksSaving = ref(false)
const watchtowerTracksError = ref<string | null>(null)

const WATCHTOWER_SCOPE_LABELS: Record<string, string> = {
  mints_current: 'Current holders',
  mintsSnapshot: 'Snapshot',
  mintsTransactions: 'Transactions',
}

const hasWatchtowerModule = computed(() => {
  const m = (tenant.value?.modules ?? {})['watchtower'] as { state?: string } | undefined
  return m?.state === 'active' || m?.state === 'staging' || m?.state === 'deactivating'
})

const watchtowerTracks = computed(() => {
  const rows = billingSubsRaw.value.filter(
    (r) => r.module_id === 'watchtower' && r.scope_key && ['mints_current', 'mintsSnapshot', 'mintsTransactions'].includes(r.scope_key as string),
  )
  if (rows.length) {
    return rows.map((r) => {
      const key = r.scope_key as string
      const cond = (r.conditions_snapshot as Record<string, number>) ?? {}
      const count = Number(cond[key]) || 0
      return { scopeKey: key, label: WATCHTOWER_SCOPE_LABELS[key] ?? key, count }
    })
  }
  return [
    { scopeKey: 'mints_current', label: 'Current holders', count: 0 },
    { scopeKey: 'mintsSnapshot', label: 'Snapshot', count: 0 },
    { scopeKey: 'mintsTransactions', label: 'Transactions', count: 0 },
  ]
})

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

const addAdminWallet = ref('')
const addAdminLoading = ref(false)
const addAdminError = ref<string | null>(null)

const whitelists = ref<Array<{ address: string; name: string }>>([])
const raffles = ref<Array<{ raffle_pubkey: string; created_at: string; closed_at: string | null }>>([])
const crafterTokens = ref<Array<{ mint: string; name: string | null; symbol: string | null; decimals: number | null; authority: string; created_at: string }>>([])
const crafterImportMint = ref('')
const crafterImportName = ref('')
const crafterImportSymbol = ref('')
const crafterImportLoading = ref(false)
const crafterImportError = ref<string | null>(null)
const crafterRemoveLoading = ref<string | null>(null)
const unboundWhitelists = ref<Array<{ address: string; name: string }>>([])
const unboundRaffles = ref<Array<{ rafflePubkey: string; name: string }>>([])
const selectedUnboundWhitelist = ref('')
const selectedUnboundRaffle = ref('')
const whitelistFetchLoading = ref(false)
const whitelistBindLoading = ref(false)
const whitelistUnbindLoading = ref<string | null>(null)
const whitelistError = ref<string | null>(null)
const raffleFetchLoading = ref(false)
const raffleBindLoading = ref(false)
const raffleUnbindLoading = ref<string | null>(null)
const raffleError = ref<string | null>(null)

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

watch(
  watchtowerTracks,
  (tracks) => {
    const next: Record<string, number> = { mints_current: 0, mintsSnapshot: 0, mintsTransactions: 0 }
    for (const t of tracks) {
      next[t.scopeKey] = t.count
    }
    watchtowerTrackInputs.value = next
  },
  { immediate: true },
)

onMounted(async () => {
  await loadTenant()
})

async function saveWatchtowerTracks() {
  if (!tenant.value) return
  watchtowerTracksError.value = null
  watchtowerTracksSaving.value = true
  try {
    const supabase = useSupabase()
    const { error } = await supabase.functions.invoke('platform', {
      body: {
        action: 'billing-set-watchtower-tracks',
        tenantId: tenant.value.id,
        mints_current: watchtowerTrackInputs.value.mints_current,
        mintsSnapshot: watchtowerTrackInputs.value.mintsSnapshot,
        mintsTransactions: watchtowerTrackInputs.value.mintsTransactions,
      },
    })
    if (error) throw new Error(error.message)
    await loadTenant()
  } catch (e) {
    watchtowerTracksError.value = e instanceof Error ? e.message : 'Failed to save tracks'
  } finally {
    watchtowerTracksSaving.value = false
  }
}

async function checkOpsSlug() {
  const s = opsSlugInput.value.trim().toLowerCase()
  if (!s || !tenant.value) return
  opsSlugError.value = null
  opsSlugCheckStatus.value = 'checking'
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('platform', {
      body: { action: 'tenant-slug-check', slug: s },
    })
    if (error) { opsSlugCheckStatus.value = 'idle'; opsSlugError.value = error.message; return }
    opsSlugCheckStatus.value = (data as { available?: boolean }).available ? 'available' : 'taken'
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
    const supabase = useSupabase()
    const { error } = await supabase.functions.invoke('platform', {
      body: { action: 'tenant-slug-set', tenantId: tenant.value.id, slug: s },
    })
    if (error) { opsSlugError.value = error.message ?? 'Failed to set slug'; return }
    opsSlugInput.value = ''
    opsSlugCheckStatus.value = 'idle'
    await loadTenant()
  } catch {
    opsSlugError.value = 'Failed to set slug'
  } finally {
    slugSetLoading.value = false
  }
}

async function addAdmin() {
  const w = addAdminWallet.value.trim()
  if (!w || !tenant.value) return
  addAdminError.value = null
  addAdminLoading.value = true
  try {
    const supabase = useSupabase()
    const { data, error: fnErr } = await supabase.functions.invoke('platform', {
      body: { action: 'tenant-add-admin', tenantId: tenant.value.id, wallet: w },
    })
    if (fnErr) {
      addAdminError.value = fnErr.message ?? 'Failed to add admin'
      return
    }
    addAdminWallet.value = ''
    const admins = (data as { admins?: string[] }).admins
    if (admins && tenant.value) {
      tenant.value = { ...tenant.value, admins }
    }
  } catch {
    addAdminError.value = 'Failed to add admin'
  } finally {
    addAdminLoading.value = false
  }
}

async function fetchUnboundWhitelists() {
  if (!tenant.value) return
  whitelistError.value = null
  whitelistFetchLoading.value = true
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('platform', {
      body: { action: 'gate-fetch-unbound', tenantId: tenant.value.id },
    })
    if (error) throw new Error(error.message)
    unboundWhitelists.value = (data as { unbound?: Array<{ address: string; name: string }> }).unbound ?? []
    selectedUnboundWhitelist.value = ''
  } catch (e) {
    whitelistError.value = e instanceof Error ? e.message : 'Failed to fetch'
  } finally {
    whitelistFetchLoading.value = false
  }
}

async function bindWhitelist() {
  const addr = selectedUnboundWhitelist.value
  if (!tenant.value || !addr) return
  whitelistError.value = null
  whitelistBindLoading.value = true
  try {
    const supabase = useSupabase()
    const { error } = await supabase.functions.invoke('platform', {
      body: { action: 'gate-bind', tenantId: tenant.value.id, address: addr },
    })
    if (error) throw new Error(error.message)
    selectedUnboundWhitelist.value = ''
    await loadTenant()
    unboundWhitelists.value = unboundWhitelists.value.filter((u) => u.address !== addr)
  } catch (e) {
    whitelistError.value = e instanceof Error ? e.message : 'Failed to bind'
  } finally {
    whitelistBindLoading.value = false
  }
}

async function unbindWhitelist(address: string) {
  if (!tenant.value) return
  whitelistError.value = null
  whitelistUnbindLoading.value = address
  try {
    const supabase = useSupabase()
    const { error } = await supabase.functions.invoke('platform', {
      body: { action: 'gate-unbind', tenantId: tenant.value.id, address },
    })
    if (error) throw new Error(error.message)
    await loadTenant()
  } catch (e) {
    whitelistError.value = e instanceof Error ? e.message : 'Failed to unbind'
  } finally {
    whitelistUnbindLoading.value = null
  }
}

async function fetchUnboundRaffles() {
  if (!tenant.value) return
  raffleError.value = null
  raffleFetchLoading.value = true
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('platform', {
      body: { action: 'raffle-fetch-unbound', tenantId: tenant.value.id },
    })
    if (error) throw new Error(error.message)
    unboundRaffles.value = (data as { unbound?: Array<{ rafflePubkey: string; name: string }> }).unbound ?? []
    selectedUnboundRaffle.value = ''
  } catch (e) {
    raffleError.value = e instanceof Error ? e.message : 'Failed to fetch'
  } finally {
    raffleFetchLoading.value = false
  }
}

async function bindRaffle() {
  const pubkey = selectedUnboundRaffle.value
  if (!tenant.value || !pubkey) return
  raffleError.value = null
  raffleBindLoading.value = true
  try {
    const supabase = useSupabase()
    const { error } = await supabase.functions.invoke('platform', {
      body: { action: 'raffle-bind', tenantId: tenant.value.id, rafflePubkey: pubkey },
    })
    if (error) throw new Error(error.message)
    selectedUnboundRaffle.value = ''
    await loadTenant()
    unboundRaffles.value = unboundRaffles.value.filter((u) => u.rafflePubkey !== pubkey)
  } catch (e) {
    raffleError.value = e instanceof Error ? e.message : 'Failed to bind'
  } finally {
    raffleBindLoading.value = false
  }
}

async function importCrafterToken() {
  const mint = crafterImportMint.value.trim()
  if (!tenant.value || !mint) return
  crafterImportError.value = null
  crafterImportLoading.value = true
  try {
    const supabase = useSupabase()
    const { error } = await supabase.functions.invoke('platform', {
      body: {
        action: 'crafter-import-token',
        tenantId: tenant.value.id,
        mint,
        name: crafterImportName.value.trim() || undefined,
        symbol: crafterImportSymbol.value.trim() || undefined,
      },
    })
    if (error) throw new Error(error.message)
    crafterImportMint.value = ''
    crafterImportName.value = ''
    crafterImportSymbol.value = ''
    await loadTenant()
  } catch (e) {
    crafterImportError.value = e instanceof Error ? e.message : 'Failed to import'
  } finally {
    crafterImportLoading.value = false
  }
}

async function removeCrafterToken(mint: string) {
  if (!tenant.value) return
  crafterImportError.value = null
  crafterRemoveLoading.value = mint
  try {
    const supabase = useSupabase()
    const { error } = await supabase.functions.invoke('platform', {
      body: {
        action: 'crafter-remove-token',
        tenantId: tenant.value.id,
        mint,
      },
    })
    if (error) throw new Error(error.message)
    crafterTokens.value = crafterTokens.value.filter((t) => t.mint !== mint)
  } catch (e) {
    crafterImportError.value = e instanceof Error ? e.message : 'Failed to remove'
  } finally {
    crafterRemoveLoading.value = null
  }
}

async function unbindRaffle(rafflePubkey: string) {
  if (!tenant.value) return
  raffleError.value = null
  raffleUnbindLoading.value = rafflePubkey
  try {
    const supabase = useSupabase()
    const { error } = await supabase.functions.invoke('platform', {
      body: { action: 'raffle-unbind', tenantId: tenant.value.id, rafflePubkey },
    })
    if (error) throw new Error(error.message)
    await loadTenant()
  } catch (e) {
    raffleError.value = e instanceof Error ? e.message : 'Failed to unbind'
  } finally {
    raffleUnbindLoading.value = null
  }
}

async function loadTenant() {
  loading.value = true
  error.value = null
  try {
    const tenantId = route.params.slug as string
    const supabase = useSupabase()
    const { data, error: fnErr } = await supabase.functions.invoke('platform', {
      body: { action: 'tenant-get', tenantId },
    })
    if (fnErr) throw new Error(fnErr.message)
    const d = data as {
      tenant: TenantConfig
      subscriptions?: Array<Record<string, unknown>>
      billing?: { payments: BillingPayment[] }
      stats?: TenantStats
      gates?: Array<{ address: string; name: string }>
      raffles?: Array<{ raffle_pubkey: string; created_at: string; closed_at: string | null }>
      crafterTokens?: Array<{ mint: string; name: string | null; symbol: string | null; decimals: number | null; authority: string; created_at: string }>
    }
    tenant.value = d.tenant
    stats.value = d.stats ?? { activeModules: 0, totalPayments: 0, lastPaymentAt: null }
    whitelists.value = d.gates ?? []
    raffles.value = d.raffles ?? []
    crafterTokens.value = d.crafterTokens ?? []
    const rawSubs = d.billing?.subscriptions ?? d.subscriptions ?? []
    billingSubsRaw.value = rawSubs
    const subs: Record<string, SubscriptionSummary | null> = {}
    for (const sub of rawSubs) {
      subs[sub.module_id as string] = {
        billingPeriod: sub.billing_period as string,
        periodStart: sub.period_start as string,
        periodEnd: sub.period_end as string,
        recurringAmountUsdc: Number(sub.recurring_amount_usdc),
      }
    }
    subscriptions.value = subs
    payments.value = d.billing?.payments ?? []
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load tenant'
  } finally {
    loading.value = false
  }
}

async function toggleModule(moduleId: string, enabled: boolean, _periodEnd?: string) {
  if (!tenant.value) return
  moduleError.value = null
  toggleLoading.value = moduleId
  try {
    const supabase = useSupabase()
    const state = enabled ? 'active' : 'off'
    const { data, error } = await supabase.functions.invoke('platform', {
      body: { action: 'tenant-module', tenantId: tenant.value.id, moduleId, state },
    })
    if (error) throw new Error(error.message)
    if ((data as { ok?: boolean }).ok) await loadTenant()
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
    const supabase = useSupabase()
    const { error } = await supabase.functions.invoke('platform', {
      body: {
        action: 'billing-set-period-end',
        tenantId: tenant.value.id,
        moduleId,
        periodEnd: setPeriodEndForm.value.periodEnd,
      },
    })
    if (error) throw new Error(error.message ?? 'Failed to set end date')
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
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-card);
  min-width: 10rem;
}

.ops-tenant__slug-input:focus {
  outline: none;
  border-color: var(--theme-primary);
}

.ops-tenant__slug-input--short {
  min-width: 6rem;
  max-width: 8rem;
}

.ops-tenant__import-form {
  flex-wrap: wrap;
  gap: 0.5rem;
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

.ops-tenant__admin-list {
  flex-wrap: wrap;
  flex-direction: row;
  gap: 0.35rem;
}

.ops-tenant__admin-item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.35rem;
  background: var(--theme-bg-secondary);
  border-radius: var(--theme-radius-sm);
  border: 1px solid var(--theme-border);
}

.ops-tenant__admin-addr {
  font-size: var(--theme-font-xs);
  max-width: 7rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ops-tenant__admin-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  background: none;
  border: none;
  color: var(--theme-text-secondary);
  cursor: pointer;
  border-radius: var(--theme-radius-sm);
  font-size: 0.875rem;
  text-decoration: none;
}

.ops-tenant__admin-btn:hover {
  color: var(--theme-primary);
  background: var(--theme-bg-card);
}

.ops-tenant__admins-row {
  grid-column: 1 / -1;
}

.ops-tenant__add-admin {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
  min-width: 0;
}

.ops-tenant__add-admin-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.ops-tenant__add-admin-row .ops-tenant__slug-input {
  flex: 1;
  min-width: 0;
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

.ops-tenant__watchtower-tracks {
  margin-bottom: var(--theme-space-md);
  padding-bottom: var(--theme-space-md);
  border-bottom: 1px solid var(--theme-border-subtle);
}

.ops-tenant__tracks-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--theme-space-md);
}

.ops-tenant__track-item {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
}

.ops-tenant__track-item label {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.ops-tenant__track-input {
  width: 4rem;
  font-size: var(--theme-font-sm);
  padding: 0.25rem 0.35rem;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-card);
}

.ops-tenant__track-input:focus {
  outline: none;
  border-color: var(--theme-primary);
}

.ops-tenant__billing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--theme-space-md);
}

.ops-tenant__panel-hint {
  margin: 0 0 var(--theme-space-sm);
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.ops-tenant__bind-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--theme-space-lg);
}

.ops-tenant__bound-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.ops-tenant__bound-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.ops-tenant__bound-address {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
}

.ops-tenant__bind-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.ops-tenant__bind-row .ops-tenant__select {
  min-width: 14rem;
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
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-card);
}

.ops-tenant__date-input:focus {
  outline: none;
  border-color: var(--theme-primary);
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
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-card);
  max-width: 12rem;
  cursor: pointer;
}

.ops-tenant__select:focus {
  outline: none;
  border-color: var(--theme-primary);
}

.ops-tenant__select option {
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-card);
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

