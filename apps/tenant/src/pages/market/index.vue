<template>
  <PageSection module-id="marketplace">
    <ClientOnly>
      <div v-if="!marketplaceActive" class="market-shell-inactive">
        <p>Marketplace is not enabled for this dGuild.</p>
      </div>
      <div
        v-else
        class="market-shell"
        :class="{
          'market-shell--no-tree': activeTab === 'open-trades',
          'market-shell--tree-collapsed': activeTab !== 'open-trades' && !treeSidebarOpen,
        }"
      >
        <div v-if="marketplaceDeactivating" class="market-shell__banner">
          Marketplace is winding down. You can cancel your trades or claim goods; no new trades can be created or filled.
        </div>
        <aside v-if="activeTab !== 'open-trades'" class="market-shell__tree">
          <button
            v-if="!treeSidebarOpen"
            type="button"
            class="market-shell__tree-toggle"
            aria-label="Show asset tree"
            @click="treeSidebarOpen = true"
          >
            <Icon icon="lucide:panel-left-open" />
          </button>
          <div v-show="treeSidebarOpen" class="market-shell__tree-inner">
            <div class="market-shell__tree-toolbar">
              <button
                type="button"
                class="market-shell__tree-collapse"
                aria-label="Hide asset tree"
                @click="treeSidebarOpen = false"
              >
                <Icon icon="lucide:panel-left-close" />
              </button>
            </div>
            <MarketTree
              :tree="tree"
              :selected-node-id="selectedNodeId"
              @select="selectNode"
            />
          </div>
        </aside>
        <main class="market-shell__main">
          <div class="market-shell__content">
            <MarketBrowseView
              v-show="activeTab === 'browse'"
              :child-nodes="childNodesForSelection"
              :descendant-asset-nodes="descendantAssetNodes"
              :selected-node="selectedNode"
              :selected-detail-mint="selectedDetailMint"
              :breadcrumb-path="selectedNode?.path ?? []"
              :select-node="selectNode"
              :select-node-by-breadcrumb-index="selectNodeByBreadcrumbIndex"
              :set-selected-detail-mint="setSelectedDetailMint"
              :create-disabled="createDisabled"
              @open-create-trade="openCreateTradeModal"
            />
            <MarketOpenTradesView
              v-show="activeTab === 'open-trades'"
              :tab-active="activeTab === 'open-trades'"
              :create-disabled="createDisabled"
              @open-create-trade="openCreateTradeModalFromMyTrades"
            />
          </div>
        </main>
      </div>
      <EscrowDetailModal
        v-if="escrowId"
        :key="escrowId"
        :model-value="escrowModalOpen"
        :escrow-id="escrowId"
        :fill-disabled="marketplaceDeactivating"
        @update:model-value="onEscrowModalClose"
      />
      <Teleport to="body">
        <div v-if="offerRequestChoiceOpen" class="create-trade-modal-overlay" @click.self="offerRequestChoiceOpen = false">
          <div class="create-trade-modal create-trade-modal--choice" @click.stop>
            <div class="create-trade-modal__header">
              <h3>Create trade with this asset</h3>
              <button type="button" class="create-trade-modal__close" aria-label="Close" @click="offerRequestChoiceOpen = false">
                <Icon icon="lucide:x" />
              </button>
            </div>
            <p class="create-trade-modal__choice-hint">Start as offer (you give this) or request (you want this)?</p>
            <div class="create-trade-modal__choice-actions">
              <button type="button" class="create-trade-modal__choice-btn" @click="startCreateAsOffer">
                Offer (from wallet)
              </button>
              <button type="button" class="create-trade-modal__choice-btn" @click="startCreateAsRequest">
                Request (what you want)
              </button>
            </div>
          </div>
        </div>
        <div v-if="createTradeModalOpen" class="create-trade-modal-overlay" @click.self="createTradeModalOpen = false">
          <div class="create-trade-modal" @click.stop>
            <div class="create-trade-modal__header">
              <h3>Create trade</h3>
              <button type="button" class="create-trade-modal__close" aria-label="Close" @click="createTradeModalOpen = false">
                <Icon icon="lucide:x" />
              </button>
            </div>
            <CreateTradeForm
              :initial-offer-mint="createInitialOfferMint"
              :initial-offer-type="createInitialOfferType"
              :initial-request-mint="createInitialRequestMint"
              @success="onCreateTradeSuccess"
            />
          </div>
        </div>
      </Teleport>
      <template #fallback>
        <div class="marketplace__loading">Loading...</div>
      </template>
    </ClientOnly>
  </PageSection>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { getModuleState, isModuleVisibleToMembers } from '@decentraguild/core'
