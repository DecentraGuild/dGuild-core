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
          :form="bundleForm"
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
              <Button type="submit" size="sm" :disabled="voucherMetadataLoading">
                Add metadata & link
              </Button>
              <p v-if="metadataFormError" class="text-destructive text-sm">{{ metadataFormError }}</p>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <OpsBundleEditModal
        :bundle-id="bundleEditId"
        :form="bundleEditForm"
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

import { Keypair, PublicKey } from '@solana/web3.js'
import { useAuth } from '@decentraguild/auth'
import { Button } from '~/components/ui/button'
import {
  buildCreateMintOnlyTransaction,
  buildCreateMetadataTransaction,
  sendAndConfirmTransaction,
  getEscrowWalletFromConnector,
  createConnection,
} from '@decentraguild/web3'
import { useSupabase } from '~/composables/useSupabase'
import { useRpc } from '~/composables/useRpc'
import { useTransactionNotificationsStore } from '~/stores/transactionNotifications'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog'

const auth = useAuth()
const toastStore = useTransactionNotificationsStore()

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

interface MeterOption {
  meter_key: string
  product_key: string
  description?: string | null
}

const meters = ref<MeterOption[]>([])
const bundleForm = reactive({
  id: '',
  label: '',
  productKey: '',
  priceUsdc: 0,
  entitlements: [] as Array<{ meter_key: string; quantity: number; duration_days: number }>,
})
const bundleCreateLoading = ref(false)
const bundleCreateError = ref<string | null>(null)
const bundleCreateSuccess = ref<string | null>(null)

interface BundleOption {
  id: string
  label: string
  product_key: string
}

const bundles = ref<BundleOption[]>([])

const bundleEditId = ref<string | null>(null)
const bundleEditForm = ref<{
  label: string
  productKey: string
  priceUsdc: number
  entitlements: Array<{ meter_key: string; quantity: number; duration_days: number }>
} | null>(null)
const bundleEditLoading = ref(false)
const bundleEditSaving = ref(false)
const bundleEditError = ref<string | null>(null)

const voucherWallet = computed(() => {
  const w = auth.wallet.value
  if (!w) return null
  return typeof w === 'string' ? w : (w as { toBase58?: () => string })?.toBase58?.() ?? null
})

const existingMintForDraft = ref('')
const voucherDrafts = ref<Array<{ mint: string; created_at: string }>>([])
const voucherLinked = ref<Array<{ mint: string; type: string; bundleId?: string; label?: string }>>([])
const voucherMintLoading = ref(false)
const voucherMintError = ref<string | null>(null)
const voucherMintSuccess = ref<string | null>(null)

const metadataModalMint = ref<string | null>(null)
const metadataForm = reactive({
  type: 'bundle' as 'bundle' | 'individual',
  bundleId: '',
  name: '',
  symbol: '',
  imageUrl: '',
  sellerFeeBasisPoints: 0,
  label: '',
  tokensRequired: 1,
  maxRedemptionsPerTenant: null as number | null,
  entitlements: [] as Array<{ meter_key: string; quantity: number; duration_days: number }>,
})
const voucherMetadataLoading = ref<string | false>(false)
const metadataFormError = ref<string | null>(null)

onMounted(async () => {
  // Stagger platform requests to avoid worker pool exhaustion (503 InvalidWorkerCreation).
  // Platform function cold-starts slowly; 6 concurrent requests overwhelm the Edge Runtime.
  await Promise.all([loadTenants(), loadBilling(), loadAudit()])
  await Promise.all([loadMeters(), loadBundles(), loadVoucherList()])
})

async function loadMeters() {
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('platform', {
      body: { action: 'meters-list' },
    })
    if (error) throw new Error(error.message)
    meters.value = (data as { meters?: MeterOption[] }).meters ?? []
  } catch {
    meters.value = []
  }
}

async function loadBundles() {
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('platform', {
      body: { action: 'bundles-list' },
    })
    if (error) throw new Error(error.message)
    bundles.value = (data as { bundles?: BundleOption[] }).bundles ?? []
  } catch {
    bundles.value = []
  }
}

async function loadVoucherList() {
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('platform', {
      body: { action: 'voucher-list' },
    })
    if (error) throw new Error(error.message)
    const r = data as { drafts?: Array<{ mint: string; created_at: string }>; linked?: Array<{ mint: string; type: string; bundleId?: string; label?: string }> }
    voucherDrafts.value = r.drafts ?? []
    voucherLinked.value = r.linked ?? []
  } catch {
    voucherDrafts.value = []
    voucherLinked.value = []
  }
}

function addMetadataEntitlement() {
  metadataForm.entitlements.push({ meter_key: '', quantity: 1, duration_days: 30 })
}

