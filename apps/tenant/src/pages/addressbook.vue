<template>
  <PageSection title="Address Book">
    <p class="addressbook-page__intro">
      View metadata and holder snapshots for tokens and collections in this dGuild's address book.
    </p>

    <AdminMintCatalog
      :mints="catalogItems"
      :loading="loading"
      :readonly="true"
      @inspect="onInspect"
    />

    <p v-if="!loading && !entries.length" class="addressbook-page__empty">
      No entries in the address book yet.
    </p>

    <MintDetailModal
      v-model="detailOpen"
      :mint="selectedMint"
      :entry="selectedEntry"
    />
  </PageSection>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { PageSection } from '@decentraguild/ui/components'
import { API_V1 } from '~/utils/apiBase'
import type { AddressBookEntry, CatalogMintItem } from '~/types/mints'
import AdminMintCatalog from '~/components/AdminMintCatalog.vue'
import MintDetailModal from '~/components/MintDetailModal.vue'

const tenantId = computed(() => useTenantStore().tenantId)
const apiBase = useApiBase()

const entries = ref<AddressBookEntry[]>([])
const loading = ref(true)

const detailOpen = ref(false)
const selectedMint = ref<CatalogMintItem | null>(null)
const selectedEntry = ref<AddressBookEntry | null>(null)

const catalogItems = computed<CatalogMintItem[]>(() =>
  entries.value.map((e) => ({
    id: e.mint,
    mint: e.mint,
    kind: e.kind,
    label: e.name || e.label || e.mint,
    symbol: e.symbol ?? null,
    image: e.image ?? null,
  }))
)

function onInspect(item: CatalogMintItem) {
  selectedMint.value = item
  selectedEntry.value = entries.value.find((e) => e.mint === item.mint) ?? null
  detailOpen.value = true
}

async function fetchList() {
  loading.value = true
  try {
    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${tenantId.value}/addressbook/address-book`,
      { credentials: 'include' },
    )
    if (!res.ok) {
      entries.value = []
      return
    }
    const data = (await res.json()) as { entries: AddressBookEntry[] }
    entries.value = data.entries
  } catch {
    entries.value = []
  } finally {
    loading.value = false
  }
}

onMounted(fetchList)
</script>

<style scoped>
.addressbook-page__intro {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin-bottom: var(--theme-space-md);
  line-height: 1.5;
}

.addressbook-page__empty {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}
</style>
