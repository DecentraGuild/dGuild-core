<template>
  <PageSection title="Crafter" module-id="crafter">
    <div class="crafter-page">
      <p v-if="!crafterEnabled" class="crafter-page__empty">
        Crafter is not enabled for this community. Enable it in Admin → Modules.
      </p>

      <template v-else>
        <div v-if="loading" class="crafter-page__loading">
          <Icon icon="lucide:loader-2" class="crafter-page__spinner" />
          <span>Loading tokens...</span>
        </div>

        <div v-else class="admin__split">
          <div class="admin__panel crafter-page__content">
            <div class="crafter-page__grid admin__card-grid--auto-dense">
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
                      variant="brand"
                      size="sm"
                      @click="openPublishModal(t)"
                    >
                      Add metadata
                    </Button>
                    <template v-if="t.metadata_uri">
                      <Button variant="brand" size="sm" @click="openActionModal('mint', t)">Mint</Button>
                      <Button variant="destructive" size="sm" @click="openActionModal('burn', t)">Burn</Button>
                      <Button variant="ghost" size="sm" @click="openActionModal('edit', t)">Edit</Button>
                    </template>
                    <a
                      :href="tokenUrl(t.mint)"
                      target="_blank"
                      rel="noopener"
                      class="crafter-card__link"
                    >
                      <Icon icon="lucide:external-link" />
                    </a>
                  </div>
                </div>
              </div>
              <button
                type="button"
                class="crafter-card crafter-card--create"
                @click="showCreateModal = true"
              >
                <Icon icon="lucide:plus" class="crafter-card__create-icon" />
                <span class="crafter-card__create-label">Create token</span>
              </button>
            </div>
          </div>

          <AdminPricingWidget
            module-id="crafter"
            :module-state="crafterModuleState"
            :conditions="{ tokensCount: tokens.length + 1 }"
            :subscription="subscriptions.crafter ?? null"
          />
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
              v-model="createForm.decimals"
              type="number"
              label="Decimals"
              placeholder="6"
            />
            <p class="crafter-create-form__hint crafter-create-form__hint--stages">
              Stage 1: Create mint + pay (decimals only). Add name, symbol, image in metadata (stage 2).
            </p>
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
            <FormInput v-model="publishForm.name" label="Name" placeholder="Token name" />
            <FormInput
              :model-value="publishForm.symbol"
              label="Symbol"
              placeholder="e.g. TKN"
              :maxlength="METAPLEX_TOKEN_SYMBOL_MAX_LEN"
              @update:model-value="publishForm.symbol = sanitizeMetaplexTokenSymbolInput($event)"
            />
            <p class="crafter-create-form__hint">Symbol: up to {{ METAPLEX_TOKEN_SYMBOL_MAX_LEN }} characters (letters, numbers, - or _).</p>
            <FormInput v-model="publishForm.description" label="Description" placeholder="Optional" />
            <FormInput v-model="publishForm.imageUrl" label="Image URL" placeholder="Optional" />
            <FormInput v-model="publishForm.sellerFeeBasisPoints" type="number" label="Royalty (basis points)" placeholder="0" />
            <OptionsSelect
              v-model="publishForm.storageBackend"
              label="Storage"
              :options="[{ value: 'api', label: 'DecentraGuild API' }, { value: 'selfhost', label: 'Self-hosted' }]"
              content-class="z-[9999]"
            />
            <template v-if="publishForm.storageBackend === 'api'">
              <Button type="button" variant="default" :disabled="!canPublishMedia || publishUploadLoading" @click="onUploadPublishMetadata">
                <Icon v-if="publishUploadLoading" icon="lucide:loader-2" class="crafter-create-form__spinner" />
                <span v-else>Upload to dGuild</span>
              </Button>
              <p v-if="publishForm.metadataUri" class="crafter-create-form__uri-hint">Metadata uploaded</p>
            </template>
            <template v-else>
              <Button type="button" variant="brand" :disabled="!canPublishMedia" @click="onGeneratePublishJson">Generate JSON</Button>
              <div v-if="generatedPublishJson" class="crafter-create-form__output">
                <div class="crafter-create-form__json-actions">
                  <Button variant="brand" size="sm" @click="copyPublishJson">Copy</Button>
                  <Button variant="brand" size="sm" @click="downloadPublishJson">Download</Button>
                </div>
                <pre class="crafter-create-form__pre">{{ publishJsonPreview }}</pre>
              </div>
              <p class="crafter-create-form__selfhost-hint">Host the JSON, then paste the URI below.</p>
              <FormInput v-model="publishForm.metadataUri" label="Metadata URI" placeholder="https://arweave.net/... or IPFS link" required />
            </template>
            <p v-if="publishError" class="crafter-create-form__error">{{ publishError }}</p>
            <div class="crafter-create-form__actions">
              <Button variant="secondary" type="button" @click="showPublishModal = false">Cancel</Button>
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
              <p class="crafter-create-form__hint">Update on-chain metadata. Edit any field, then upload or paste URI.</p>
              <FormInput v-model="editForm.name" label="Name" required />
              <FormInput
                :model-value="editForm.symbol"
                label="Symbol"
                required
                :maxlength="METAPLEX_TOKEN_SYMBOL_MAX_LEN"
                @update:model-value="editForm.symbol = sanitizeMetaplexTokenSymbolInput($event)"
              />
              <p class="crafter-create-form__hint">Symbol: up to {{ METAPLEX_TOKEN_SYMBOL_MAX_LEN }} characters (letters, numbers, - or _).</p>
              <FormInput v-model="editForm.description" label="Description" placeholder="Optional" />
              <FormInput v-model="editForm.imageUrl" label="Image URL" placeholder="Optional" />
              <FormInput v-model="editForm.sellerFeeBasisPoints" type="number" label="Royalty (basis points)" placeholder="0" />
              <OptionsSelect
                v-model="editForm.storageBackend"
                label="Storage"
                :options="[{ value: 'api', label: 'DecentraGuild API' }, { value: 'selfhost', label: 'Self-hosted' }]"
                content-class="z-[9999]"
              />
              <template v-if="editForm.storageBackend === 'api'">
                <Button type="button" variant="default" :disabled="!canEditUpload || editUploadLoading" @click="onEditUploadMetadata">
                  <Icon v-if="editUploadLoading" icon="lucide:loader-2" class="crafter-create-form__spinner" />
                  <span v-else>Upload to dGuild</span>
                </Button>
                <p v-if="editForm.metadataUri" class="crafter-create-form__uri-hint">Metadata uploaded</p>
              </template>
              <template v-else>
                <Button type="button" variant="brand" :disabled="!canEditUpload" @click="onGenerateEditJson">Generate JSON</Button>
                <div v-if="generatedEditJson" class="crafter-create-form__output">
                  <div class="crafter-create-form__json-actions">
                    <Button variant="brand" size="sm" @click="copyEditJson">Copy</Button>
                    <Button variant="brand" size="sm" @click="downloadEditJson">Download</Button>
                  </div>
                  <pre class="crafter-create-form__pre">{{ editJsonPreview }}</pre>
                </div>
                <p class="crafter-create-form__selfhost-hint">Host the JSON, then paste the URI below.</p>
                <FormInput v-model="editForm.metadataUri" label="Metadata URI" placeholder="https://arweave.net/... or IPFS link" required />
              </template>
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
import { METAPLEX_TOKEN_SYMBOL_MAX_LEN, sanitizeMetaplexTokenSymbolInput } from '@decentraguild/web3'
import { truncateAddress, formatRawTokenAmount } from '@decentraguild/display'
import { useExplorerLinks } from '@decentraguild/nuxt-composables'
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import OptionsSelect from '~/components/ui/options-select/OptionsSelect.vue'
import { useCrafter, type CrafterCreateForm } from '~/composables/crafter/useCrafter'
import { useCrafterPublish } from '~/composables/crafter/useCrafterPublish'
import { useCrafterActions } from '~/composables/crafter/useCrafterActions'
import SimpleModal from '~/components/ui/simple-modal/SimpleModal.vue'
import AdminPricingWidget from '~/components/admin/AdminPricingWidget.vue'
import { useTenantStore } from '~/stores/tenant'
import { useAuth } from '@decentraguild/auth'
import { getModuleState, isModuleVisibleInAdmin } from '@decentraguild/core'
import { useAdminSubscriptions } from '~/composables/admin/useAdminSubscriptions'

