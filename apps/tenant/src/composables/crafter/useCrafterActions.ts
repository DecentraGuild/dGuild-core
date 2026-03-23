import { toRawUnits } from '@decentraguild/display'
import { useAuth } from '@decentraguild/auth'
import { useTenantStore } from '~/stores/tenant'
import type { CrafterToken } from './useCrafter'

export type ActionType = 'mint' | 'burn' | 'edit'

type MintFn = (mint: string, destination: string, amount: bigint) => Promise<{ success: boolean; error?: string }>
type BurnFn = (mint: string, amount: bigint) => Promise<{ success: boolean; error?: string }>
type EditMetadataFn = (mint: string, params: { name: string; symbol: string; description?: string; imageUrl?: string; sellerFeeBasisPoints?: number; metadataUri: string }) => Promise<{ success: boolean; error?: string }>
type PrepareMetadataFn = (params: { name: string; symbol: string; decimals: number; description: string; imageUrl: string; sellerFeeBasisPoints: number }) => Promise<{ metadataUri?: string; error?: string }>

const clampBasisPoints = (v: unknown) => Math.max(0, Math.min(10000, Number(v) || 0))

export function useCrafterActions(
  doMint: MintFn,
  doBurn: BurnFn,
  doEditMetadata: EditMetadataFn,
  prepareMetadata: PrepareMetadataFn,
  refreshAll: () => Promise<void>,
) {
  const auth = useAuth()
  const tenantStore = useTenantStore()

  const actionType = ref<ActionType | null>(null)
  const actionToken = ref<CrafterToken | null>(null)
  const actionError = ref<string | null>(null)
  const actionSubmitting = ref(false)
  const actionForm = ref<Record<string, string>>({})

  const editForm = ref({
    name: '', symbol: '', description: '', imageUrl: '',
    sellerFeeBasisPoints: '0', storageBackend: 'api' as 'api' | 'selfhost', metadataUri: '',
  })
  const editUploadLoading = ref(false)
  const generatedEditJson = ref<Record<string, unknown> | null>(null)
  const canEditUpload = computed(() => Boolean(actionToken.value))
  const editJsonPreview = computed(() => generatedEditJson.value ? JSON.stringify(generatedEditJson.value, null, 2) : '')

  const actionModalTitle = computed(() =>
    actionType.value === 'edit' ? 'Edit metadata' : actionType.value ? actionType.value.charAt(0).toUpperCase() + actionType.value.slice(1) : ''
  )
  const actionSubmitLabel = computed(() => actionType.value === 'edit' ? 'Save' : actionType.value ?? '')
  const canSubmitAction = computed(() => {
    if (!actionType.value || !actionToken.value) return false
    switch (actionType.value) {
      case 'mint': return !!(actionForm.value.destination?.trim() && actionForm.value.amount?.trim())
      case 'burn': return !!actionForm.value.amount?.trim()
      case 'edit': return !!(editForm.value.name?.trim() && editForm.value.symbol?.trim() && editForm.value.metadataUri?.trim())
      default: return false
    }
  })

  function openActionModal(type: ActionType, t: CrafterToken) {
    actionType.value = type; actionToken.value = t; actionError.value = null
    if (type === 'mint') actionForm.value = { destination: auth.wallet.value ?? '', amount: '' }
    else if (type === 'burn') actionForm.value = { amount: '' }
    else if (type === 'edit') {
      editForm.value = { name: t.name || '', symbol: t.symbol || '', description: t.description || '', imageUrl: t.image_url || '', sellerFeeBasisPoints: String(t.seller_fee_basis_points ?? 0), storageBackend: t.storage_backend ?? 'api', metadataUri: t.metadata_uri || '' }
      generatedEditJson.value = null
    } else actionForm.value = {}
  }

  async function onEditUploadMetadata() {
    if (!actionToken.value) return
    editUploadLoading.value = true; actionError.value = null
    try {
      const result = await prepareMetadata({ name: editForm.value.name.trim() || actionToken.value.name || 'Token', symbol: editForm.value.symbol.trim() || actionToken.value.symbol || 'TKN', decimals: actionToken.value.decimals, description: editForm.value.description.trim() || '', imageUrl: editForm.value.imageUrl, sellerFeeBasisPoints: clampBasisPoints(editForm.value.sellerFeeBasisPoints) })
      if (result.metadataUri) editForm.value.metadataUri = result.metadataUri
      else if (result.error) actionError.value = result.error
    } finally { editUploadLoading.value = false }
  }

  function onGenerateEditJson() {
    if (!actionToken.value) return
    const tenantId = tenantStore.tenantId ?? ''
    generatedEditJson.value = {
      name: editForm.value.name.trim() || actionToken.value.name || 'Token',
      symbol: editForm.value.symbol.trim() || actionToken.value.symbol || 'TKN',
      description: editForm.value.description.trim() || '',
      image: editForm.value.imageUrl.trim() || undefined,
      seller_fee_basis_points: clampBasisPoints(editForm.value.sellerFeeBasisPoints),
      external_url: '', attributes: [], properties: { files: [], category: 'token' },
      decentraguild: { tenantId, createdVia: 'crafter', version: 1 },
    }
  }

  function copyEditJson() {
    if (!generatedEditJson.value) return
    navigator.clipboard.writeText(JSON.stringify(generatedEditJson.value, null, 2))
  }

  function downloadEditJson() {
    if (!generatedEditJson.value || !actionToken.value) return
    const blob = new Blob([JSON.stringify(generatedEditJson.value, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `metadata-${actionToken.value.symbol.toLowerCase() || 'token'}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  async function onActionSubmit() {
    const token = actionToken.value; const type = actionType.value
    if (!token || !type) return

    if (type === 'mint') {
      const dest = actionForm.value.destination?.trim(); const amt = actionForm.value.amount?.trim()
      if (!dest || !amt) return
      const amountRaw = BigInt(toRawUnits(parseFloat(amt) || 0, token.decimals))
      if (amountRaw <= 0n) { actionError.value = 'Amount must be positive'; return }
      actionSubmitting.value = true; actionError.value = null
      try {
        const result = await doMint(token.mint, dest, amountRaw)
        if (result.success) { actionType.value = null; await refreshAll() }
        else actionError.value = result.error ?? 'Mint failed'
      } finally { actionSubmitting.value = false }
      return
    }

    if (type === 'burn') {
      const amt = actionForm.value.amount?.trim()
      if (!amt) return
      const amountRaw = BigInt(toRawUnits(parseFloat(amt) || 0, token.decimals))
      if (amountRaw <= 0n) { actionError.value = 'Amount must be positive'; return }
      actionSubmitting.value = true; actionError.value = null
      try {
        const result = await doBurn(token.mint, amountRaw)
        if (result.success) { actionType.value = null; await refreshAll() }
        else actionError.value = result.error ?? 'Burn failed'
      } finally { actionSubmitting.value = false }
      return
    }

    if (type === 'edit') {
      const name = editForm.value.name?.trim(); const symbol = editForm.value.symbol?.trim(); const uri = editForm.value.metadataUri?.trim()
      if (!name || !symbol || !uri) return
      actionSubmitting.value = true; actionError.value = null
      try {
        const result = await doEditMetadata(token.mint, { name, symbol, description: editForm.value.description?.trim() || undefined, imageUrl: editForm.value.imageUrl?.trim() || undefined, sellerFeeBasisPoints: clampBasisPoints(editForm.value.sellerFeeBasisPoints), metadataUri: uri })
        if (result.success) actionType.value = null
        else actionError.value = result.error ?? 'Edit failed'
      } finally { actionSubmitting.value = false }
    }
  }

  return {
    actionType, actionToken, actionError, actionSubmitting, actionForm,
    editForm, editUploadLoading, generatedEditJson, editJsonPreview, canEditUpload,
    actionModalTitle, actionSubmitLabel, canSubmitAction,
    openActionModal, onEditUploadMetadata, onGenerateEditJson, copyEditJson, downloadEditJson, onActionSubmit,
  }
}
