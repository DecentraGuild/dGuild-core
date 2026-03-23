<template>
  <PageSection>
    <div class="ops flex flex-col gap-6">
      <header class="ops__header flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <Button type="button" variant="ghost" size="sm" class="-ml-2 mb-1 text-muted-foreground hover:text-foreground" @click="back">
            ← Back to overview
          </Button>
          <h1 class="ops__title m-0 text-xl font-semibold text-foreground">
            {{ tenant?.name ?? 'Tenant' }}
          </h1>
          <p class="ops__subtitle m-0 text-muted-foreground">
            {{ tenantIdentifier }}
          </p>
        </div>
        <div class="flex flex-col md:flex-row gap-6 shrink-0">
          <div class="min-w-[120px]">
            <span class="block text-xs text-muted-foreground">Active modules</span>
            <span class="text-lg font-semibold">{{ stats?.activeModules ?? 0 }}</span>
          </div>
          <div class="min-w-[120px]">
            <span class="block text-xs text-muted-foreground">Payments</span>
            <span class="text-lg font-semibold">{{ stats?.totalPayments ?? 0 }}</span>
          </div>
        </div>
      </header>

      <Card v-if="loading" class="p-6">
        <p class="text-muted-foreground text-sm m-0">Loading tenant…</p>
      </Card>
      <Card v-else-if="error" class="p-6">
        <p class="text-destructive text-sm m-0">{{ error }}</p>
      </Card>
      <div v-else-if="tenant" class="ops__grid grid gap-4 grid-cols-1 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
        <Card class="col-span-1" aria-label="Config">
          <CardHeader><CardTitle>Config</CardTitle></CardHeader>
          <CardContent>
            <dl class="grid gap-4 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
              <div>
                <dt class="text-xs text-muted-foreground">ID</dt>
                <dd class="m-0"><code class="font-mono text-xs">{{ tenant.id }}</code></dd>
              </div>
              <div>
                <dt class="text-xs text-muted-foreground">Slug</dt>
                <dd class="m-0">
                  <span v-if="tenant.slug"><code class="font-mono text-xs">{{ tenant.slug }}</code></span>
                  <span v-else class="text-muted-foreground">none</span>
                </dd>
              </div>
              <div class="col-span-full">
                <dt class="text-xs text-muted-foreground">Set slug (ops)</dt>
                <dd class="m-0 flex flex-wrap items-center gap-2">
                  <Input v-model="opsSlugInput" type="text" placeholder="e.g. my-community" class="min-w-[10rem]" :disabled="slugSetLoading" @keydown.enter.prevent="checkOpsSlug()" />
                  <span v-if="opsSlugCheckStatus === 'available'" class="text-xs text-green-600 dark:text-green-500">Available</span>
                  <span v-else-if="opsSlugCheckStatus === 'taken'" class="text-xs text-destructive">Taken</span>
                  <span v-else-if="opsSlugCheckStatus === 'checking'" class="text-xs text-muted-foreground">Checking…</span>
                  <Button size="xs" variant="ghost" :disabled="!opsSlugInput.trim() || slugSetLoading" @click="checkOpsSlug()">Check</Button>
                  <Button size="xs" variant="primary" :disabled="opsSlugCheckStatus !== 'available' || slugSetLoading" @click="setOpsSlug()">{{ slugSetLoading ? 'Saving…' : 'Set slug' }}</Button>
                  <span v-if="opsSlugError" class="text-xs text-destructive w-full">{{ opsSlugError }}</span>
                </dd>
              </div>
              <div>
                <dt class="text-xs text-muted-foreground">Treasury</dt>
                <dd class="m-0">
                  <span v-if="tenant.treasury"><code class="font-mono text-xs">{{ tenant.treasury }}</code></span>
                  <span v-else class="text-muted-foreground">none</span>
                </dd>
              </div>
              <div class="col-span-full">
                <dt class="text-xs text-muted-foreground">Admins</dt>
                <dd class="m-0">
                  <ul class="list-none p-0 m-0 flex flex-wrap gap-1.5">
                    <li v-for="a in tenant.admins" :key="a" class="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5">
                      <code class="font-mono text-xs max-w-[7rem] truncate">{{ truncateAddress(a, 4, 4) }}</code>
                      <button type="button" class="inline-flex h-6 w-6 items-center justify-center rounded p-0 text-muted-foreground hover:text-primary hover:bg-card" aria-label="Copy" @click="copyAdmin(a)">
                        <Icon :icon="copiedAdmin === a ? 'lucide:check' : 'lucide:copy'" class="text-sm" />
                      </button>
                      <a :href="explorerLinks.accountUrl(a)" target="_blank" rel="noopener" class="inline-flex h-6 w-6 items-center justify-center rounded p-0 text-muted-foreground hover:text-primary hover:bg-card" aria-label="Solscan">
                        <Icon icon="lucide:external-link" class="text-sm" />
                      </a>
                    </li>
                    <li v-if="!tenant.admins?.length" class="text-muted-foreground">none</li>
                  </ul>
                  <div class="mt-2 flex flex-col gap-2">
                    <div class="flex items-center gap-2 min-w-0">
                      <Input v-model="addAdminWallet" type="text" placeholder="Wallet address" class="flex-1 min-w-0" :disabled="addAdminLoading" @keydown.enter.prevent="addAdmin()" />
                      <Button size="xs" variant="primary" :disabled="!addAdminWallet.trim() || addAdminLoading" @click="addAdmin()">{{ addAdminLoading ? 'Adding…' : 'Add admin' }}</Button>
                    </div>
                    <span v-if="addAdminError" class="text-xs text-destructive">{{ addAdminError }}</span>
                  </div>
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card aria-label="Modules">
          <CardHeader><CardTitle>Modules</CardTitle></CardHeader>
          <CardContent>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-border">
                    <th class="h-9 px-4 text-left font-medium">Module</th>
                    <th class="h-9 px-4 text-left font-medium">State</th>
                    <th class="h-9 px-4 text-left font-medium">Subscription</th>
                    <th class="h-9 px-4 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="entry in moduleRows" :key="entry.id" class="border-b border-border/50">
                    <td class="p-4">{{ entry.id }}</td>
                    <td class="p-4">{{ entry.state }}</td>
                    <td class="p-4">
                      <span v-if="entry.subscription">{{ entry.subscription.billingPeriod }} until {{ formatDate(entry.subscription.periodEnd) }}</span>
                      <span v-else class="text-muted-foreground">none</span>
                    </td>
                    <td class="p-4 flex flex-wrap items-center gap-1.5">
                      <div v-if="entry.state === 'off'" class="inline-flex items-center gap-1.5">
                        <Input v-model="endDateByModule[entry.id]" type="date" class="h-8 w-36 text-xs" :min="minDateForNewSub" aria-label="End date (optional)" />
                        <Button size="xs" variant="ghost" :disabled="toggleLoading === entry.id" @click="toggleModule(entry.id, true, endDateByModule[entry.id] || undefined)">Enable</Button>
                      </div>
                      <template v-else>
                        <Button size="xs" variant="ghost" :disabled="toggleLoading === entry.id" @click="toggleModule(entry.id, false)">Disable</Button>
                      </template>
                      <Button size="xs" variant="ghost" class="ml-0.5" :disabled="setPeriodEndLoading === entry.id" @click="openSetPeriodEnd(entry.id)">Set end date</Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="moduleError" class="mt-2 text-xs text-destructive">{{ moduleError }}</p>
          </CardContent>
        </Card>

        <Card class="col-span-full" aria-label="Whitelists">
          <CardHeader>
            <CardTitle>Whitelists</CardTitle>
            <CardDescription>Bind on-chain gates to this tenant when creation succeeded but DB assignment failed.</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid gap-6 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
              <div>
                <h3 class="m-0 mb-1 text-sm font-medium">Bound lists</h3>
                <ul v-if="whitelists.length" class="list-none p-0 m-0 flex flex-col gap-1.5">
                  <li v-for="w in whitelists" :key="w.address" class="flex items-center gap-2 flex-wrap">
                    <span>{{ w.name }}</span>
                    <code class="font-mono text-xs text-muted-foreground">{{ truncateAddress(w.address) }}</code>
                    <Button size="xs" variant="ghost" :disabled="whitelistUnbindLoading === w.address" @click="unbindWhitelist(w.address)">{{ whitelistUnbindLoading === w.address ? 'Removing…' : 'Remove' }}</Button>
                  </li>
                </ul>
                <p v-else class="text-muted-foreground m-0">No gates bound.</p>
              </div>
              <div>
                <h3 class="m-0 mb-1 text-sm font-medium">Bind unbound list</h3>
                <div class="flex flex-wrap items-center gap-2">
                  <Button size="xs" variant="secondary" :disabled="whitelistFetchLoading" @click="fetchUnboundWhitelists">{{ whitelistFetchLoading ? 'Fetching…' : 'Fetch unbound' }}</Button>
                  <select v-model="selectedUnboundWhitelist" class="flex h-9 min-w-[14rem] rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground" :disabled="!unboundWhitelists.length || whitelistBindLoading">
                    <option value="">{{ unboundWhitelists.length ? 'Select list…' : 'No unbound lists' }}</option>
                    <option v-for="u in unboundWhitelists" :key="u.address" :value="u.address">{{ u.name }} ({{ truncateAddress(u.address) }})</option>
                  </select>
                  <Button size="xs" variant="primary" :disabled="!selectedUnboundWhitelist || whitelistBindLoading" @click="bindWhitelist">{{ whitelistBindLoading ? 'Binding…' : 'Bind' }}</Button>
                </div>
                <p v-if="whitelistError" class="mt-2 text-xs text-destructive">{{ whitelistError }}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card class="col-span-full" aria-label="Raffles">
          <CardHeader>
            <CardTitle>Raffles</CardTitle>
            <CardDescription>Bind on-chain raffles to this tenant when creation succeeded but DB assignment failed.</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid gap-6 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
              <div>
                <h3 class="m-0 mb-1 text-sm font-medium">Bound raffles</h3>
                <ul v-if="raffles.length" class="list-none p-0 m-0 flex flex-col gap-1.5">
                  <li v-for="r in raffles" :key="r.raffle_pubkey" class="flex items-center gap-2 flex-wrap">
                    <code class="font-mono text-xs text-muted-foreground">{{ truncateAddress(r.raffle_pubkey) }}</code>
                    <span v-if="r.closed_at" class="text-muted-foreground">(closed)</span>
                    <Button size="xs" variant="ghost" :disabled="raffleUnbindLoading === r.raffle_pubkey" @click="unbindRaffle(r.raffle_pubkey)">{{ raffleUnbindLoading === r.raffle_pubkey ? 'Removing…' : 'Remove' }}</Button>
                  </li>
                </ul>
                <p v-else class="text-muted-foreground m-0">No raffles bound.</p>
              </div>
              <div>
                <h3 class="m-0 mb-1 text-sm font-medium">Bind unbound raffle</h3>
                <div class="flex flex-wrap items-center gap-2">
                  <Button size="xs" variant="secondary" :disabled="raffleFetchLoading" @click="fetchUnboundRaffles">{{ raffleFetchLoading ? 'Fetching…' : 'Fetch unbound' }}</Button>
                  <select v-model="selectedUnboundRaffle" class="flex h-9 min-w-[14rem] rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground" :disabled="!unboundRaffles.length || raffleBindLoading">
                    <option value="">{{ unboundRaffles.length ? 'Select raffle…' : 'No unbound raffles' }}</option>
                    <option v-for="u in unboundRaffles" :key="u.rafflePubkey" :value="u.rafflePubkey">{{ u.name }} ({{ truncateAddress(u.rafflePubkey) }})</option>
                  </select>
                  <Button size="xs" variant="primary" :disabled="!selectedUnboundRaffle || raffleBindLoading" @click="bindRaffle">{{ raffleBindLoading ? 'Binding…' : 'Bind' }}</Button>
                </div>
                <p v-if="raffleError" class="mt-2 text-xs text-destructive">{{ raffleError }}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card class="col-span-full" aria-label="Crafter">
          <CardHeader>
            <CardTitle>Crafter</CardTitle>
            <CardDescription>Import tokens when creation succeeded on-chain but confirm failed (e.g. non-2xx from Edge Function).</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid gap-6 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
              <div>
                <h3 class="m-0 mb-1 text-sm font-medium">Tokens</h3>
                <ul v-if="crafterTokens.length" class="list-none p-0 m-0 flex flex-col gap-1.5">
                  <li v-for="t in crafterTokens" :key="t.mint" class="flex items-center gap-2 flex-wrap">
                    <span>{{ t.name || t.symbol }}</span>
                    <code class="font-mono text-xs text-muted-foreground">{{ truncateAddress(t.mint) }}</code>
                    <a :href="explorerLinks.accountUrl(t.mint)" target="_blank" rel="noopener" class="inline-flex h-6 w-6 items-center justify-center rounded p-0 text-muted-foreground hover:text-primary hover:bg-card" aria-label="Solscan"><Icon icon="lucide:external-link" /></a>
                    <Button size="xs" variant="ghost" :disabled="crafterRemoveLoading === t.mint" @click="removeCrafterToken(t.mint)">{{ crafterRemoveLoading === t.mint ? 'Removing…' : 'Remove' }}</Button>
                  </li>
                </ul>
                <p v-else class="text-muted-foreground m-0">No crafter tokens.</p>
              </div>
              <div>
                <h3 class="m-0 mb-1 text-sm font-medium">Import token</h3>
                <div class="flex flex-wrap items-center gap-2">
                  <Input v-model="crafterImportMint" type="text" placeholder="Mint address" :disabled="crafterImportLoading" class="min-w-[12rem]" />
                  <Input v-model="crafterImportName" type="text" placeholder="Name (optional)" :disabled="crafterImportLoading" class="w-28 min-w-0" />
                  <Input v-model="crafterImportSymbol" type="text" placeholder="Symbol (optional)" :disabled="crafterImportLoading" class="w-28 min-w-0" />
                  <Button size="xs" variant="primary" :disabled="!crafterImportMint.trim() || crafterImportLoading" @click="importCrafterToken">{{ crafterImportLoading ? 'Importing…' : 'Import' }}</Button>
                </div>
                <p v-if="crafterImportError" class="mt-2 text-xs text-destructive">{{ crafterImportError }}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card class="col-span-full" aria-label="Billing">
          <CardHeader><CardTitle>Billing</CardTitle></CardHeader>
          <CardContent>
            <div v-if="hasWatchtowerModule" class="mb-4 pb-4 border-b border-border/50">
              <h3 class="m-0 mb-1 text-sm font-medium">Watchtower tracks (ops override)</h3>
              <p class="m-0 mb-2 text-xs text-muted-foreground">Manually set paid track counts when billing sync was wrong. Changes apply immediately.</p>
              <div class="flex flex-wrap items-center gap-4">
                <div v-for="t in watchtowerTracks" :key="t.scopeKey" class="flex items-center gap-2">
                  <label :for="`track-${t.scopeKey}`" class="text-sm text-muted-foreground">{{ t.label }}</label>
                  <Input :id="`track-${t.scopeKey}`" v-model.number="watchtowerTrackInputs[t.scopeKey]" type="number" min="0" class="w-16" />
                </div>
                <Button size="xs" variant="primary" :disabled="watchtowerTracksSaving" @click="saveWatchtowerTracks">{{ watchtowerTracksSaving ? 'Saving…' : 'Save tracks' }}</Button>
              </div>
              <p v-if="watchtowerTracksError" class="mt-2 text-xs text-destructive">{{ watchtowerTracksError }}</p>
            </div>
            <div class="grid gap-4 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
              <div>
                <h3 class="m-0 mb-1 text-sm font-medium">Subscriptions</h3>
                <div class="overflow-x-auto">
                  <table class="w-full text-sm border-collapse">
                    <thead><tr class="border-b border-border"><th class="h-9 px-2 py-1 text-left font-medium">Module</th><th class="h-9 px-2 py-1 text-left font-medium">Billing</th><th class="h-9 px-2 py-1 text-left font-medium">Period end</th></tr></thead>
                    <tbody>
                      <tr v-for="entry in moduleRows" :key="entry.id" class="border-b border-border/50">
                        <td class="p-2">{{ entry.id }}</td>
                        <td class="p-2"><span v-if="entry.subscription">{{ entry.subscription.billingPeriod }}</span><span v-else class="text-muted-foreground">none</span></td>
                        <td class="p-2"><span v-if="entry.subscription">{{ formatDate(entry.subscription.periodEnd) }}</span><span v-else class="text-muted-foreground">n/a</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 class="m-0 mb-1 text-sm font-medium">Payments</h3>
                <div class="overflow-x-auto">
                  <table class="w-full text-sm border-collapse">
                    <thead><tr class="border-b border-border"><th class="h-9 px-2 py-1 text-left font-medium">Module</th><th class="h-9 px-2 py-1 text-left font-medium">Amount</th><th class="h-9 px-2 py-1 text-left font-medium">Status</th><th class="h-9 px-2 py-1 text-left font-medium">Confirmed</th><th class="h-9 px-2 py-1 text-left font-medium">Tx</th></tr></thead>
                    <tbody>
                      <tr v-for="p in payments" :key="p.id" class="border-b border-border/50">
                        <td class="p-2">{{ p.moduleId }}</td>
                        <td class="p-2">{{ formatUsdc(p.amountUsdc) }} USDC</td>
                        <td class="p-2">{{ p.status }}</td>
                        <td class="p-2"><span v-if="p.confirmedAt">{{ formatDate(p.confirmedAt) }}</span><span v-else class="text-muted-foreground">n/a</span></td>
                        <td class="p-2"><a v-if="p.txSignature" :href="explorerLinks.txUrl(p.txSignature)" target="_blank" rel="noopener" class="text-primary hover:underline">View</a><span v-else class="text-muted-foreground">n/a</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    <Dialog :open="setPeriodEndModuleId !== null" @update:open="(v) => { if (!v) setPeriodEndModuleId = null }">
      <DialogContent class="sm:max-w-md">
        <form v-if="setPeriodEndModuleId" class="flex flex-col gap-4" @submit.prevent="submitSetPeriodEnd">
          <DialogHeader>
            <DialogTitle>Set end date</DialogTitle>
            <DialogDescription>Module: <code class="font-mono text-xs">{{ setPeriodEndModuleId }}</code></DialogDescription>
          </DialogHeader>
          <div class="flex flex-col gap-2">
            <label for="set-period-end-date" class="text-sm font-medium text-foreground">End date</label>
            <Input id="set-period-end-date" v-model="setPeriodEndForm.periodEnd" type="date" required :min="minDateForNewSub" />
          </div>
          <div class="flex flex-col gap-2">
            <label for="set-period-end-billing" class="text-sm font-medium text-foreground">Billing period (for new subscription)</label>
            <select id="set-period-end-billing" v-model="setPeriodEndForm.billingPeriod" class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground">
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <p v-if="setPeriodEndError" class="text-xs text-destructive m-0">{{ setPeriodEndError }}</p>
          <DialogFooter class="gap-2 sm:gap-0">
            <Button type="button" variant="secondary" @click="setPeriodEndModuleId = null">Cancel</Button>
            <Button type="submit" variant="primary" :disabled="setPeriodEndSaving">{{ setPeriodEndSaving ? 'Saving…' : 'Set end date' }}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </PageSection>
