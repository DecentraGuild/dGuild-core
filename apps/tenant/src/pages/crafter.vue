<template>
  <PageSection title="Crafter">
    <div class="crafter-page">
      <p v-if="!crafterEnabled" class="crafter-page__empty">
        Crafter is not enabled for this community. Enable it in Admin → Modules.
      </p>

      <template v-else>
        <div v-if="loading" class="crafter-page__loading">
          <Icon icon="lucide:loader-2" class="crafter-page__spinner" />
          <span>Loading tokens...</span>
        </div>

        <div v-else class="crafter-page__content">
          <div class="crafter-page__header">
            <Button @click="showCreateModal = true">
              <Icon icon="lucide:plus" class="crafter-page__btn-icon" />
              Create token
            </Button>
          </div>

          <div v-if="tokens.length === 0" class="crafter-page__empty">
            <p>No tokens yet. Create your first SPL token.</p>
          </div>

          <div v-else class="crafter-page__grid">
            <div
              v-for="t in tokens"
              :key="t.mint"
              class="crafter-card"
            >
              <div v-if="t.image_url" class="crafter-card__image-wrap">
                <img :src="t.image_url" :alt="t.name" class="crafter-card__image" />
              </div>
              <div v-else class="crafter-card__placeholder">
                <Icon icon="lucide:coin" class="crafter-card__placeholder-icon" />
              </div>
              <div class="crafter-card__body">
                <h3 class="crafter-card__name">{{ t.name || t.symbol || 'Token' }}</h3>
                <p class="crafter-card__symbol">{{ t.symbol }}</p>
                <code class="crafter-card__mint">{{ truncateAddress(t.mint, 6, 4) }}</code>
                <div class="crafter-card__stats">
                  <span class="crafter-card__stat">
                    Circulating: {{ supplyByMint[t.mint] ?? '…' }}
                  </span>
                  <span class="crafter-card__stat">
                    Balance: {{ balanceByMint[t.mint] ?? '…' }}
                  </span>
                </div>
                <div class="crafter-card__actions">
                  <Button
                    v-if="!t.metadata_uri"
                    variant="secondary"
                    size="sm"
                    @click="openPublishModal(t)"
                  >
                    Add metadata
                  </Button>
                  <Button variant="secondary" size="sm" @click="openActionModal('mint', t)">Mint</Button>
                  <Button variant="secondary" size="sm" @click="openActionModal('burn', t)">Burn</Button>
                  <Button v-if="t.metadata_uri" variant="ghost" size="sm" @click="openActionModal('edit', t)">Edit</Button>
                  <Button variant="ghost" size="sm" @click="openActionModal('close', t)">Close</Button>
                  <a
                    :href="solscanUrl(t.mint)"
                    target="_blank"
                    rel="noopener"
                    class="crafter-card__link"
                  >
                    <Icon icon="lucide:external-link" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <SimpleModal
          :model-value="showCreateModal"
          title="Create token"
          wide
          @update:model-value="showCreateModal = false"
        >
          <form
            v-if="showCreateModal"
            class="crafter-create-form"
            @submit.prevent="onCreateSubmit"
          >
            <FormInput
              v-model="createForm.name"
              label="Name"
              placeholder="Token name"
              required
            />
            <FormInput
              v-model="createForm.symbol"
              label="Symbol"
              placeholder="e.g. TKN"
              required
            />
            <FormInput
              v-model="createForm.decimals"
              type="number"
              label="Decimals"
              placeholder="6"
            />
            <p class="crafter-create-form__hint crafter-create-form__hint--stages">
              Stage 1: Create mint + pay. Then add metadata (stage 2), then mint/burn/edit (stage 3).
            </p>
            <p class="crafter-create-form__fee">5 USDC one-time per token</p>
            <p v-if="createError" class="crafter-create-form__error">{{ createError }}</p>
            <p v-if="createTxStatus" class="crafter-create-form__status">{{ createTxStatus }}</p>
            <div class="crafter-create-form__actions">
              <Button variant="secondary" type="button" @click="showCreateModal = false">
                Cancel
              </Button>
              <Button type="submit" :disabled="createSubmitting || !canCreate">
                <Icon v-if="createSubmitting" icon="lucide:loader-2" class="crafter-create-form__spinner" />
                <span v-else>Create token</span>
              </Button>
            </div>
          </form>
        </SimpleModal>

        <SimpleModal
          :model-value="showPublishModal"
          title="Add metadata (stage 2)"
          wide
          @update:model-value="showPublishModal = false"
        >
          <form
            v-if="publishToken && showPublishModal"
            class="crafter-create-form"
            @submit.prevent="onPublishSubmit"
          >
            <p class="crafter-create-form__hint">
              Publish metadata on-chain. Edit name/symbol if needed (e.g. for ops-imported tokens).
            </p>
            <FormInput
              v-model="publishForm.name"
              label="Name"
              placeholder="Token name"
            />
            <FormInput
              v-model="publishForm.symbol"
              label="Symbol"
              placeholder="e.g. TKN"
            />
            <FormInput
              v-model="publishForm.description"
              label="Description"
              placeholder="Optional"
            />
            <FormInput
              v-model="publishForm.imageUrl"
              label="Image URL"
              placeholder="Optional"
            />
            <FormInput
              v-model="publishForm.sellerFeeBasisPoints"
              type="number"
              label="Royalty (basis points)"
              placeholder="0"
            />
            <OptionsSelect
              v-model="publishForm.storageBackend"
              label="Storage"
              :options="[
                { value: 'api', label: 'DecentraGuild API' },
                { value: 'selfhost', label: 'Self-hosted' },
              ]"
              content-class="z-[9999]"
            />
            <template v-if="publishForm.storageBackend === 'api'">
              <Button
                type="button"
                variant="secondary"
                :disabled="!canPublishMedia || publishUploadLoading"
                @click="onUploadPublishMetadata"
              >
                <Icon v-if="publishUploadLoading" icon="lucide:loader-2" class="crafter-create-form__spinner" />
                <span v-else>Upload to dGuild</span>
              </Button>
              <p v-if="publishForm.metadataUri" class="crafter-create-form__uri-hint">Metadata uploaded</p>
            </template>
            <template v-else>
              <Button
                type="button"
                variant="secondary"
                :disabled="!canPublishMedia"
                @click="onGeneratePublishJson"
              >
                Generate JSON
              </Button>
              <div v-if="generatedPublishJson" class="crafter-create-form__output">
                <div class="crafter-create-form__json-actions">
                  <Button variant="secondary" size="sm" @click="copyPublishJson">Copy</Button>
                  <Button variant="secondary" size="sm" @click="downloadPublishJson">Download</Button>
                </div>
                <pre class="crafter-create-form__pre">{{ publishJsonPreview }}</pre>
              </div>
              <p class="crafter-create-form__selfhost-hint">Host the JSON, then paste the URI below.</p>
              <FormInput
                v-model="publishForm.metadataUri"
                label="Metadata URI"
                placeholder="https://arweave.net/... or IPFS link"
                required
              />
            </template>
            <p v-if="publishError" class="crafter-create-form__error">{{ publishError }}</p>
            <div class="crafter-create-form__actions">
              <Button variant="secondary" type="button" @click="showPublishModal = false">
                Cancel
              </Button>
              <Button type="submit" :disabled="publishSubmitting || !canPublish">
                <Icon v-if="publishSubmitting" icon="lucide:loader-2" class="crafter-create-form__spinner" />
                <span v-else>Publish metadata</span>
              </Button>
            </div>
          </form>
        </SimpleModal>

        <SimpleModal
          :model-value="!!actionType"
          :title="actionModalTitle"
          :wide="actionType === 'edit'"
          @update:model-value="actionType = null"
        >
          <form v-if="actionToken && actionType" class="crafter-create-form" @submit.prevent="onActionSubmit">
            <template v-if="actionType === 'mint'">
              <p class="crafter-create-form__hint">Mint tokens to a destination.</p>
              <FormInput v-model="actionForm.destination" label="Destination (wallet)" placeholder="Wallet address" required />
              <FormInput v-model="actionForm.amount" label="Amount" placeholder="e.g. 1000" required />
            </template>
            <template v-else-if="actionType === 'burn'">
              <p class="crafter-create-form__hint">Burn from your wallet. Balance: {{ balanceByMint[actionToken.mint] ?? '…' }}</p>
              <FormInput v-model="actionForm.amount" label="Amount" placeholder="e.g. 100" required />
            </template>
            <template v-else-if="actionType === 'edit'">
              <p class="crafter-create-form__hint">Update on-chain metadata (name, symbol, URI).</p>
              <FormInput v-model="actionForm.name" label="Name" required />
              <FormInput v-model="actionForm.symbol" label="Symbol" required />
              <FormInput v-model="actionForm.metadataUri" label="Metadata URI" required />
            </template>
            <template v-else-if="actionType === 'close'">
              <p class="crafter-create-form__hint">Close your empty token account to reclaim rent (~0.002 SOL). Account must have zero balance.</p>
            </template>
            <p v-if="actionError" class="crafter-create-form__error">{{ actionError }}</p>
            <div class="crafter-create-form__actions">
              <Button type="button" variant="secondary" @click="actionType = null">Cancel</Button>
              <Button type="submit" :disabled="actionSubmitting || !canSubmitAction">
                <Icon v-if="actionSubmitting" icon="lucide:loader-2" class="crafter-create-form__spinner" />
                <span v-else>{{ actionSubmitLabel }}</span>
              </Button>
            </div>
          </form>
        </SimpleModal>
      </template>
    </div>
  </PageSection>
