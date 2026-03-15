<template>
  <PageSection title="Watchtower">
    <div v-if="!watchtowerVisible" class="watchtower-page__inactive">
      <p>Watchtower is not enabled for this dGuild.</p>
    </div>

    <template v-else>
      <p class="watchtower-page__intro">
        View tracked mints, metadata, current holders, and snapshots.
      </p>

      <div v-if="loading" class="watchtower-page__loading">
        <Icon icon="lucide:loader-2" class="watchtower-page__spinner" />
        Loading...
      </div>

      <template v-else>
        <p v-if="fetchError" class="watchtower-page__error">
          {{ fetchError }}
          <button type="button" class="watchtower-page__retry" @click="retryFetch">
            Retry
          </button>
        </p>
        <p v-else-if="!entries.length" class="watchtower-page__empty">
          No mints configured yet. Add mints in Admin > Address Book and enable tracking in Admin > Watchtower.
        </p>

        <template v-else>
          <div class="watchtower-page__search-wrap">
            <input
              v-model="searchQuery"
              type="search"
              class="watchtower-page__search"
              placeholder="Search by name or address..."
              aria-label="Search mints"
            />
            <Icon icon="lucide:search" class="watchtower-page__search-icon" />
          </div>

          <section v-if="filteredSpl.length" class="watchtower-page__section">
            <h3 class="watchtower-page__section-title">SPL tokens</h3>
            <div class="watchtower-page__grid">
              <Card
                v-for="entry in filteredSpl"
                :key="entry.mint"
                class="watchtower-page__card watchtower-page__card--clickable"
                @click="openMint(entry)"
              >
                <div class="watchtower-page__card-thumb">
                  <img v-if="entry.image" :src="entry.image" :alt="entry.label ?? ''" class="watchtower-page__card-img" />
                  <span v-else class="watchtower-page__card-placeholder">
                    <Icon icon="lucide:circle-dollar-sign" />
                  </span>
                </div>
                <div class="watchtower-page__card-body">
                  <h4 class="watchtower-page__card-name">{{ entry.label ?? truncateAddress(entry.mint, 8, 6) }}</h4>
                  <code class="watchtower-page__card-addr">{{ truncateAddress(entry.mint, 8, 6) }}</code>
                  <TrackIndicators
                    :track-holders="entry.track_holders"
                    :track-snapshot="entry.track_snapshot"
                    :track-transactions="entry.track_transactions"
                  />
                </div>
                <Icon icon="lucide:chevron-right" class="watchtower-page__card-arrow" />
              </Card>
            </div>
          </section>

          <section v-if="filteredNfts.length" class="watchtower-page__section">
            <h3 class="watchtower-page__section-title">NFT collections</h3>
            <div class="watchtower-page__grid">
              <Card
                v-for="entry in filteredNfts"
                :key="entry.mint"
                class="watchtower-page__card watchtower-page__card--clickable"
                @click="openMint(entry)"
              >
                <div class="watchtower-page__card-thumb">
                  <img v-if="entry.image" :src="entry.image" :alt="entry.label ?? ''" class="watchtower-page__card-img" />
                  <span v-else class="watchtower-page__card-placeholder">
                    <Icon icon="lucide:image-off" />
                  </span>
                </div>
                <div class="watchtower-page__card-body">
                  <h4 class="watchtower-page__card-name">{{ entry.label ?? truncateAddress(entry.mint, 8, 6) }}</h4>
                  <code class="watchtower-page__card-addr">{{ truncateAddress(entry.mint, 8, 6) }}</code>
                  <TrackIndicators
                    :track-holders="entry.track_holders"
                    :track-snapshot="entry.track_snapshot"
                    :track-transactions="entry.track_transactions"
                  />
                </div>
                <Icon icon="lucide:chevron-right" class="watchtower-page__card-arrow" />
              </Card>
            </div>
          </section>

          <p v-if="!filteredSpl.length && !filteredNfts.length" class="watchtower-page__no-match">
            No mints match your search.
          </p>
        </template>
      </template>
    </template>

    <MintDetailModal
      v-model="detailOpen"
      :mint="selectedMint"
      :tenant-id="tenantStore.tenantId ?? ''"
    />
  </PageSection>
</template>

<script setup lang="ts">
import { truncateAddress } from '@decentraguild/display'
import { Icon } from '@iconify/vue'
import { Card } from '~/components/ui/card'
import { useTenantStore } from '~/stores/tenant'
import { useSupabase } from '~/composables/core/useSupabase'
import { isModuleVisibleToMembers } from '@decentraguild/core'
import MintDetailModal from '~/components/mint/MintDetailModal/index.vue'
import TrackIndicators from '~/components/mint/TrackIndicators.vue'

const tenantStore = useTenantStore()
const watchtowerVisible = computed(() =>
  isModuleVisibleToMembers(tenantStore.tenant?.modules?.watchtower?.state),
)