import { useTenantStore } from '~/stores/tenant'
import { useMarketplaceScope } from '~/composables/marketplace/useMarketplaceScope'
import { useMarketplaceTree } from '~/composables/marketplace/useMarketplaceTree'
import { useMintLabels } from '~/composables/mint/useMintLabels'
import { FEATURES } from '~/config/feature-flags'
import { Icon } from '@iconify/vue'

const MarketTree = defineAsyncComponent(() => import('~/modules/marketplace/components/MarketTree.vue'))
const MarketBrowseView = defineAsyncComponent(() => import('~/modules/marketplace/components/MarketBrowseView.vue'))
const MarketOpenTradesView = defineAsyncComponent(() => import('~/modules/marketplace/components/MarketOpenTradesView.vue'))
import EscrowDetailModal from '~/modules/marketplace/components/EscrowDetailModal.vue'
const CreateTradeForm = defineAsyncComponent(() => import('~/modules/marketplace/components/CreateTradeForm.vue'))

definePageMeta({ layout: 'default' })

const route = useRoute()
const router = useRouter()
const tenantStore = useTenantStore()
const { slug: _slug, marketplaceSettings } = storeToRefs(tenantStore)

const tenant = computed(() => tenantStore.tenant)
const marketplaceState = computed(() => getModuleState(tenant.value?.modules?.marketplace))
const marketplaceActive = computed(() => isModuleVisibleToMembers(marketplaceState.value))
const marketplaceDeactivating = computed(() => marketplaceState.value === 'deactivating')
/** Create trade disabled when: (1) global feature flag off, or (2) this dGuild's marketplace is deactivating (e.g. after paid period ends). Module state comes from tenant context (API). */
const createDisabled = computed(() => !FEATURES.marketplace.createTrade || marketplaceDeactivating.value)
const activeTab = computed(() => (route.query.tab === 'open-trades' ? 'open-trades' : 'browse'))

const { entries, mintsSet, fetchScope } = useMarketplaceScope()
const { labelByMint } = useMintLabels(mintsSet)
const {
  tree,
  selectedNodeId,
  selectedNode,
  childNodesForSelection,
  descendantAssetNodes,
  selectedDetailMint,
  selectNode,
  selectNodeByBreadcrumbIndex,
  setSelectedDetailMint,
} = useMarketplaceTree(entries, marketplaceSettings, labelByMint)

onMounted(() => {
  fetchScope()
})

watch(
  selectedNode,
  (node) => {
    if (node?.kind === 'asset' && node.mint && node.mint !== node.collectionMint) {
      setSelectedDetailMint(node.mint)
    }
  },
  { immediate: true }
)

const treeSidebarOpen = ref(false)
const createTradeModalOpen = ref(false)
const offerRequestChoiceOpen = ref(false)
const createInitialOfferMint = ref<string | null>(null)
const createInitialRequestMint = ref<string | null>(null)
const createInitialOfferType = ref<string | null>(null)

const selectedAssetType = computed(() => {
  const node = selectedNode.value
  if (!node?.mint) return null
  if (node.collectionMint && node.mint === node.collectionMint) return 'NFT_COLLECTION'
  const settings = marketplaceSettings.value
  if (!settings) return null
  if (settings.currencyMints?.some((c) => c.mint === node.mint)) return 'CURRENCY'
  if (settings.splAssetMints?.some((s) => s.mint === node.mint)) return 'SPL_ASSET'
  return null
})

function openCreateTradeModal(skipOfferRequestChoice = false) {
  if (createDisabled.value) return
  if (!skipOfferRequestChoice && selectedDetailMint.value) {
    offerRequestChoiceOpen.value = true
  } else {
    createInitialOfferMint.value = null
    createInitialRequestMint.value = null
    createInitialOfferType.value = null
    createTradeModalOpen.value = true
  }
}

function openCreateTradeModalFromMyTrades() {
  openCreateTradeModal(true)
}

