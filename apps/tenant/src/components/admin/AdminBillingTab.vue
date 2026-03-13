<template>
  <div class="admin__split">
    <div class="admin__panel">
      <Card>
        <h3>Billing History</h3>
        <div v-if="loading" class="admin__billing-loading">
          <Icon icon="lucide:loader-2" class="admin__spinner" />
          <span>Loading payments...</span>
        </div>
        <div v-else-if="payments.length === 0" class="admin__billing-empty">
          No payments recorded yet.
        </div>
        <table v-else class="admin__billing-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Module</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Period</th>
              <th>End date</th>
              <th>Tx</th>
              <th>Invoice</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in payments" :key="p.id">
              <td>{{ formatPaymentDate(p.confirmedAt) }}</td>
              <td>{{ MODULE_NAV[p.moduleId]?.label ?? p.moduleId }}</td>
              <td>{{ formatPaymentType(p) }}</td>
              <td class="admin__billing-amount">{{ formatUsdc(p.amountUsdc) }} USDC</td>
              <td>{{ formatPeriod(p) }}</td>
              <td>{{ formatPeriodEnd(p) }}</td>
              <td>
                <a
                  v-if="p.txSignature"
                  :href="`https://solscan.io/tx/${p.txSignature}`"
                  target="_blank"
                  rel="noopener"
                  class="admin__billing-tx-link"
                >
                  <Icon icon="lucide:external-link" />
                </a>
              </td>
              <td>
                <button class="admin__billing-invoice-btn" @click="downloadInvoice(p.id)">
                  <Icon icon="lucide:download" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
    <div aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import { formatUsdc } from '@decentraguild/display'
import { Card } from '~/components/ui/card'
import { Icon } from '@iconify/vue'
import { useTenantStore } from '~/stores/tenant'
import { MODULE_NAV } from '~/config/modules'
import { useSupabase } from '~/composables/core/useSupabase'

defineProps<{
  slug: string | null
}>()

const tenantStore = useTenantStore()
const tenantId = computed(() => tenantStore.tenantId)
const payments = ref<BillingPaymentRecord[]>([])
const loading = ref(false)

interface BillingPaymentRecord {
  id: string
  moduleId: string
  paymentType: string
  amountUsdc: number
  billingPeriod: string
  periodEnd: string | null
  txSignature: string | null
  confirmedAt: string | null
  priceSnapshot: {
    previousTierName?: string
    newTierName?: string
    remainingDays?: number
  } | null
}

async function load() {
  if (!tenantId.value) return
  loading.value = true
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase
      .from('billing_payments')
      .select('id, module_id, payment_type, amount_usdc, billing_period, period_end, tx_signature, confirmed_at, price_snapshot')
      .eq('tenant_id', tenantId.value)
      .eq('status', 'confirmed')
      .order('confirmed_at', { ascending: false })

    if (!error && data) {
      payments.value = data.map((r) => ({
        id: r.id as string,
        moduleId: r.module_id as string,
        paymentType: r.payment_type as string,
        amountUsdc: Number(r.amount_usdc),
        billingPeriod: r.billing_period as string,
        periodEnd: r.period_end as string | null,
        txSignature: r.tx_signature as string | null,
        confirmedAt: r.confirmed_at as string | null,
        priceSnapshot: r.price_snapshot as BillingPaymentRecord['priceSnapshot'],
      }))
    }
  } catch {
    // silent
  } finally {
    loading.value = false
  }
}

watch(tenantId, (id) => {
  if (id) load()
}, { immediate: true })

function formatPaymentDate(iso: string | null): string {
  if (!iso) return '--'
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
  } catch {
    return iso
  }
}

function formatPaymentType(p: BillingPaymentRecord): string {
  if (p.paymentType === 'upgrade_prorate' && p.priceSnapshot) {
    const prev = p.priceSnapshot.previousTierName
    const next = p.priceSnapshot.newTierName
    const days = p.priceSnapshot.remainingDays
    if (prev && next) {
      return `Upgrade (${prev} to ${next}${days ? `, ${days}d remaining` : ''})`
    }
  }
  const labels: Record<string, string> = {
    initial: 'Initial',
    registration: 'Registration',
    upgrade_prorate: 'Upgrade',
    renewal: 'Renewal',
    extend: 'Extension',
  }
  return labels[p.paymentType] ?? p.paymentType
}

/** Admin registration is one-time permanent; slug and other modules are recurring. */
function isOneTimePayment(p: BillingPaymentRecord): boolean {
  return p.moduleId === 'admin' && p.paymentType === 'registration'
}

function formatPeriod(p: BillingPaymentRecord): string {
  return isOneTimePayment(p) ? 'one-time' : p.billingPeriod
}

function formatPeriodEnd(p: BillingPaymentRecord): string {
  return isOneTimePayment(p) ? '--' : formatPaymentDate(p.periodEnd)
}


async function downloadInvoice(paymentId: string) {
  if (!tenantId.value) return
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase
      .from('billing_payments')
      .select('*')
      .eq('id', paymentId)
      .single()
    if (error || !data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoice-${paymentId}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    // silent
  }
}

defineExpose({ load })
</script>

<style scoped>
.admin__billing-loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  color: var(--theme-text-muted);
  font-size: var(--theme-font-sm);
}

.admin__spinner {
  animation: admin-spin 1s linear infinite;
}

@keyframes admin-spin {
  to { transform: rotate(360deg); }
}

.admin__billing-empty {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.admin__billing-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--theme-font-sm);
}

.admin__billing-table th {
  text-align: left;
  font-weight: 600;
  color: var(--theme-text-secondary);
  padding: var(--theme-space-xs) var(--theme-space-sm);
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
  white-space: nowrap;
}

.admin__billing-table td {
  padding: var(--theme-space-xs) var(--theme-space-sm);
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
  color: var(--theme-text-primary);
  white-space: nowrap;
}

.admin__billing-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.admin__billing-tx-link {
  color: var(--theme-primary);
  display: inline-flex;
  align-items: center;
}

.admin__billing-invoice-btn {
  background: none;
  border: none;
  color: var(--theme-primary);
  cursor: pointer;
  padding: 2px;
  display: inline-flex;
  align-items: center;
  font-size: var(--theme-font-md);
}

.admin__billing-invoice-btn:hover {
  color: var(--theme-text-primary);
}
</style>