</template>

<script setup lang="ts">
import { truncateAddress, formatRawTokenAmount, toRawUnits } from '@decentraguild/display'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import OptionsSelect from '~/components/ui/options-select/OptionsSelect.vue'
import { useCrafter, type CrafterToken, type CrafterCreateForm } from '~/composables/crafter/useCrafter'
import SimpleModal from '~/components/ui/simple-modal/SimpleModal.vue'
import { useTenantStore } from '~/stores/tenant'
import { useAuth } from '@decentraguild/auth'
import { getModuleState, isModuleVisibleInAdmin } from '@decentraguild/core'

definePageMeta({ middleware: 'admin-auth' })

const clampBasisPoints = (v: unknown) => Math.max(0, Math.min(10000, Number(v) || 0))
const tenantStore = useTenantStore()
const crafterEnabled = computed(() => {
  const mod = tenantStore.tenant?.modules?.crafter
  return mod && isModuleVisibleInAdmin(getModuleState(mod))
})

const auth = useAuth()
const {
  tokens,
  loading,
  createSubmitting,
  createError,
  createTxStatus,
  list,
  create,
  publishMetadata,
  prepareMetadata,
  fetchSupplyAndBalance,
  mint: doMint,
  burn: doBurn,
  editMetadata: doEditMetadata,
  closeAccount: doCloseAccount,
  remove: removeToken,
} = useCrafter()

