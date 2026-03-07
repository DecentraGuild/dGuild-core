<template>
  <Teleport to="body">
    <div v-if="modelValue && mint" class="mint-modal" @click.self="close">
      <div class="mint-modal__panel" :class="{ 'mint-modal__panel--wide': mint.kind === 'NFT' }">

        <div class="mint-modal__header">
          <div class="mint-modal__header-identity">
            <div class="mint-modal__thumb">
              <img v-if="mint.image" :src="mint.image" :alt="mint.label" class="mint-modal__thumb-img" />
              <span v-else class="mint-modal__thumb-placeholder">
                <Icon :icon="mint.kind === 'NFT' ? 'mdi:image-off' : 'mdi:token'" />
              </span>
            </div>
            <div class="mint-modal__header-text">
              <h3 class="mint-modal__title">{{ mint.label }}</h3>
              <div class="mint-modal__header-badges">
                <span class="mint-modal__kind-badge">{{ mint.kind === 'SPL' ? 'SPL Token' : 'NFT Collection' }}</span>
                <span v-if="mint.symbol" class="mint-modal__symbol">{{ mint.symbol }}</span>
              </div>
            </div>
          </div>
          <div class="mint-modal__header-controls">
            <button
              type="button"
              class="mint-modal__icon-btn"
              :title="showJson ? 'Show fields' : 'Show JSON'"
              @click="showJson = !showJson"
            >
              <Icon :icon="showJson ? 'mdi:format-list-bulleted' : 'mdi:code-json'" />
            </button>
            <button type="button" class="mint-modal__close" aria-label="Close" @click="close">
              <Icon icon="mdi:close" />
            </button>
          </div>
        </div>

        <div class="mint-modal__body">

          <!-- JSON view -->
          <section v-if="showJson" class="mint-modal__section">
            <pre class="mint-modal__json">{{ jsonPreview }}</pre>
          </section>

          <!-- Fields view -->
          <template v-else>

            <!-- Core metadata -->
            <section class="mint-modal__section">
              <dl class="mint-modal__fields">

                <div class="mint-modal__field mint-modal__field--address">
                  <dt class="mint-modal__field-label">Mint</dt>
                  <dd class="mint-modal__field-value">
                    <code class="mint-modal__mono">{{ mint.mint }}</code>
                    <div class="mint-modal__field-actions">
                      <button
                        type="button"
                        class="mint-modal__icon-btn"
                        :class="{ 'mint-modal__icon-btn--success': copied }"
                        :title="copied ? 'Copied!' : 'Copy address'"
                        @click="copyMint"
                      >
                        <Icon :icon="copied ? 'mdi:check' : 'mdi:content-copy'" />
                      </button>
                      <a
                        :href="explorerLinks.tokenUrl(mint.mint)"
                        target="_blank"
                        rel="noopener"
                        class="mint-modal__icon-btn"
                        title="View on Solscan"
                      >
                        <Icon icon="mdi:open-in-new" />
                      </a>
                    </div>
                  </dd>
                </div>

                <div v-if="mint.symbol" class="mint-modal__field">
                  <dt class="mint-modal__field-label">Symbol</dt>
                  <dd class="mint-modal__field-value">{{ mint.symbol }}</dd>
                </div>

                <div v-if="mint.decimals != null" class="mint-modal__field">
                  <dt class="mint-modal__field-label">Decimals</dt>
                  <dd class="mint-modal__field-value">{{ mint.decimals }}</dd>
                </div>

                <div v-if="mint.sellerFeeBasisPoints != null" class="mint-modal__field">
                  <dt class="mint-modal__field-label">Seller fee</dt>
                  <dd class="mint-modal__field-value">
                    {{ (mint.sellerFeeBasisPoints / 100).toFixed(2) }}%
                    <span class="mint-modal__field-muted">({{ mint.sellerFeeBasisPoints }} bps)</span>
                  </dd>
                </div>

                <div v-if="entry" class="mint-modal__field">
                  <dt class="mint-modal__field-label">Tier</dt>
                  <dd class="mint-modal__field-value">
                    <span class="mint-modal__tier-badge" :class="`mint-modal__tier-badge--${entry.tier}`">
                      {{ entry.tier }}
                    </span>
                  </dd>
                </div>

                <div v-if="entry?.createdAt" class="mint-modal__field">
                  <dt class="mint-modal__field-label">Added</dt>
                  <dd class="mint-modal__field-value mint-modal__field-muted">{{ formatDate(entry.createdAt) }}</dd>
                </div>

              </dl>
            </section>

            <!-- NFT: trait types -->
            <section v-if="mint.kind === 'NFT' && (mint.traitTypes?.length ?? 0) > 0" class="mint-modal__section mint-modal__section--bordered">
              <h4 class="mint-modal__section-title">Trait types</h4>
              <div class="mint-modal__trait-pills">
                <span v-for="t in mint.traitTypes" :key="t" class="mint-modal__trait-pill">{{ t }}</span>
              </div>
            </section>

            <!-- NFT: member NFTs -->
            <section v-if="mint.kind === 'NFT'" class="mint-modal__section mint-modal__section--bordered">
              <h4 class="mint-modal__section-title">Member NFTs</h4>
              <div v-if="assetsLoading" class="mint-modal__loading">
                <Icon icon="mdi:loading" class="mint-modal__spinner" />
                Loading NFTs...
              </div>
              <div v-else-if="assets.length === 0" class="mint-modal__empty">
                No NFTs in scope. Save the collection and expand to populate.
              </div>
              <div v-else class="mint-modal__nft-grid">
                <div v-for="nft in assets" :key="nft.mint" class="mint-modal__nft-card">
                  <div class="mint-modal__nft-media">
                    <img v-if="nft.metadata?.image" :src="nft.metadata.image" :alt="nft.metadata.name ?? nft.mint" />
                    <div v-else class="mint-modal__nft-placeholder">
                      <Icon icon="mdi:image-off" />
                    </div>
                  </div>
                  <div class="mint-modal__nft-info">
                    <p class="mint-modal__nft-name">{{ nft.metadata?.name ?? truncateAddress(nft.mint) }}</p>
                    <p class="mint-modal__nft-mint">{{ truncateAddress(nft.mint, 6, 6) }}</p>
                    <div v-if="(nft.metadata?.traits?.length ?? 0) > 0" class="mint-modal__nft-traits">
                      <span
                        v-for="(attr, idx) in (nft.metadata?.traits ?? []).slice(0, 2)"
                        :key="idx"
                        class="mint-modal__nft-trait"
                      >
                        {{ attr.trait_type }}: {{ attr.value }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- Address Book: snapshots (grow / pro) -->
            <section v-if="entry && entry.tier !== 'base'" class="mint-modal__section mint-modal__section--bordered">
              <h4 class="mint-modal__section-title">Daily snapshots</h4>
              <div v-if="snapshotsLoading" class="mint-modal__loading">
                <Icon icon="mdi:loading" class="mint-modal__spinner" />
              </div>
              <ul v-else-if="snapshots.length" class="mint-modal__snapshot-list">
                <li v-for="s in snapshots" :key="s.date" class="mint-modal__snapshot-item">
                  <button
                    type="button"
                    class="mint-modal__snapshot-row"
                    @click="selectSnapshotDate(s.date)"
                  >
                    <span>{{ s.date }}</span>
                    <span class="mint-modal__snapshot-count">{{ s.holderCount }} holders</span>
                    <Icon :icon="selectedSnapshotDate === s.date ? 'mdi:chevron-down' : 'mdi:chevron-right'" />
                  </button>
                  <div v-if="selectedSnapshotDate === s.date" class="mint-modal__wallets">
                    <p v-if="walletsLoading" class="mint-modal__loading">
                      <Icon icon="mdi:loading" class="mint-modal__spinner" /> Loading...
                    </p>
                    <ul v-else-if="holderWallets.length" class="mint-modal__wallet-list">
                      <li v-for="w in holderWallets.slice(0, 50)" :key="w" class="mint-modal__wallet-item">{{ w }}</li>
                      <li v-if="holderWallets.length > 50" class="mint-modal__wallet-more">
                        + {{ holderWallets.length - 50 }} more
                      </li>
                    </ul>
                    <p v-else class="mint-modal__muted">No holders recorded.</p>
                  </div>
                </li>
              </ul>
              <p v-else class="mint-modal__muted">No snapshots yet.</p>
            </section>

            <!-- Address Book: Pro tier -->
            <section v-if="entry?.tier === 'pro'" class="mint-modal__section mint-modal__section--bordered">
              <h4 class="mint-modal__section-title">Transaction data</h4>
              <p class="mint-modal__muted">Live transaction tracking (Pro) coming soon.</p>
            </section>

          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { truncateAddress } from '@decentraguild/display'
import { useMarketplaceAssets } from '~/composables/useMarketplaceAssets'
import { useExplorerLinks } from '~/composables/useExplorerLinks'
import { API_V1 } from '~/utils/apiBase'
import type { CatalogMintItem, AddressBookEntry } from '~/types/mints'

const props = defineProps<{
  modelValue: boolean
  mint: CatalogMintItem | null
  entry?: AddressBookEntry | null
}>()

const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

function close() {
  emit('update:modelValue', false)
}

const tenantStore = useTenantStore()
const apiBase = useApiBase()
const explorerLinks = useExplorerLinks()

const showJson = ref(false)
const copied = ref(false)

function copyMint() {
  if (!props.mint) return
  navigator.clipboard.writeText(props.mint.mint).then(() => {
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  })
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
  } catch {
    return iso
  }
}

