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
        <OpsTenantsCard
          :tenants="tenants"
          :loading="tenantsLoading"
          :error="tenantsError"
          @select="goToTenant"
        />
        <OpsBillingCard
          :summary="billingSummary"
          :recent-payments="recentPayments"
          :loading="billingLoading"
          :error="billingError"
        />

        <OpsBundleCreateCard
          v-model:form="bundleForm"
          :meters="meters"
          :loading="bundleCreateLoading"
          :create-error="bundleCreateError"
          :create-success="bundleCreateSuccess"
          @submit="createBundle"
          @add-entitlement="addEntitlement"
          @remove-entitlement="removeEntitlement"
        />
        <OpsBundlesListCard
          :bundles="bundles"
          @select="openBundleEdit"
        />

        <OpsVoucherCreateCard
          v-model:existing-mint="existingMintForDraft"
          :wallet="voucherWallet"
          :loading="voucherMintLoading"
          :error="voucherMintError"
          :success="voucherMintSuccess"
          @create-mint="createVoucherMint"
          @add-draft="registerExistingMintAsDraft"
        />
        <OpsVouchersListCard
          :drafts="voucherDrafts"
          :linked="voucherLinked"
          :metadata-loading="voucherMetadataLoading"
          @add-metadata="openMetadataModal"
          @select="goToVoucher"
        />

        <OpsMetadataRefreshCard
          :loading="metadataRefreshLoading"
          :result="metadataRefreshResult"
          :error="metadataRefreshError"
          @seed="seedMetadataFromConfigs"
          @refresh="refreshMetadata"
        />
        <OpsAuditLogCard
          :entries="auditEntries"
          :loading="auditLoading"
          :error="auditError"
        />
      </div>

      <Dialog :open="!!metadataModalMint" @update:open="(v: boolean) => !v && (metadataModalMint = null)">
        <DialogContent class="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add metadata & link: {{ metadataModalMint?.slice(0, 8) }}…</DialogTitle>
            <DialogDescription>Set voucher type, name, symbol, and link to bundle or entitlements.</DialogDescription>
          </DialogHeader>
          <form class="ops__voucher-form space-y-4" @submit.prevent="submitMetadataAndLink">
            <div class="ops__form-row">
              <label>Voucher type</label>
              <select v-model="metadataForm.type">
                <option value="bundle">Bundle</option>
                <option value="individual">Individual</option>
              </select>
            </div>
            <template v-if="metadataForm.type === 'bundle'">
              <div class="ops__form-row">
                <label>Bundle</label>
                <select v-model="metadataForm.bundleId" required>
                  <option value="">Select bundle</option>
                  <option v-for="b in bundles" :key="b.id" :value="b.id">{{ b.label }} ({{ b.id }})</option>
                </select>
              </div>
            </template>
            <div class="ops__form-row">
              <label>Name</label>
              <input v-model="metadataForm.name" type="text" placeholder="Voucher name" required />
            </div>
            <div class="ops__form-row">
              <label>Symbol</label>
              <input v-model="metadataForm.symbol" type="text" placeholder="e.g. VOUCH" required />
            </div>
            <div class="ops__form-row">
              <label>Image URL (optional)</label>
              <input v-model="metadataForm.imageUrl" type="url" placeholder="https://…" />
            </div>
            <div class="ops__form-row">
              <label>Royalty (basis points, optional)</label>
              <input v-model.number="metadataForm.sellerFeeBasisPoints" type="number" min="0" max="10000" placeholder="0" />
              <span class="ops__form-hint">0–10000 (100 = 1%)</span>
            </div>
            <div class="ops__form-row">
              <label>Tokens required</label>
              <input v-model.number="metadataForm.tokensRequired" type="number" min="1" />
            </div>
            <div class="ops__form-row">
              <label>Max redemptions per tenant (optional)</label>
              <input v-model.number="metadataForm.maxRedemptionsPerTenant" type="number" min="0" placeholder="Unlimited" />
            </div>
            <template v-if="metadataForm.type === 'individual'">
              <div class="ops__form-row">
                <label>Label (optional)</label>
                <input v-model="metadataForm.label" type="text" placeholder="Display label" />
              </div>
              <div class="ops__form-section">
                <div class="ops__form-section-header">
                  <span>Entitlements</span>
                  <Button type="button" size="sm" variant="outline" @click="addMetadataEntitlement">
                    Add entitlement
                  </Button>
                </div>
                <div v-for="(e, i) in metadataForm.entitlements" :key="i" class="ops__entitlement-row">
                  <select v-model="e.meter_key" required>
                    <option value="">Select meter</option>
                    <option v-for="m in meters" :key="m.meter_key" :value="m.meter_key">
                      {{ m.meter_key }} ({{ m.product_key }})
                    </option>
                  </select>
                  <input v-model.number="e.quantity" type="number" min="1" placeholder="Qty" required />
                  <input v-model.number="e.duration_days" type="number" min="0" placeholder="Days" required />
                  <Button type="button" size="sm" variant="ghost" @click="removeMetadataEntitlement(i)">Remove</Button>
                </div>
              </div>
            </template>
            <div class="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="ghost" @click="metadataModalMint = null">Cancel</Button>
              <Button type="submit" size="sm" :disabled="voucherMetadataLoading !== false">
                Add metadata & link
              </Button>
              <p v-if="metadataFormError" class="text-destructive text-sm">{{ metadataFormError }}</p>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <OpsBundleEditModal
        v-model:form="bundleEditForm"
        :bundle-id="bundleEditId"
        :meters="meters"
        :loading="bundleEditLoading"
        :saving="bundleEditSaving"
        :error="bundleEditError"
        @close="bundleEditId = null"
        @save="saveBundleEdit"
      />
    </div>
  </PageSection>