</template>

<script setup lang="ts">
definePageMeta({ title: 'Tenant detail' })

import type { TenantConfig } from '@decentraguild/core'
import { formatDate, formatUsdc } from '@decentraguild/display'
import { truncateAddress } from '@decentraguild/display'
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { useSupabase, invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useExplorerLinks } from '~/composables/useExplorerLinks'
import { useOpsTenantSlug } from '~/composables/useOpsTenantSlug'
import { useOpsTenantAdmins } from '~/composables/useOpsTenantAdmins'
import { useOpsTenantBindList } from '~/composables/useOpsTenantBindList'
import { useOpsTenantModules } from '~/composables/useOpsTenantModules'
import { useOpsTenantCrafter } from '~/composables/useOpsTenantCrafter'
import { useOpsTenantBilling } from '~/composables/useOpsTenantBilling'

interface SubscriptionSummary { billingPeriod: string; periodStart: string; periodEnd: string; recurringAmountUsdc: number }
interface BillingPayment { id: string; tenantSlug: string; moduleId: string; amountUsdc: number; status: string; confirmedAt: string | null; txSignature: string | null }
interface TenantStats { activeModules: number; totalPayments: number; lastPaymentAt: string | null }

const route = useRoute()
const router = useRouter()
const explorerLinks = useExplorerLinks()