function removeMetadataEntitlement(i: number) {
  metadataForm.entitlements.splice(i, 1)
}

watch(
  () => metadataForm.type,
  (type) => {
    if (type === 'individual' && metadataForm.entitlements.length === 0) {
      addMetadataEntitlement()
    }
  },
)

async function openBundleEdit(bundle: { id: string; label: string; product_key: string }) {
  bundleEditId.value = bundle.id
  bundleEditForm.value = null
  bundleEditError.value = null
  bundleEditLoading.value = true
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('platform', {
      body: { action: 'bundle-get', bundleId: bundle.id },
    })
    if (error) throw new Error(error.message)
    const r = data as { bundle?: { id: string; label: string; product_key: string; price_usdc: number }; entitlements?: Array<{ meter_key: string; quantity: number; duration_days: number }> }
    if (!r.bundle) throw new Error('Bundle not found')
    bundleEditForm.value = {
      label: r.bundle.label,
      productKey: r.bundle.product_key,
      priceUsdc: r.bundle.price_usdc,
      entitlements: (r.entitlements ?? []).map((e) => ({ ...e })),
    }
    if (bundleEditForm.value.entitlements.length === 0) {
      bundleEditForm.value.entitlements.push({ meter_key: '', quantity: 1, duration_days: 30 })
    }
  } catch (e) {
    bundleEditError.value = e instanceof Error ? e.message : 'Failed to load bundle'
  } finally {
    bundleEditLoading.value = false
  }
}

async function saveBundleEdit(form: { label: string; productKey: string; priceUsdc: number; entitlements: Array<{ meter_key: string; quantity: number; duration_days: number }> }) {
  const id = bundleEditId.value
  if (!id) return
  bundleEditSaving.value = true
  bundleEditError.value = null
  try {
    const supabase = useSupabase()
    const { error } = await supabase.functions.invoke('platform', {
      body: {
        action: 'bundle-update',
        bundleId: id,
        label: form.label.trim(),
        productKey: form.productKey.trim(),
        priceUsdc: form.priceUsdc,
        entitlements: form.entitlements.filter((e) => e.meter_key?.trim()),
      },
    })
    if (error) throw new Error(error.message)
    toastStore.add(`bundle-update-${Date.now()}`, { status: 'success', message: `Bundle ${id} updated.` })
    bundleEditId.value = null
    await loadBundles()
  } catch (e) {
    bundleEditError.value = e instanceof Error ? e.message : 'Failed to update bundle'
  } finally {
    bundleEditSaving.value = false
  }
}

function goToVoucher(v: { mint: string }) {
  navigateTo(`/ops/vouchers/${encodeURIComponent(v.mint)}`)
}

function openMetadataModal(mint: string) {
  metadataModalMint.value = mint
  metadataForm.type = 'bundle'
  metadataForm.bundleId = ''
  metadataForm.name = ''
  metadataForm.symbol = ''
  metadataForm.imageUrl = ''
  metadataForm.sellerFeeBasisPoints = 0
  metadataForm.label = ''
  metadataForm.tokensRequired = 1
  metadataForm.maxRedemptionsPerTenant = null
  metadataForm.entitlements = []
  metadataFormError.value = null
}

async function createVoucherMint() {
  const wallet = getEscrowWalletFromConnector()
  const supabase = useSupabase()
  const { rpcUrl } = useRpc()
  if (!wallet?.publicKey || !rpcUrl.value) {
    voucherMintError.value = 'Connect wallet and ensure RPC is configured'
    return
  }
  const toastId = `voucher-mint-${Date.now()}`
  toastStore.add(toastId, { status: 'pending', message: 'Creating mint…' })
  voucherMintLoading.value = true
  voucherMintError.value = null
  voucherMintSuccess.value = null
  try {
    const mintKeypair = Keypair.generate()
    const mint = mintKeypair.publicKey.toBase58()
    const connection = createConnection(rpcUrl.value)
    const tx = await buildCreateMintOnlyTransaction({
      mintKeypair,
      decimals: 0,
      payer: wallet.publicKey,
      connection,
    })
    const sig = await sendAndConfirmTransaction(connection, tx, wallet, wallet.publicKey, {
      signers: [mintKeypair],
    })
    const { error } = await supabase.functions.invoke('platform', {
      body: { action: 'voucher-register-draft', mint },
    })
    if (error) throw new Error(error.message ?? 'Failed to register draft')
    toastStore.add(toastId, { status: 'success', message: `Mint created: ${mint.slice(0, 8)}…`, signature: sig })
    voucherMintSuccess.value = `Mint created: ${mint.slice(0, 8)}…`
    await loadVoucherList()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create mint'
    voucherMintError.value = msg
    toastStore.add(toastId, { status: 'error', message: msg })
  } finally {
    voucherMintLoading.value = false
  }
}