const supplyByMint = ref<Record<string, string>>({})
const balanceByMint = ref<Record<string, string>>({})

async function refreshSupplyAndBalance() {
  const wallet = auth.wallet.value
  for (const t of tokens.value) {
    const { supply, walletBalance } = await fetchSupplyAndBalance(t.mint, t.decimals, wallet)
    supplyByMint.value[t.mint] = formatRawTokenAmount(supply, t.decimals, 'SPL')
    balanceByMint.value[t.mint] = formatRawTokenAmount(walletBalance, t.decimals, 'SPL')
  }
}
async function refreshAll() {
  await list()
  await refreshSupplyAndBalance()
}

const canCreate = computed(
  () =>
    createForm.value.name.trim().length > 0 &&
    createForm.value.symbol.trim().length > 0
)

const showCreateModal = ref(false)
const createForm = ref<CrafterCreateForm>({
  name: '',
  symbol: '',
  decimals: '6',
})

const showPublishModal = ref(false)
const publishToken = ref<CrafterToken | null>(null)
const publishSubmitting = ref(false)
const publishError = ref<string | null>(null)
const publishUploadLoading = ref(false)
const publishForm = ref({
  name: '',
  symbol: '',
  metadataUri: '',
  description: '',
  imageUrl: '',
  sellerFeeBasisPoints: '0',
  storageBackend: 'api' as 'api' | 'selfhost',
})
const generatedPublishJson = ref<Record<string, unknown> | null>(null)