const tenant = ref<TenantConfig | null>(null)
const tenantId = computed(() => tenant.value?.id ?? null)
const stats = ref<TenantStats | null>(null)
const subscriptions = ref<Record<string, SubscriptionSummary | null>>({})
const billingSubsRaw = ref<Array<Record<string, unknown>>>([])
const meterLimits = ref<Array<{ meter_key: string; quantity_total: number; expires_at_max: string | null }>>([])
const payments = ref<BillingPayment[]>([])
const whitelists = ref<Array<{ address: string; name: string }>>([])
const raffles = ref<Array<{ raffle_pubkey: string; created_at: string; closed_at: string | null }>>([])

const loading = ref(true)
const error = ref<string | null>(null)

const minDateForNewSub = computed(() => {
  const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10)
})

const tenantIdentifier = computed(() => {
  if (!tenant.value) return ''
  return tenant.value.slug ?? tenant.value.id
})

async function loadTenant() {
  loading.value = true; error.value = null
  try {
    const routeId = route.params.slug as string
    const supabase = useSupabase()
    const d = await invokeEdgeFunction<{
      tenant: TenantConfig
      subscriptions?: Array<Record<string, unknown>>
      billing?: { payments: BillingPayment[]; meterLimits?: Array<{ meter_key: string; quantity_total: number; expires_at_max: string | null }>; subscriptions?: Array<Record<string, unknown>> }
      stats?: TenantStats
      gates?: Array<{ address: string; name: string }>
      raffles?: Array<{ raffle_pubkey: string; created_at: string; closed_at: string | null }>
      crafterTokens?: Array<{ mint: string; name: string | null; symbol: string | null; decimals: number | null; authority: string; created_at: string }>
    }>(supabase, 'platform', { action: 'tenant-get', tenantId: routeId })
    tenant.value = d.tenant
    stats.value = d.stats ?? { activeModules: 0, totalPayments: 0, lastPaymentAt: null }
    whitelists.value = d.gates ?? []
    raffles.value = d.raffles ?? []
    crafterTokens.value = d.crafterTokens ?? []
    const rawSubs = d.billing?.subscriptions ?? d.subscriptions ?? []
    billingSubsRaw.value = rawSubs
    meterLimits.value = d.billing?.meterLimits ?? []
    const subs: Record<string, SubscriptionSummary | null> = {}
    for (const sub of rawSubs) {
      subs[sub.module_id as string] = { billingPeriod: sub.billing_period as string, periodStart: sub.period_start as string, periodEnd: sub.period_end as string, recurringAmountUsdc: Number(sub.recurring_amount_usdc) }
    }
    subscriptions.value = subs
    payments.value = d.billing?.payments ?? []
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load tenant'
  } finally { loading.value = false }
}