function isValidSolanaMint(mint: string): boolean {
  const trimmed = mint.trim()
  if (trimmed.length < 32 || trimmed.length > 44) return false
  const base58 = /^[1-9A-HJ-NP-Za-km-z]+$/
  return base58.test(trimmed)
}

async function registerExistingMintAsDraft(mint: string) {
  const supabase = useSupabase()
  if (!mint) {
    voucherMintError.value = 'Enter a mint address'
    return
  }
  if (!isValidSolanaMint(mint)) {
    voucherMintError.value = 'Invalid mint: use a base58 address (32–44 characters)'
    return
  }
  const toastId = `voucher-draft-${Date.now()}`
  toastStore.add(toastId, { status: 'pending', message: 'Adding mint as draft…' })
  voucherMintLoading.value = true
  voucherMintError.value = null
  voucherMintSuccess.value = null
  try {
    const { error } = await supabase.functions.invoke('platform', {
      body: { action: 'voucher-register-draft', mint: mint.trim() },
    })
    if (error) throw new Error(error.message ?? 'Failed to register draft')
    toastStore.add(toastId, { status: 'success', message: `Mint added as draft: ${mint.slice(0, 8)}…` })
    voucherMintSuccess.value = `Mint added as draft: ${mint.slice(0, 8)}…`
    existingMintForDraft.value = ''
    await loadVoucherList()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to add draft'
    voucherMintError.value = msg
    toastStore.add(toastId, { status: 'error', message: msg })
  } finally {
    voucherMintLoading.value = false
  }
}

async function submitMetadataAndLink() {
  const mint = metadataModalMint.value
  if (!mint) return
  const wallet = getEscrowWalletFromConnector()
  const supabase = useSupabase()
  const { rpcUrl } = useRpc()
  if (!wallet?.publicKey || !rpcUrl.value) {
    metadataFormError.value = 'Connect wallet and ensure RPC is configured'
    return
  }
  if (metadataForm.type === 'individual' && metadataForm.entitlements.length === 0) {
    metadataFormError.value = 'Add at least one entitlement'
    return
  }
  if (metadataForm.type === 'bundle' && !metadataForm.bundleId?.trim()) {
    metadataFormError.value = 'Select a bundle'
    return
  }

  const toastId = `voucher-metadata-${mint}-${Date.now()}`
  toastStore.add(toastId, { status: 'pending', message: 'Adding metadata & linking…' })
  voucherMetadataLoading.value = mint
  metadataFormError.value = null
  try {
    const connection = createConnection(rpcUrl.value)

    const mintInfo = await connection.getAccountInfo(new PublicKey(mint))
    if (!mintInfo) {
      throw new Error('Mint account not found on chain. Ensure the mint was created and confirmed.')
    }

    const { data: metaData, error: metaErr } = await supabase.functions.invoke('platform', {
      body: {
        action: 'voucher-prepare-metadata',
        name: metadataForm.name.trim(),
        symbol: metadataForm.symbol.trim(),
        imageUrl: metadataForm.imageUrl?.trim() || undefined,
        sellerFeeBasisPoints: Math.max(0, Math.min(10000, metadataForm.sellerFeeBasisPoints ?? 0)),
        voucherType: metadataForm.type,
        bundleId: metadataForm.type === 'bundle' ? metadataForm.bundleId.trim() : undefined,
      },
    })
    if (metaErr) throw new Error(metaErr.message ?? 'Failed to prepare metadata')
    const metadataUri = (metaData as { metadataUri?: string })?.metadataUri
    if (!metadataUri || typeof metadataUri !== 'string' || !metadataUri.trim()) {
      throw new Error('No metadata URI returned from server')
    }
    const uri = metadataUri.trim()
    if (uri.length > 200) {
      throw new Error('Metadata URI too long (max 200 chars). Use a shorter storage path.')
    }

    const name = metadataForm.name.trim().slice(0, 32)
    const symbol = metadataForm.symbol.trim().slice(0, 10)
    const sellerFeeBasisPoints = Math.max(0, Math.min(10000, metadataForm.sellerFeeBasisPoints ?? 0))
    const tx = buildCreateMetadataTransaction({
      mint,
      name,
      symbol,
      uri,
      updateAuthority: wallet.publicKey,
      payer: wallet.publicKey,
      sellerFeeBasisPoints,
    })
    const metaSig = await sendAndConfirmTransaction(connection, tx, wallet, wallet.publicKey)

    if (metadataForm.type === 'bundle') {
      const { error: linkErr } = await supabase.functions.invoke('platform', {
        body: {
          action: 'voucher-create-bundle',
          mint,
          bundleId: metadataForm.bundleId.trim(),
          tokensRequired: metadataForm.tokensRequired,
          maxRedemptionsPerTenant: metadataForm.maxRedemptionsPerTenant ?? undefined,
        },
      })
      if (linkErr) throw new Error(linkErr.message ?? 'Failed to link voucher')
    } else {
      const { error: linkErr } = await supabase.functions.invoke('platform', {
        body: {
          action: 'voucher-create-individual',
          mint,
          label: metadataForm.label?.trim() || undefined,
          maxRedemptionsPerTenant: metadataForm.maxRedemptionsPerTenant ?? undefined,
          entitlements: metadataForm.entitlements.filter((e) => e.meter_key?.trim()),
        },
      })
      if (linkErr) throw new Error(linkErr.message ?? 'Failed to create voucher')
    }

    toastStore.add(toastId, {
      status: 'success',
      message: `Metadata added & voucher linked: ${mint.slice(0, 8)}…`,
      signature: metaSig,
    })
    metadataModalMint.value = null
    await loadVoucherList()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to add metadata & link'
    metadataFormError.value = msg
    toastStore.add(toastId, { status: 'error', message: msg })
  } finally {
    voucherMetadataLoading.value = false
  }
}