const canPublishMedia = computed(() => Boolean(publishToken.value))
const publishJsonPreview = computed(() =>
  generatedPublishJson.value ? JSON.stringify(generatedPublishJson.value, null, 2) : ''
)
const canPublish = computed(() => publishForm.value.metadataUri.trim().length > 0)

function openPublishModal(t: CrafterToken) {
  publishToken.value = t
  publishForm.value = {
    name: t.name || '',
    symbol: t.symbol || '',
    metadataUri: '',
    description: '',
    imageUrl: '',
    sellerFeeBasisPoints: '0',
    storageBackend: 'api',
  }
  generatedPublishJson.value = null
  publishError.value = null
  showPublishModal.value = true
}

async function onUploadPublishMetadata() {
  if (!publishToken.value) return
  publishUploadLoading.value = true
  publishError.value = null
  try {
    const result = await prepareMetadata({
      name: publishForm.value.name.trim() || publishToken.value.name || 'Token',
      symbol: publishForm.value.symbol.trim() || publishToken.value.symbol || 'TKN',
      decimals: publishToken.value.decimals,
      description: '',
      imageUrl: publishForm.value.imageUrl,
      sellerFeeBasisPoints: clampBasisPoints(publishForm.value.sellerFeeBasisPoints),
    })
    if (result.metadataUri) {
      publishForm.value.metadataUri = result.metadataUri
    } else if (result.error) {
      publishError.value = result.error
    }
  } finally {
    publishUploadLoading.value = false
  }
}

function onGeneratePublishJson() {
  if (!publishToken.value) return
  const tenantId = tenantStore.tenantId ?? ''
  const meta = {
    name: publishForm.value.name.trim() || publishToken.value.name || 'Token',
    symbol: publishForm.value.symbol.trim() || publishToken.value.symbol || 'TKN',
    description: publishForm.value.description.trim() || '',
    image: publishForm.value.imageUrl.trim() || undefined,
    seller_fee_basis_points: clampBasisPoints(publishForm.value.sellerFeeBasisPoints),
    external_url: '',
    attributes: [],
    properties: { files: [], category: 'token' },
    decentraguild: {
      tenantId,
      createdVia: 'crafter',
      version: 1,
    },
  }
  generatedPublishJson.value = meta
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
  a.href = url
  a.download = `metadata-${publishToken.value.symbol.toLowerCase() || 'token'}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function onPublishSubmit() {
  if (!publishToken.value || !canPublish.value) return
  publishSubmitting.value = true
  publishError.value = null
  try {
    const result = await publishMetadata(publishToken.value.mint, {
      metadataUri: publishForm.value.metadataUri.trim(),
      name: publishForm.value.name.trim() || undefined,
      symbol: publishForm.value.symbol.trim() || undefined,
      description: publishForm.value.description.trim() || undefined,
      imageUrl: publishForm.value.imageUrl.trim() || undefined,
      sellerFeeBasisPoints: clampBasisPoints(publishForm.value.sellerFeeBasisPoints),
    })
    if (result.success) {
      showPublishModal.value = false
      publishToken.value = null
    } else {
      publishError.value = result.error ?? 'Publish failed'
    }
  } finally {
    publishSubmitting.value = false
  }
}

function solscanUrl(mint: string): string {
  const cluster = process.env.NODE_ENV === 'production' ? '' : '?cluster=devnet'
  return `https://solscan.io/token/${mint}${cluster}`
}

async function onCreateSubmit() {
  const decimals = Number(createForm.value.decimals) || 6
  const result = await create({ ...createForm.value, decimals })
  if (result.success) {
    showCreateModal.value = false
    createForm.value = { name: '', symbol: '', decimals: '6' }
  }
}

type ActionType = 'mint' | 'burn' | 'edit' | 'close'
const actionType = ref<ActionType | null>(null)
const actionToken = ref<CrafterToken | null>(null)
const actionError = ref<string | null>(null)
const actionSubmitting = ref(false)
const actionForm = ref<Record<string, string>>({})