definePageMeta({ middleware: 'admin-auth' })

const { subscriptions, fetchSubscription } = useAdminSubscriptions()
const tenantStore = useTenantStore()
const auth = useAuth()
const crafterModuleState = computed(() => getModuleState(tenantStore.tenant?.modules?.crafter))
const crafterEnabled = computed(() => {
  const mod = tenantStore.tenant?.modules?.crafter
  return mod && isModuleVisibleInAdmin(getModuleState(mod))
})

const { tokens, loading, createSubmitting, createError, createTxStatus, list, create, publishMetadata, prepareMetadata, fetchSupplyAndBalance, mint: doMint, burn: doBurn, editMetadata: doEditMetadata } = useCrafter()

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
async function refreshAll() { await list(); await refreshSupplyAndBalance() }

const canCreate = computed(() => true)
const showCreateModal = ref(false)
const createForm = ref<CrafterCreateForm>({ decimals: '6' })

async function onCreateSubmit() {
  const decimals = Number(createForm.value.decimals) || 6
  const result = await create({ ...createForm.value, decimals })
  if (result.success) { showCreateModal.value = false; createForm.value = { decimals: '6' } }
}

const {
  showPublishModal, publishToken, publishSubmitting, publishError, publishUploadLoading,
  publishForm, generatedPublishJson, publishJsonPreview, canPublishMedia, canPublish,
  openPublishModal, onUploadPublishMetadata, onGeneratePublishJson, copyPublishJson, downloadPublishJson, onPublishSubmit,
} = useCrafterPublish(prepareMetadata, publishMetadata)