function addEntitlement() {
  bundleForm.entitlements.push({ meter_key: '', quantity: 1, duration_days: 30 })
}

function removeEntitlement(i: number) {
  bundleForm.entitlements.splice(i, 1)
}

async function createBundle() {
  if (bundleForm.entitlements.length === 0) {
    bundleCreateError.value = 'Add at least one entitlement'
    return
  }
  const toastId = `bundle-create-${Date.now()}`
  toastStore.add(toastId, { status: 'pending', message: 'Creating bundle…' })
  bundleCreateLoading.value = true
  bundleCreateError.value = null
  bundleCreateSuccess.value = null
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('platform', {
      body: {
        action: 'bundle-create',
        bundleId: bundleForm.id.trim(),
        label: bundleForm.label.trim(),
        productKey: bundleForm.productKey.trim(),
        priceUsdc: bundleForm.priceUsdc,
        entitlements: bundleForm.entitlements.filter((e) => e.meter_key?.trim()),
      },
    })
    if (error) throw new Error(error.message)
    const result = data as { ok?: boolean; bundleId?: string }
    if (result?.ok) {
      toastStore.add(toastId, { status: 'success', message: `Bundle ${result.bundleId} created.` })
      bundleCreateSuccess.value = `Bundle ${result.bundleId} created.`
      bundleForm.id = ''
      bundleForm.label = ''
      bundleForm.productKey = ''
      bundleForm.priceUsdc = 0
      bundleForm.entitlements = []
    } else {
      throw new Error('Create failed')
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create bundle'
    bundleCreateError.value = msg
    toastStore.add(toastId, { status: 'error', message: msg })
  } finally {
    bundleCreateLoading.value = false
  }
}

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
  const toastId = `metadata-seed-${Date.now()}`
  toastStore.add(toastId, { status: 'pending', message: 'Seeding metadata from configs…' })
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
    const msg = res.message ?? `Seeded ${res.seeded ?? 0} mints.`
    metadataRefreshResult.value = msg
    if ((res.remaining ?? 0) > 0) {
      metadataRefreshResult.value += ' Click again to continue.'
    }
    toastStore.add(toastId, { status: 'success', message: msg })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Failed to seed metadata'
    metadataRefreshError.value = errMsg
    toastStore.add(toastId, { status: 'error', message: errMsg })
  } finally {
    metadataRefreshLoading.value = false
  }
}

async function refreshMetadata(limit: number) {
  const toastId = `metadata-refresh-${Date.now()}`
  toastStore.add(toastId, { status: 'pending', message: 'Refreshing metadata…' })
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
    const msg = res.message ?? `Refreshed ${res.refreshed ?? 0} of ${res.total ?? 0} mints.`
    metadataRefreshResult.value = msg
    if (res.nextOffset != null) {
      metadataRefreshOffset.value = res.nextOffset
      metadataRefreshResult.value += ` Click again to continue.`
    } else {
      metadataRefreshOffset.value = 0
    }
    toastStore.add(toastId, { status: 'success', message: msg })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Failed to refresh metadata'
    metadataRefreshError.value = errMsg
    toastStore.add(toastId, { status: 'error', message: errMsg })
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

@media (max-width: var(--theme-breakpoint-md)) {
  .ops__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