const jsonPreview = computed(() => {
  if (!props.mint) return ''
  const m = props.mint
  const data: Record<string, unknown> = { mint: m.mint, kind: m.kind, label: m.label }
  if (m.symbol != null) data.symbol = m.symbol
  if (m.image != null) data.image = m.image
  if (m.decimals != null) data.decimals = m.decimals
  if (m.sellerFeeBasisPoints != null) data.sellerFeeBasisPoints = m.sellerFeeBasisPoints
  if (m.traitTypes?.length) data.traitTypes = m.traitTypes
  if (props.entry) {
    data.tier = props.entry.tier
    if (props.entry.trait_options) data.traitOptions = props.entry.trait_options
    if (props.entry.createdAt) data.createdAt = props.entry.createdAt
  }
  return JSON.stringify(data, null, 2)
})

// NFT member NFTs
const nftMint = computed(() =>
  props.modelValue && props.mint?.kind === 'NFT' ? props.mint.mint : null
)
const { assets, loading: assetsLoading } = useMarketplaceAssets({
  slug: computed(() => tenantStore.slug),
  collection: nftMint,
  limit: 500,
})

// Snapshots (address book grow / pro)
const snapshots = ref<{ date: string; holderCount: number }[]>([])
const snapshotsLoading = ref(false)
const selectedSnapshotDate = ref<string | null>(null)
const holderWallets = ref<string[]>([])
const walletsLoading = ref(false)

