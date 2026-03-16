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
              <th>Product</th>
              <th>Amount</th>
              <th>Tx</th>
              <th>Invoice</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in payments" :key="p.id">
              <td>{{ formatPaymentDate(p.confirmedAt) }}</td>
              <td>{{ p.productLabel }}</td>
              <td class="admin__billing-amount">{{ formatUsdc(p.amountUsdc) }} USDC</td>
              <td>
                <a
                  v-if="p.txSignature"
                  :href="txExplorerUrl(p.txSignature)"
                  target="_blank"
                  rel="noopener"
                  class="admin__billing-tx-link"
                >
                  <Icon icon="lucide:external-link" />
                </a>
                <span v-else class="admin__billing-tx-muted">--</span>
              </td>
              <td>
                <button class="admin__billing-invoice-btn" title="Download invoice" @click="downloadInvoice(p.id)">
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
import { useExplorerLinks } from '~/composables/core/useExplorerLinks'

defineProps<{
  slug: string | null
}>()

const tenantStore = useTenantStore()
const tenantId = computed(() => tenantStore.tenantId)
const payments = ref<BillingPaymentRecord[]>([])
const loading = ref(false)
const { txUrl } = useExplorerLinks()

const METER_TO_PRODUCT: Record<string, string> = {
  mints_current: 'watchtower',
  mints_snapshot: 'watchtower',
  mints_transactions: 'watchtower',
  mints_count: 'marketplace',
  custom_currencies: 'marketplace',
  monetize_storefront: 'marketplace',
  raffle_slots: 'raffles',
  raffle_hosting: 'raffles',
  gate_lists: 'gates',
  crafter_tokens: 'crafter',
  registration: 'admin',
  slug: 'admin',
  recipients_count: 'shipment',
}

interface BillingPaymentRecord {
  id: string
  amountUsdc: number
  txSignature: string | null
  confirmedAt: string | null
  productLabel: string
  quoteId: string | null
  lineItems: unknown[]
}

function productLabelFromLineItems(lineItems: Array<{ meter_key?: string; source?: string; bundleId?: string }>): string {
  if (!lineItems?.length) return 'Payment'
  const first = lineItems[0]
  if (first.source === 'bundle' && first.bundleId) {
    const labels: Record<string, string> = {
      starterpack: 'Starter Pack',
    }
    return labels[first.bundleId] ?? first.bundleId
  }
  const meterKey = first.meter_key
  const productId = meterKey ? METER_TO_PRODUCT[meterKey] : null
  return productId ? (MODULE_NAV[productId]?.label ?? productId) : (meterKey ?? 'Payment')
}

async function load() {
  if (!tenantId.value) return
  loading.value = true
  try {
    const supabase = useSupabase()
    const { data: paymentsData, error } = await supabase
      .from('billing_payments')
      .select('id, amount_usdc, tx_signature, confirmed_at, quote_id')
      .eq('tenant_id', tenantId.value)
      .eq('status', 'confirmed')
      .order('confirmed_at', { ascending: false })

    if (error || !paymentsData?.length) {
      payments.value = []
      return
    }

    const quoteIds = paymentsData
      .map((r) => r.quote_id as string | null)
      .filter((id): id is string => Boolean(id))
    const quotesMap = new Map<string, { line_items: unknown[] }>()

    if (quoteIds.length > 0) {
      const { data: quotesData } = await supabase
        .from('billing_quotes')
        .select('id, line_items')
        .in('id', quoteIds)
      for (const q of quotesData ?? []) {
        quotesMap.set((q as { id: string }).id, {
          line_items: ((q as { line_items: unknown }).line_items as unknown[]) ?? [],
        })
      }
    }

    payments.value = paymentsData.map((r) => {
      const quoteId = r.quote_id as string | null
      const quote = quoteId ? quotesMap.get(quoteId) : null
      const lineItems = (quote?.line_items ?? []) as Array<{ meter_key?: string; source?: string; bundleId?: string }>
      return {
        id: r.id as string,
        amountUsdc: Number(r.amount_usdc),
        txSignature: r.tx_signature as string | null,
        confirmedAt: r.confirmed_at as string | null,
        productLabel: productLabelFromLineItems(lineItems),
        quoteId,
        lineItems,
      }
    })
  } catch {
    payments.value = []
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

function txExplorerUrl(signature: string): string {
  return txUrl(signature)
}

async function downloadInvoice(paymentId: string) {
  if (!tenantId.value) return
  try {
    const supabase = useSupabase()
    const { data: payment, error: payErr } = await supabase
      .from('billing_payments')
      .select('*')
      .eq('id', paymentId)
      .eq('tenant_id', tenantId.value)
      .single()
    if (payErr || !payment) return

    let quote: unknown = null
    const quoteId = payment.quote_id as string | null
    if (quoteId) {
      const { data: q } = await supabase
        .from('billing_quotes')
        .select('*')
        .eq('id', quoteId)
        .eq('tenant_id', tenantId.value)
        .single()
      quote = q
    }

    const invoice = {
      payment,
      quote,
      downloadedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(invoice, null, 2)], { type: 'application/json' })
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

.admin__billing-tx-muted {
  color: var(--theme-text-muted);
  font-size: var(--theme-font-sm);
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