const {
  moduleError, toggleLoading, endDateByModule,
  setPeriodEndModuleId, setPeriodEndForm, setPeriodEndError, setPeriodEndSaving, setPeriodEndLoading,
  moduleRows, toggleModule, openSetPeriodEnd, submitSetPeriodEnd,
} = useOpsTenantModules(tenant, subscriptions, minDateForNewSub, loadTenant)

const {
  crafterTokens, crafterImportMint, crafterImportName, crafterImportSymbol,
  crafterImportLoading, crafterImportError, crafterRemoveLoading,
  importCrafterToken, removeCrafterToken,
} = useOpsTenantCrafter(tenant, loadTenant)

const {
  watchtowerTracks, watchtowerTrackInputs, watchtowerTracksSaving, watchtowerTracksError,
  hasWatchtowerModule, saveWatchtowerTracks,
} = useOpsTenantBilling(tenant, meterLimits, billingSubsRaw, loadTenant)

const { slugInput: opsSlugInput, checkStatus: opsSlugCheckStatus, slugError: opsSlugError, saving: slugSetLoading, check: checkOpsSlug, set: setOpsSlug } = useOpsTenantSlug(tenantId, loadTenant)
const { walletInput: addAdminWallet, adding: addAdminLoading, addError: addAdminError, copiedAddress: copiedAdmin, addAdmin, copyAdmin } = useOpsTenantAdmins(tenant)