async function fetchSnapshots() {
  if (!props.entry || !props.mint || props.entry.tier === 'base') return
  snapshotsLoading.value = true
  snapshots.value = []
  selectedSnapshotDate.value = null
  holderWallets.value = []
  try {
    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${tenantStore.tenantId}/addressbook/snapshots/${encodeURIComponent(props.mint.mint)}`,
      { credentials: 'include' },
    )
    if (res.ok) {
      const data = (await res.json()) as { snapshots: { date: string; holderCount: number }[] }
      snapshots.value = data.snapshots ?? []
    }
  } catch {
    snapshots.value = []
  } finally {
    snapshotsLoading.value = false
  }
}

async function selectSnapshotDate(date: string) {
  if (selectedSnapshotDate.value === date) {
    selectedSnapshotDate.value = null
    holderWallets.value = []
    return
  }
  selectedSnapshotDate.value = date
  walletsLoading.value = true
  try {
    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${tenantStore.tenantId}/addressbook/snapshots/${encodeURIComponent(props.mint!.mint)}/${encodeURIComponent(date)}`,
      { credentials: 'include' },
    )
    if (res.ok) {
      const data = (await res.json()) as { holderWallets: string[] }
      holderWallets.value = data.holderWallets ?? []
    } else {
      holderWallets.value = []
    }
  } catch {
    holderWallets.value = []
  } finally {
    walletsLoading.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      showJson.value = false
      fetchSnapshots()
    } else {
      snapshots.value = []
      selectedSnapshotDate.value = null
      holderWallets.value = []
    }
  },
)

