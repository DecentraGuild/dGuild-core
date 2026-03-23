import { useSupabase, invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useTransactionNotificationsStore } from '~/stores/transactionNotifications'

export interface MeterOption { meter_key: string; product_key: string; description?: string | null }
export interface BundleOption { id: string; label: string; product_key: string }

export function useOpsBundles() {
  const toastStore = useTransactionNotificationsStore()

  const meters = ref<MeterOption[]>([])
  const bundles = ref<BundleOption[]>([])

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

  async function loadMeters() {
    try {
      const supabase = useSupabase()
      const data = await invokeEdgeFunction<{ meters?: MeterOption[] }>(supabase, 'platform', { action: 'meters-list' })
      meters.value = data.meters ?? []
    } catch { meters.value = [] }
  }

  async function loadBundles() {
    try {
      const supabase = useSupabase()
      const data = await invokeEdgeFunction<{ bundles?: BundleOption[] }>(supabase, 'platform', { action: 'bundles-list' })
      bundles.value = data.bundles ?? []
    } catch { bundles.value = [] }
  }

  function addEntitlement() {
    bundleForm.entitlements.push({ meter_key: '', quantity: 1, duration_days: 30 })
  }

  function removeEntitlement(i: number) {
    bundleForm.entitlements.splice(i, 1)
  }

  async function createBundle() {
    if (bundleForm.entitlements.length === 0) { bundleCreateError.value = 'Add at least one entitlement'; return }
    const toastId = `bundle-create-${Date.now()}`
    toastStore.add(toastId, { status: 'pending', message: 'Creating bundle…' })
    bundleCreateLoading.value = true
    bundleCreateError.value = null
    bundleCreateSuccess.value = null
    try {
      const supabase = useSupabase()
      const result = await invokeEdgeFunction<{ ok?: boolean; bundleId?: string }>(supabase, 'platform', {
        action: 'bundle-create',
        bundleId: bundleForm.id.trim(),
        label: bundleForm.label.trim(),
        productKey: bundleForm.productKey.trim(),
        priceUsdc: bundleForm.priceUsdc,
        entitlements: bundleForm.entitlements.filter((e) => e.meter_key?.trim()),
      })
      if (result?.ok) {
        toastStore.add(toastId, { status: 'success', message: `Bundle ${result.bundleId} created.` })
        bundleCreateSuccess.value = `Bundle ${result.bundleId} created.`
        bundleForm.id = ''; bundleForm.label = ''; bundleForm.productKey = ''; bundleForm.priceUsdc = 0; bundleForm.entitlements = []
        await loadBundles()
      } else { throw new Error('Create failed') }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create bundle'
      bundleCreateError.value = msg; toastStore.add(toastId, { status: 'error', message: msg })
    } finally { bundleCreateLoading.value = false }
  }

  async function openBundleEdit(bundle: { id: string; label: string; product_key: string }) {
    bundleEditId.value = bundle.id
    bundleEditForm.value = null
    bundleEditError.value = null
    bundleEditLoading.value = true
    try {
      const supabase = useSupabase()
      const r = await invokeEdgeFunction<{ bundle?: { id: string; label: string; product_key: string; price_usdc: number }; entitlements?: Array<{ meter_key: string; quantity: number; duration_days: number }> }>(supabase, 'platform', { action: 'bundle-get', bundleId: bundle.id })
      if (!r.bundle) throw new Error('Bundle not found')
      bundleEditForm.value = { label: r.bundle.label, productKey: r.bundle.product_key, priceUsdc: r.bundle.price_usdc, entitlements: (r.entitlements ?? []).map((e) => ({ ...e })) }
      if (bundleEditForm.value.entitlements.length === 0) bundleEditForm.value.entitlements.push({ meter_key: '', quantity: 1, duration_days: 30 })
    } catch (e) {
      bundleEditError.value = e instanceof Error ? e.message : 'Failed to load bundle'
    } finally { bundleEditLoading.value = false }
  }

  async function saveBundleEdit(form: { label: string; productKey: string; priceUsdc: number; entitlements: Array<{ meter_key: string; quantity: number; duration_days: number }> }) {
    const id = bundleEditId.value
    if (!id) return
    bundleEditSaving.value = true; bundleEditError.value = null
    try {
      const supabase = useSupabase()
      await invokeEdgeFunction(supabase, 'platform', { action: 'bundle-update', bundleId: id, label: form.label.trim(), productKey: form.productKey.trim(), priceUsdc: form.priceUsdc, entitlements: form.entitlements.filter((e) => e.meter_key?.trim()) })
      toastStore.add(`bundle-update-${Date.now()}`, { status: 'success', message: `Bundle ${id} updated.` })
      bundleEditId.value = null
      await loadBundles()
    } catch (e) {
      bundleEditError.value = e instanceof Error ? e.message : 'Failed to update bundle'
    } finally { bundleEditSaving.value = false }
  }

  return {
    meters, bundles,
    bundleForm, bundleCreateLoading, bundleCreateError, bundleCreateSuccess,
    bundleEditId, bundleEditForm, bundleEditLoading, bundleEditSaving, bundleEditError,
    loadMeters, loadBundles, addEntitlement, removeEntitlement, createBundle, openBundleEdit, saveBundleEdit,
  }
}