function startCreateAsOffer() {
  createInitialOfferMint.value = selectedDetailMint.value
  createInitialRequestMint.value = null
  createInitialOfferType.value = selectedAssetType.value
  offerRequestChoiceOpen.value = false
  createTradeModalOpen.value = true
}

function startCreateAsRequest() {
  createInitialOfferMint.value = null
  createInitialRequestMint.value = selectedDetailMint.value
  createInitialOfferType.value = null
  offerRequestChoiceOpen.value = false
  createTradeModalOpen.value = true
}

function onCreateTradeSuccess() {
  createTradeModalOpen.value = false
}

const escrowId = computed(() => (route.query.escrow as string) ?? null)
const escrowModalOpen = computed(() => Boolean(escrowId.value))

function onEscrowModalClose() {
  const q = { ...route.query }
  delete q.escrow
  router.replace({ path: '/market', query: q })
}

</script>

<style scoped>
.market-shell-inactive {
  padding: var(--theme-space-lg);
  color: var(--theme-text-muted);
}

.market-shell__banner {
  grid-column: 1 / -1;
  padding: var(--theme-space-md);
  background: var(--theme-surface-warning);
  border: var(--theme-border-thin) solid var(--theme-warning);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-primary);
  font-size: var(--theme-font-sm);
}

.market-shell {
  display: grid;
  grid-template-columns: 15rem 1fr;
  gap: var(--theme-space-lg);
  min-height: 24rem;
}

.market-shell--tree-collapsed {
  grid-template-columns: 2.75rem 1fr;
}

.market-shell--no-tree {
  grid-template-columns: 1fr;
}

@media (max-width: 768px) {
  .market-shell {
    grid-template-columns: 1fr;
  }
}

.market-shell__tree {
  position: relative;
  border-right: var(--theme-border-thin) solid var(--theme-border);
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.market-shell__tree-inner {
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.market-shell__tree-toolbar {
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
  margin-bottom: var(--theme-space-2xs);
}

.market-shell__tree-toggle,
.market-shell__tree-collapse {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--theme-space-xs);
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  color: var(--theme-text-secondary);
  cursor: pointer;
  font-size: 1.125rem;
}

.market-shell__tree-toggle {
  width: 100%;
}

.market-shell__tree-toggle:hover,
.market-shell__tree-collapse:hover {
  color: var(--theme-text-primary);
  border-color: var(--theme-primary);
}

@media (max-width: 768px) {
  .market-shell__tree {
    border-right: none;
    border-bottom: var(--theme-border-thin) solid var(--theme-border);
  }
}

.market-shell__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.create-trade-modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--theme-backdrop, rgba(0, 0, 0, 0.6));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.create-trade-modal {
  background: var(--theme-bg-card);
  color: var(--theme-text-primary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  max-width: min(90vw, 36rem);
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  padding: var(--theme-space-lg);
  box-shadow: var(--theme-shadow-card);
}

.create-trade-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--theme-space-md);
}

.create-trade-modal__header h3 {
  margin: 0;
  font-size: var(--theme-font-lg);
  font-weight: 600;
  color: var(--theme-text-primary);
}

.create-trade-modal__close {
  padding: var(--theme-space-xs);
  background: none;
  border: none;
  color: var(--theme-text-muted);
  cursor: pointer;
  font-size: 1.25rem;
}

.create-trade-modal__close:hover {
  color: var(--theme-text-primary);
}

.create-trade-modal__choice-hint {
  margin: 0 0 var(--theme-space-md);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary, #c8c8d1);
}

.create-trade-modal__choice-actions {
  display: flex;
  gap: var(--theme-space-md);
  flex-wrap: wrap;
}

.create-trade-modal__choice-btn {
  flex: 1;
  min-width: 10rem;
  padding: var(--theme-space-md) var(--theme-space-lg);
  font-size: var(--theme-font-sm);
  font-weight: 500;
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  color: var(--theme-text-primary);
  cursor: pointer;
}

.create-trade-modal__choice-btn:hover {
  border-color: var(--theme-primary);
  background: var(--theme-bg-primary);
}

.market-shell__content {
  flex: 1;
  min-height: 0;
}

.marketplace__loading {
  padding: var(--theme-space-lg);
  color: var(--theme-text-secondary);
}
</style>
