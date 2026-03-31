import { metaplexTokenSymbolValidationError, sanitizeMetaplexTokenSymbolInput } from '@decentraguild/web3'
import { useTenantStore } from '~/stores/tenant'
import type { CrafterToken } from './useCrafter'

export interface PublishForm {
  name: string
  symbol: string
  metadataUri: string
  description: string
  imageUrl: string
  sellerFeeBasisPoints: string
  storageBackend: 'api' | 'selfhost'
}

type PrepareMetadataFn = (params: { name: string; symbol: string; decimals: number; description: string; imageUrl: string; sellerFeeBasisPoints: number }) => Promise<{ metadataUri?: string; error?: string }>
type PublishMetadataFn = (mint: string, params: { metadataUri: string; name?: string; symbol?: string; description?: string; imageUrl?: string; sellerFeeBasisPoints?: number }) => Promise<{ success: boolean; error?: string }>

const clampBasisPoints = (v: unknown) => Math.max(0, Math.min(10000, Number(v) || 0))

export function useCrafterPublish(
  prepareMetadata: PrepareMetadataFn,
  publishMetadata: PublishMetadataFn,
) {
  const tenantStore = useTenantStore()

  const showPublishModal = ref(false)
  const publishToken = ref<CrafterToken | null>(null)
  const publishSubmitting = ref(false)
  const publishError = ref<string | null>(null)
  const publishUploadLoading = ref(false)
  const publishForm = ref<PublishForm>({
    name: '', symbol: '', metadataUri: '', description: '', imageUrl: '', sellerFeeBasisPoints: '0', storageBackend: 'api',
  })
  const generatedPublishJson = ref<Record<string, unknown> | null>(null)

  const canPublishMedia = computed(() => Boolean(publishToken.value))
  const publishJsonPreview = computed(() => generatedPublishJson.value ? JSON.stringify(generatedPublishJson.value, null, 2) : '')
  const resolvedPublishSymbol = computed(() => {
    const t = publishToken.value
    if (!t) return ''
    return publishForm.value.symbol.trim() || t.symbol || 'TKN'
  })
  const canPublish = computed(
    () =>
      publishForm.value.metadataUri.trim().length > 0
      && metaplexTokenSymbolValidationError(resolvedPublishSymbol.value) === null,
  )

  function openPublishModal(t: CrafterToken) {
    publishToken.value = t
    publishForm.value = { name: t.name || '', symbol: sanitizeMetaplexTokenSymbolInput(t.symbol || ''), metadataUri: '', description: '', imageUrl: '', sellerFeeBasisPoints: '0', storageBackend: 'api' }
    generatedPublishJson.value = null
    publishError.value = null
    showPublishModal.value = true
  }

  async function onUploadPublishMetadata() {
    if (!publishToken.value) return
    publishUploadLoading.value = true; publishError.value = null
    try {
      const result = await prepareMetadata({ name: publishForm.value.name.trim() || publishToken.value.name || 'Token', symbol: publishForm.value.symbol.trim() || publishToken.value.symbol || 'TKN', decimals: publishToken.value.decimals, description: '', imageUrl: publishForm.value.imageUrl, sellerFeeBasisPoints: clampBasisPoints(publishForm.value.sellerFeeBasisPoints) })
      if (result.metadataUri) publishForm.value.metadataUri = result.metadataUri
      else if (result.error) publishError.value = result.error
    } finally { publishUploadLoading.value = false }
  }

  function onGeneratePublishJson() {
    if (!publishToken.value) return
    const tenantId = tenantStore.tenantId ?? ''
    generatedPublishJson.value = {
      name: publishForm.value.name.trim() || publishToken.value.name || 'Token',
      symbol: publishForm.value.symbol.trim() || publishToken.value.symbol || 'TKN',
      description: publishForm.value.description.trim() || '',
      image: publishForm.value.imageUrl.trim() || undefined,
      seller_fee_basis_points: clampBasisPoints(publishForm.value.sellerFeeBasisPoints),
      external_url: '', attributes: [], properties: { files: [], category: 'token' },
      decentraguild: { tenantId, createdVia: 'crafter', version: 1 },
    }
  }

  function copyPublishJson() {
    if (!generatedPublishJson.value) return
    navigator.clipboard.writeText(JSON.stringify(generatedPublishJson.value, null, 2))
  }

  function downloadPublishJson() {
    if (!generatedPublishJson.value || !publishToken.value) return
    const blob = new Blob([JSON.stringify(generatedPublishJson.value, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `metadata-${publishToken.value.symbol.toLowerCase() || 'token'}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  async function onPublishSubmit() {
    if (!publishToken.value || !canPublish.value) return
    publishSubmitting.value = true; publishError.value = null
    try {
      const result = await publishMetadata(publishToken.value.mint, { metadataUri: publishForm.value.metadataUri.trim(), name: publishForm.value.name.trim() || undefined, symbol: publishForm.value.symbol.trim() || undefined, description: publishForm.value.description.trim() || undefined, imageUrl: publishForm.value.imageUrl.trim() || undefined, sellerFeeBasisPoints: clampBasisPoints(publishForm.value.sellerFeeBasisPoints) })
      if (result.success) { showPublishModal.value = false; publishToken.value = null }
      else publishError.value = result.error ?? 'Publish failed'
    } finally { publishSubmitting.value = false }
  }

  return {
    showPublishModal, publishToken, publishSubmitting, publishError, publishUploadLoading,
    publishForm, generatedPublishJson, publishJsonPreview, canPublishMedia, canPublish,
    openPublishModal, onUploadPublishMetadata, onGeneratePublishJson, copyPublishJson, downloadPublishJson, onPublishSubmit,
  }
}