const {
  actionType, actionToken, actionError, actionSubmitting, actionForm,
  editForm, editUploadLoading, generatedEditJson, editJsonPreview, canEditUpload,
  actionModalTitle, actionSubmitLabel, canSubmitAction,
  openActionModal, onEditUploadMetadata, onGenerateEditJson, copyEditJson, downloadEditJson, onActionSubmit,
} = useCrafterActions(doMint, doBurn, doEditMetadata, prepareMetadata, refreshAll)

const { tokenUrl } = useExplorerLinks()

onMounted(() => {
  if (crafterEnabled.value) { void list(); void fetchSubscription('crafter') }
})
watch(crafterEnabled, (enabled) => {
  if (enabled) { void list(); void fetchSubscription('crafter') }
})
watch(
  () => [tokens.value, auth.wallet.value],
  () => { if (tokens.value.length && crafterEnabled.value) void refreshSupplyAndBalance() },
  { immediate: true },
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

.crafter-card--create {
  cursor: pointer;
  border: var(--theme-border-medium) dashed var(--theme-border);
  background: var(--theme-bg-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 12rem;
  padding: var(--theme-space-lg);
}

.crafter-card--create:hover {
  border-color: var(--theme-primary);
  background: var(--theme-bg-secondary);
}

.crafter-card__create-icon {
  font-size: 2.5rem;
  color: var(--theme-text-muted);
  margin-bottom: var(--theme-space-sm);
}

.crafter-card--create:hover .crafter-card__create-icon {
  color: var(--theme-primary);
}

.crafter-card__create-label {
  font-size: var(--theme-font-sm);
  font-weight: 500;
  color: var(--theme-text-secondary);
}

.crafter-card--create:hover .crafter-card__create-label {
  color: var(--theme-primary);
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
  background: var(--theme-bg-muted);
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
  color: var(--theme-secondary);
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

.crafter-card__stat { display: block; }

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

.crafter-card__link:hover { text-decoration: underline; }

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
</style>