const actionModalTitle = computed(() =>
  actionType.value === 'edit' ? 'Edit metadata' : actionType.value === 'close' ? 'Close account' : actionType.value ? actionType.value.charAt(0).toUpperCase() + actionType.value.slice(1) : ''
)
const actionSubmitLabel = computed(() =>
  actionType.value === 'edit' ? 'Save' : actionType.value === 'close' ? 'Close account' : actionType.value ?? ''
)
const canSubmitAction = computed(() => {
  if (!actionType.value || !actionToken.value) return false
  switch (actionType.value) {
    case 'mint':
      return actionForm.value.destination?.trim() && actionForm.value.amount?.trim()
    case 'burn':
      return !!actionForm.value.amount?.trim()
    case 'edit':
      return actionForm.value.name?.trim() && actionForm.value.symbol?.trim() && actionForm.value.metadataUri?.trim()
    case 'close':
      return true
    default:
      return false
  }
})

function openActionModal(type: ActionType, t: CrafterToken) {
  actionType.value = type
  actionToken.value = t
  actionError.value = null
  if (type === 'mint') actionForm.value = { destination: auth.wallet.value ?? '', amount: '' }
  else if (type === 'burn') actionForm.value = { amount: '' }
  else if (type === 'edit') actionForm.value = { name: t.name || '', symbol: t.symbol || '', metadataUri: t.metadata_uri || '' }
  else actionForm.value = {}
}

async function onActionSubmit() {
  const token = actionToken.value
  const type = actionType.value
  if (!token || !type) return

  if (type === 'mint') {
    const dest = actionForm.value.destination?.trim()
    const amt = actionForm.value.amount?.trim()
    if (!dest || !amt) return
    const amountRaw = BigInt(toRawUnits(parseFloat(amt) || 0, token.decimals))
    if (amountRaw <= 0n) {
      actionError.value = 'Amount must be positive'
      return
    }
    actionSubmitting.value = true
    actionError.value = null
    try {
      const result = await doMint(token.mint, dest, amountRaw)
      if (result.success) {
        actionType.value = null
        await refreshAll()
      } else {
        actionError.value = result.error ?? 'Mint failed'
      }
    } finally {
      actionSubmitting.value = false
    }
    return
  }

  if (type === 'burn') {
    const amt = actionForm.value.amount?.trim()
    if (!amt) return
    const amountRaw = BigInt(toRawUnits(parseFloat(amt) || 0, token.decimals))
    if (amountRaw <= 0n) {
      actionError.value = 'Amount must be positive'
      return
    }
    actionSubmitting.value = true
    actionError.value = null
    try {
      const result = await doBurn(token.mint, amountRaw)
      if (result.success) {
        actionType.value = null
        await refreshAll()
      } else {
        actionError.value = result.error ?? 'Burn failed'
      }
    } finally {
      actionSubmitting.value = false
    }
    return
  }

  if (type === 'edit') {
    const name = actionForm.value.name?.trim()
    const symbol = actionForm.value.symbol?.trim()
    const uri = actionForm.value.metadataUri?.trim()
    if (!name || !symbol || !uri) return
    actionSubmitting.value = true
    actionError.value = null
    try {
      const result = await doEditMetadata(token.mint, name, symbol, uri)
      if (result.success) actionType.value = null
      else actionError.value = result.error ?? 'Edit failed'
    } finally {
      actionSubmitting.value = false
    }
    return
  }

  if (type === 'close' && auth.wallet.value) {
    actionSubmitting.value = true
    actionError.value = null
    try {
      const mintPk = new PublicKey(token.mint)
      const walletPk = new PublicKey(auth.wallet.value)
      const ata = getAssociatedTokenAddressSync(mintPk, walletPk)
      const result = await doCloseAccount(token.mint, ata.toBase58(), auth.wallet.value)
      if (result.success) {
        const removed = await removeToken(token.mint)
        if (removed.success) {
          actionType.value = null
          await refreshSupplyAndBalance()
        } else {
          actionError.value = removed.error ?? 'Close succeeded but failed to remove from list'
        }
      } else {
        actionError.value = result.error ?? 'Close failed'
      }
    } finally {
      actionSubmitting.value = false
    }
  }
}