watch(
  () => props.mint?.mint,
  () => {
    if (props.modelValue) fetchSnapshots()
  },
)
</script>

<style scoped>
.mint-modal {
  position: fixed;
  inset: 0;
  background: var(--theme-backdrop, rgba(0, 0, 0, 0.6));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
  padding: var(--theme-space-lg);
}

.mint-modal__panel {
  background: var(--theme-bg-primary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  max-width: min(95vw, 30rem);
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--theme-shadow-card);
}

.mint-modal__panel--wide {
  max-width: min(95vw, 56rem);
}

/* Header */
.mint-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--theme-space-md);
  padding: var(--theme-space-md) var(--theme-space-lg);
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
  flex-shrink: 0;
}

.mint-modal__header-identity {
  display: flex;
  align-items: center;
  gap: var(--theme-space-md);
  min-width: 0;
}

.mint-modal__thumb {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: var(--theme-radius-md);
  overflow: hidden;
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
}

.mint-modal__thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mint-modal__thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--theme-text-muted);
  font-size: 1.75rem;
}

.mint-modal__header-text {
  min-width: 0;
}

.mint-modal__title {
  margin: 0 0 var(--theme-space-xs);
  font-size: var(--theme-font-lg);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mint-modal__header-badges {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  flex-wrap: wrap;
}

.mint-modal__kind-badge {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--theme-space-xs);
  border-radius: var(--theme-radius-full);
  border: var(--theme-border-thin) solid var(--theme-border);
  font-size: var(--theme-font-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--theme-text-muted);
}

.mint-modal__symbol {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  font-weight: 500;
}

.mint-modal__header-controls {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  flex-shrink: 0;
}

/* Shared icon button */
.mint-modal__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  background: none;
  border: none;
  color: var(--theme-text-secondary);
  cursor: pointer;
  border-radius: var(--theme-radius-sm);
  text-decoration: none;
  font-size: 1rem;
  transition: color 0.12s, background 0.12s;
}

.mint-modal__icon-btn:hover {
  color: var(--theme-text-primary);
  background: var(--theme-bg-secondary);
}

.mint-modal__icon-btn--success {
  color: var(--theme-success);
}

.mint-modal__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  background: none;
  border: none;
  color: var(--theme-text-secondary);
  cursor: pointer;
  border-radius: var(--theme-radius-sm);
  font-size: 1rem;
  transition: color 0.12s, background 0.12s;
}

.mint-modal__close:hover {
  color: var(--theme-text-primary);
  background: var(--theme-bg-secondary);
}

/* Body */
.mint-modal__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.mint-modal__section {
  padding: var(--theme-space-md) var(--theme-space-lg);
  flex-shrink: 0;
}

.mint-modal__section--bordered {
  border-top: var(--theme-border-thin) solid var(--theme-border);
}