</template>

<script setup lang="ts">
definePageMeta({ title: 'Platform operations' })

import { useAuth } from '@decentraguild/auth'
import { Button } from '~/components/ui/button'
import { useSupabase, invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useOpsBundles } from '~/composables/useOpsBundles'
import { useOpsVouchers } from '~/composables/useOpsVouchers'
import { useOpsMetadataRefresh } from '~/composables/useOpsMetadataRefresh'
import { useOpsAudit } from '~/composables/useOpsAudit'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog'

const auth = useAuth()

const {
  meters, bundles,
  bundleForm, bundleCreateLoading, bundleCreateError, bundleCreateSuccess,
  bundleEditId, bundleEditForm, bundleEditLoading, bundleEditSaving, bundleEditError,
  loadMeters, loadBundles, addEntitlement, removeEntitlement, createBundle, openBundleEdit, saveBundleEdit,
} = useOpsBundles()

const {
  voucherWallet, existingMintForDraft,
  voucherDrafts, voucherLinked, voucherMintLoading, voucherMintError, voucherMintSuccess,
  metadataModalMint, metadataForm, voucherMetadataLoading, metadataFormError,
  loadVoucherList, openMetadataModal, addMetadataEntitlement, removeMetadataEntitlement,
  createVoucherMint, registerExistingMintAsDraft, submitMetadataAndLink,
} = useOpsVouchers()

const { metadataRefreshLoading, metadataRefreshResult, metadataRefreshError, seedMetadataFromConfigs, refreshMetadata } = useOpsMetadataRefresh()
const { auditEntries, auditLoading, auditError, loadAudit } = useOpsAudit()

interface TenantSummary { id: string; slug: string | null; name: string; description: string | null; modules: Record<string, unknown>; admins: string[]; treasury: string | null; createdAt: string | null }
interface BillingSummary { totalMrrUsdc: number; activeSubscriptions: number }
interface BillingPaymentSummary { id: string; tenantSlug: string; moduleId: string; amountUsdc: number; confirmedAt: string | null; txSignature?: string | null }

const tenants = ref<TenantSummary[]>([])
const tenantsLoading = ref(true)
const tenantsError = ref<string | null>(null)
const billingSummary = ref<BillingSummary>({ totalMrrUsdc: 0, activeSubscriptions: 0 })
const recentPayments = ref<BillingPaymentSummary[]>([])
const billingLoading = ref(true)
const billingError = ref<string | null>(null)

onMounted(async () => {
  await Promise.all([loadTenants(), loadBilling(), loadAudit()])
  await Promise.all([loadMeters(), loadBundles(), loadVoucherList()])
})

async function loadTenants() {
  tenantsLoading.value = true; tenantsError.value = null
  try {
    const supabase = useSupabase()
    const data = await invokeEdgeFunction<{ tenants?: TenantSummary[] }>(supabase, 'platform', { action: 'tenants-list' })
    tenants.value = data.tenants ?? []
  } catch (e) { tenantsError.value = e instanceof Error ? e.message : 'Failed to load tenants' }
  finally { tenantsLoading.value = false }
}

async function loadBilling() {
  billingLoading.value = true; billingError.value = null
  try {
    const supabase = useSupabase()
    const result = await invokeEdgeFunction<{
      activeSubscriptions?: number
      totalMrrUsdc?: number
      recentPayments?: BillingPaymentSummary[]
    }>(supabase, 'platform', { action: 'billing-summary' })
    billingSummary.value = { totalMrrUsdc: result.totalMrrUsdc ?? 0, activeSubscriptions: result.activeSubscriptions ?? 0 }
    recentPayments.value = result.recentPayments ?? []
  } catch (e) { billingError.value = e instanceof Error ? e.message : 'Failed to load billing overview' }
  finally { billingLoading.value = false }
}

async function logout() {
  await auth.signOut()
  await navigateTo('/ops/login')
}

function goToTenant(t: TenantSummary) { navigateTo(`/ops/tenants/${encodeURIComponent(t.id)}`) }
function goToVoucher(v: { mint: string }) { navigateTo(`/ops/vouchers/${encodeURIComponent(v.mint)}`) }
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--theme-space-lg);
}

.ops__bundle-form,
.ops__voucher-form {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.ops__voucher-form .ops__form-row input,
.ops__voucher-form .ops__form-row select {
  max-width: 320px;
}

.ops__form-row label,
.ops__form-section-header {
  display: block;
  font-size: var(--theme-font-sm);
  font-weight: 500;
  margin-bottom: 0.25rem;
  color: var(--theme-text-secondary);
}

.ops__form-row input,
.ops__form-row select {
  width: 100%;
  max-width: 280px;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  font-size: var(--theme-font-sm);
  background: var(--theme-bg-primary);
  color: var(--theme-text-primary);
}

.ops__form-section {
  margin-top: var(--theme-space-sm);
}

.ops__form-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--theme-space-sm);
}

.ops__entitlement-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--theme-space-sm);
  margin-bottom: var(--theme-space-xs);
}

.ops__entitlement-row select {
  min-width: 180px;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  font-size: var(--theme-font-sm);
  background: var(--theme-bg-primary);
  color: var(--theme-text-primary);
}

.ops__entitlement-row input {
  width: 4rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  font-size: var(--theme-font-sm);
  background: var(--theme-bg-primary);
  color: var(--theme-text-primary);
}

@media (max-width: 767px) {
  .ops__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