onMounted(() => {
  if (crafterEnabled.value) void list()
})
watch(crafterEnabled, (enabled) => {
  if (enabled) void list()
})
watch(
  () => [tokens.value, auth.wallet.value],
  () => {
    if (tokens.value.length && crafterEnabled.value) void refreshSupplyAndBalance()
  },
  { immediate: true }
)
</script>

<style scoped>
.crafter-page {
  padding: var(--theme-space-md) 0;
  min-height: 200px;
}

.crafter-page__loading,
.crafter-page__empty {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  color: var(--theme-text-secondary);
  font-size: var(--theme-font-md);
}

.crafter-page__spinner {
  animation: crafter-spin 1s linear infinite;
}

@keyframes crafter-spin {
  to { transform: rotate(360deg); }
}

.crafter-page__content {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-lg);
}

.crafter-page__header {
  display: flex;
  justify-content: flex-end;
}

.crafter-page__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--theme-space-lg);
}

.crafter-card {
  display: flex;
  flex-direction: column;
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  overflow: hidden;
  background: var(--theme-bg-card);
}

.crafter-card__image-wrap {
  aspect-ratio: 1;
  overflow: hidden;
}

.crafter-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.crafter-card__placeholder {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--theme-bg-muted, #f0f0f0);
}

.crafter-card__placeholder-icon {
  font-size: 3rem;
  color: var(--theme-text-muted);
}

.crafter-card__body {
  padding: var(--theme-space-md);
}

.crafter-card__name {
  font-size: var(--theme-font-lg);
  font-weight: 600;
  margin: 0 0 var(--theme-space-xs);
}

.crafter-card__symbol {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin: 0 0 var(--theme-space-sm);
}

.crafter-card__mint {
  font-size: var(--theme-font-xs);
  font-family: var(--theme-font-mono, monospace);
  color: var(--theme-text-muted);
  display: block;
  margin-bottom: var(--theme-space-sm);
}

.crafter-card__stats {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
  margin-bottom: var(--theme-space-sm);
}

.crafter-card__stat {
  display: block;
}

.crafter-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--theme-space-sm);
}

.crafter-card__link {
  display: inline-flex;
  color: var(--theme-primary);
}

.crafter-card__link:hover {
  text-decoration: underline;
}

.crafter-create-form {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.crafter-create-form__uri-hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-primary);
}

.crafter-create-form__hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin: calc(-1 * var(--theme-space-sm)) 0 0;
}

.crafter-create-form__selfhost-hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.crafter-create-form__output {
  margin-top: var(--theme-space-md);
  padding-top: var(--theme-space-md);
  border-top: var(--theme-border-thin) solid var(--theme-border);
}

.crafter-create-form__output h4 {
  font-size: var(--theme-font-md);
  margin: 0 0 var(--theme-space-sm);
}

.crafter-create-form__json-actions {
  display: flex;
  gap: var(--theme-space-sm);
  margin-bottom: var(--theme-space-sm);
}

.crafter-create-form__pre {
  font-size: var(--theme-font-xs);
  background: var(--theme-bg-secondary);
  padding: var(--theme-space-md);
  border-radius: var(--theme-radius-md);
  overflow-x: auto;
  max-height: 12rem;
  overflow-y: auto;
  margin: 0;
}

.crafter-create-form__fee {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.crafter-create-form__error {
  font-size: var(--theme-font-sm);
  color: var(--theme-error, #dc3545);
}

.crafter-create-form__status {
  font-size: var(--theme-font-sm);
  color: var(--theme-primary);
}

.crafter-create-form__actions {
  display: flex;
  gap: var(--theme-space-md);
  justify-content: flex-end;
  margin-top: var(--theme-space-md);
}

.crafter-create-form__spinner {
  animation: crafter-spin 1s linear infinite;
}

.crafter-page__btn-icon {
  margin-right: var(--theme-space-xs);
}
</style>