const {
  unboundItems: unboundWhitelists, selectedUnbound: selectedUnboundWhitelist,
  fetchLoading: whitelistFetchLoading, bindLoading: whitelistBindLoading, unbindLoading: whitelistUnbindLoading,
  listError: whitelistError, fetchUnbound: fetchUnboundWhitelists, bind: bindWhitelist, unbind: unbindWhitelist,
} = useOpsTenantBindList<{ address: string; name: string }>(tenantId, { fetchAction: 'gate-fetch-unbound', bindAction: 'gate-bind', unbindAction: 'gate-unbind', keyField: 'address', parseUnbound: (data) => (data as { unbound?: Array<{ address: string; name: string }> }).unbound ?? [] }, loadTenant)

const {
  unboundItems: unboundRaffles, selectedUnbound: selectedUnboundRaffle,
  fetchLoading: raffleFetchLoading, bindLoading: raffleBindLoading, unbindLoading: raffleUnbindLoading,
  listError: raffleError, fetchUnbound: fetchUnboundRaffles, bind: bindRaffle, unbind: unbindRaffle,
} = useOpsTenantBindList<{ rafflePubkey: string; name: string }>(tenantId, { fetchAction: 'raffle-fetch-unbound', bindAction: 'raffle-bind', unbindAction: 'raffle-unbind', keyField: 'rafflePubkey', parseUnbound: (data) => (data as { unbound?: Array<{ rafflePubkey: string; name: string }> }).unbound ?? [] }, loadTenant)

onMounted(async () => { await loadTenant() })

function back() {
  if (history.length > 1) router.back()
  else router.push('/ops')
}
</script>