.mint-modal__section-title {
  margin: 0 0 var(--theme-space-sm);
  font-size: var(--theme-font-xs);
  font-weight: 600;
  color: var(--theme-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Fields */
.mint-modal__fields {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
}

.mint-modal__field {
  display: grid;
  grid-template-columns: 6rem 1fr;
  align-items: start;
  gap: var(--theme-space-sm);
  padding: var(--theme-space-xs) 0;
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.mint-modal__field:last-child {
  border-bottom: none;
}

.mint-modal__field--address {
  align-items: center;
}

.mint-modal__field-label {
  font-size: var(--theme-font-xs);
  font-weight: 600;
  color: var(--theme-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding-top: 2px;
}

.mint-modal__field-value {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--theme-space-xs);
  font-size: var(--theme-font-sm);
  min-width: 0;
  margin: 0;
}

.mint-modal__field-muted {
  color: var(--theme-text-muted);
  font-size: var(--theme-font-xs);
}

.mint-modal__field-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.mint-modal__mono {
  font-family: var(--theme-font-mono, monospace);
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
  background: var(--theme-bg-secondary);
  padding: 2px 6px;
  border-radius: var(--theme-radius-sm);
  word-break: break-all;
}

/* Tier badge */
.mint-modal__tier-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: var(--theme-radius-full);
  font-size: var(--theme-font-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border: var(--theme-border-thin) solid transparent;
}

.mint-modal__tier-badge--base {
  background: var(--theme-bg-secondary);
  color: var(--theme-text-muted);
  border-color: var(--theme-border);
}

.mint-modal__tier-badge--grow {
  background: color-mix(in srgb, var(--theme-primary) 12%, transparent);
  color: var(--theme-primary);
  border-color: color-mix(in srgb, var(--theme-primary) 30%, transparent);
}

.mint-modal__tier-badge--pro {
  background: color-mix(in srgb, var(--theme-warning) 12%, transparent);
  color: var(--theme-warning);
  border-color: color-mix(in srgb, var(--theme-warning) 30%, transparent);
}

/* JSON view */
.mint-modal__json {
  margin: 0;
  font-family: var(--theme-font-mono, monospace);
  font-size: var(--theme-font-xs);
  line-height: 1.6;
  color: var(--theme-text-secondary);
  background: var(--theme-bg-secondary);
  padding: var(--theme-space-md);
  border-radius: var(--theme-radius-md);
  overflow-x: auto;
  white-space: pre;
}

/* Trait pills */
.mint-modal__trait-pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-xs);
}

.mint-modal__trait-pill {
  font-size: var(--theme-font-xs);
  padding: 2px 8px;
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-secondary);
}

/* Loading / empty */
.mint-modal__loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  color: var(--theme-text-muted);
  font-size: var(--theme-font-sm);
}

.mint-modal__spinner {
  animation: mint-modal-spin 0.8s linear infinite;
}

@keyframes mint-modal-spin {
  to { transform: rotate(360deg); }
}

.mint-modal__empty,
.mint-modal__muted {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin: 0;
}

/* NFT grid */
.mint-modal__nft-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: var(--theme-space-md);
}

.mint-modal__nft-card {
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  overflow: hidden;
}

.mint-modal__nft-media {
  aspect-ratio: 1;
  background: var(--theme-bg-primary);
}

.mint-modal__nft-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mint-modal__nft-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--theme-text-muted);
  font-size: 2rem;
}

.mint-modal__nft-info {
  padding: var(--theme-space-sm);
}

.mint-modal__nft-name {
  margin: 0 0 2px;
  font-size: var(--theme-font-xs);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mint-modal__nft-mint {
  margin: 0 0 var(--theme-space-xs);
  font-size: 10px;
  font-family: var(--theme-font-mono, monospace);
  color: var(--theme-text-muted);
}

.mint-modal__nft-traits {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.mint-modal__nft-trait {
  font-size: 9px;
  padding: 1px 4px;
  background: var(--theme-bg-primary);
  border-radius: 2px;
  color: var(--theme-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* Snapshots */
.mint-modal__snapshot-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.mint-modal__snapshot-item {
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.mint-modal__snapshot-item:last-child {
  border-bottom: none;
}

.mint-modal__snapshot-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  width: 100%;
  padding: var(--theme-space-xs) 0;
  text-align: left;
  background: none;
  border: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.mint-modal__snapshot-row:hover {
  color: var(--theme-text-primary);
}

.mint-modal__snapshot-count {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  margin-left: auto;
}

.mint-modal__wallets {
  padding: var(--theme-space-sm) 0 var(--theme-space-sm) var(--theme-space-md);
}

.mint-modal__wallet-list {
  list-style: none;
  padding: 0;
  margin: 0;
  font-family: var(--theme-font-mono, monospace);
  font-size: var(--theme-font-xs);
}

.mint-modal__wallet-item {
  padding: 2px 0;
}

.mint-modal__wallet-more {
  color: var(--theme-text-muted);
  margin-top: var(--theme-space-xs);
  font-size: var(--theme-font-xs);
}
</style>