const loading = ref(true)
const fetchError = ref<string | null>(null)
const searchQuery = ref('')
interface CatalogEntry {
  id: number
  mint: string
  kind: string
  label: string | null
  name: string | null
  image: string | null
  track_holders: boolean
  track_snapshot: boolean
  track_transactions: boolean
}
const entries = ref<CatalogEntry[]>([])
const detailOpen = ref(false)
const selectedMint = ref<string | null>(null)

const filteredEntries = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return entries.value
  return entries.value.filter((e) => {
    const label = (e.label ?? '').toLowerCase()
    const name = (e.name ?? '').toLowerCase()
    const mint = e.mint.toLowerCase()
    return label.includes(q) || name.includes(q) || mint.includes(q)
  })
})

const filteredSpl = computed(() => filteredEntries.value.filter((e) => e.kind === 'SPL'))
const filteredNfts = computed(() => filteredEntries.value.filter((e) => e.kind === 'NFT'))

async function fetchCatalog() {
  const id = tenantStore.tenantId
  if (!id) {
    loading.value = false
    return
  }
  loading.value = true
  fetchError.value = null
  try {
    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('watchtower', {
      body: { action: 'catalog', tenantId: id },
    })
    if (error) throw error
    const body = data as { entries?: CatalogEntry[]; error?: string }
    if (body?.error) throw new Error(body.error)
    entries.value = body?.entries ?? []
  } catch (e) {
    entries.value = []
    fetchError.value = e instanceof Error ? e.message : 'Failed to load catalog'
  } finally {
    loading.value = false
  }
}

function retryFetch() {
  void fetchCatalog()
}

watch(() => tenantStore.tenantId, (id) => {
  if (id && watchtowerVisible.value) void fetchCatalog()
}, { immediate: true })

function openMint(entry: CatalogEntry) {
  selectedMint.value = entry.mint
  detailOpen.value = true
}


</script>

<style scoped>
.watchtower-page__inactive {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.watchtower-page__intro {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin-bottom: var(--theme-space-md);
  line-height: 1.5;
}

.watchtower-page__loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  color: var(--theme-text-muted);
  font-size: var(--theme-font-sm);
}

.watchtower-page__spinner {
  animation: watchtower-spin 1s linear infinite;
}

@keyframes watchtower-spin {
  to { transform: rotate(360deg); }
}

.watchtower-page__empty,
.watchtower-page__error {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.watchtower-page__error {
  color: var(--theme-status-error, #dc2626);
}

.watchtower-page__retry {
  margin-left: var(--theme-space-sm);
  padding: 2px 8px;
  font-size: var(--theme-font-xs);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  background: var(--theme-bg-primary);
  color: var(--theme-text-primary);
  cursor: pointer;
}

.watchtower-page__retry:hover {
  background: var(--theme-bg-muted);
}

.watchtower-page__search-wrap {
  position: relative;
  margin-bottom: var(--theme-space-lg);
}

.watchtower-page__search {
  width: 100%;
  max-width: 24rem;
  padding: var(--theme-space-sm) var(--theme-space-md) var(--theme-space-sm) 2.5rem;
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background: var(--theme-bg-primary);
  color: var(--theme-text-primary);
  font: inherit;
  font-size: var(--theme-font-sm);
  box-sizing: border-box;
}

.watchtower-page__search:focus {
  outline: none;
  border-color: var(--theme-primary);
}

.watchtower-page__search-icon {
  position: absolute;
  left: var(--theme-space-sm);
  top: 50%;
  transform: translateY(-50%);
  color: var(--theme-text-muted);
  font-size: 1.1rem;
  pointer-events: none;
}

.watchtower-page__section {
  margin-bottom: var(--theme-space-xl);
}

.watchtower-page__section-title {
  font-size: var(--theme-font-md);
  font-weight: 600;
  margin: 0 0 var(--theme-space-md);
  color: var(--theme-text-primary);
}

.watchtower-page__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
  gap: var(--theme-space-md);
}

.watchtower-page__card {
  display: flex;
  align-items: center;
  gap: var(--theme-space-md);
  padding: var(--theme-space-md);
}

.watchtower-page__card--clickable {
  cursor: pointer;
  transition: background-color 0.15s;
}

.watchtower-page__card--clickable:hover {
  background-color: var(--theme-bg-muted, #f3f4f6);
}

.watchtower-page__card-thumb {
  flex-shrink: 0;
  width: 3rem;
  height: 3rem;
  border-radius: var(--theme-radius-md);
  overflow: hidden;
  background: var(--theme-bg-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

.watchtower-page__card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.watchtower-page__card-placeholder {
  color: var(--theme-text-muted);
  font-size: 1.25rem;
}

.watchtower-page__card-body {
  flex: 1;
  min-width: 0;
}

.watchtower-page__card-name {
  font-size: var(--theme-font-md);
  font-weight: 600;
  margin: 0 0 var(--theme-space-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.watchtower-page__card-addr {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  display: block;
  margin-bottom: var(--theme-space-xs);
}

.watchtower-page__card-arrow {
  flex-shrink: 0;
  color: var(--theme-text-muted);
}

.watchtower-page__no-match {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}
</style>
