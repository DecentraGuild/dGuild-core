<template>
  <div class="admin__panel">
    <Card>
      <h3>Address book</h3>
      <p class="addressbook-tab__hint">
        Add SPL tokens and NFT collections. Used to configure Marketplace, Discord, and Watchtower.
      </p>

      <div v-if="loading" class="addressbook-tab__loading">
        <Icon icon="lucide:loader-2" class="addressbook-tab__spinner" />
        Loading address book...
      </div>

      <template v-else>
        <MintAssetPicker
          :model-value="pickerValue"
          :show-tracking-tiers="false"
          :discord-mints="discordMintSet"
          :show-kind-selector="true"
          hint="Enter a mint address or pick from the address book to add it."
          @update:model-value="onPickerUpdate"
          @mint-added="onMintAdded"
          @mint-removed="onMintRemoved"
          @address-book-select="onAddressBookSelect"
          @inspect-collection="onInspectCollection"
          @inspect-spl="onInspectSpl"
          @error="onError"
        />

        <div v-if="saveError" class="addressbook-tab__error">{{ saveError }}</div>
      </template>
    </Card>

    <MintDetailModal v-model="showMintModal" :mint="selectedMint" :entry="selectedEntry" @saved="fetchAddressBook" />
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Card } from '~/components/ui/card'
import { useTenantCatalog } from '~/composables/watchtower/useTenantCatalog'
import MintAssetPicker from '~/components/mint/MintAssetPicker.vue'
import MintDetailModal from '~/components/mint/MintDetailModal/index.vue'
import type {
  MintAssetPickerValue,
  MintKind,
  AddressBookEntry,
  CollectionMint,
  SplAssetMint,
  CatalogMintItem,
} from '~/types/mints'

defineProps<{
  slug: string
}>()

const tenantId = computed(() => useTenantStore().tenantId)

const loading = ref(true)
const saveError = ref<string | null>(null)

const addressBook = ref<AddressBookEntry[]>([])
const pickerValue = ref<MintAssetPickerValue>({ spl: [], nfts: [] })
const showMintModal = ref(false)
const selectedMint = ref<CatalogMintItem | null>(null)
const selectedEntry = computed(() => {
  const m = selectedMint.value?.mint
  if (!m) return null
  return addressBook.value.find((e) => e.mint === m) ?? null
})

/** Set of mint addresses with track_holders=true in watchtower_watches. */
const discordMintSet = ref<Set<string>>(new Set())

const catalog = useTenantCatalog()

async function fetchAddressBook() {
  const id = tenantId.value
  if (!id) return
  loading.value = true
  try {
    const data = await catalog.list()
    const entries: AddressBookEntry[] = data.map((r) => ({
      id: r.id,
      mint: r.mint,
      kind: r.kind,
      tier: 'base' as const,
      label: r.label,
      image: r.image,
      name: r.name,
      shipment_banner_image: (r as { shipment_banner_image?: string | null }).shipment_banner_image ?? null,
    }))
    addressBook.value = entries

    const spl = data.filter((e) => e.kind === 'SPL').map((e) => ({ mint: e.mint, name: e.name ?? e.label ?? undefined, image: e.image ?? undefined }))
    const nfts = data.filter((e) => e.kind === 'NFT').map((e) => ({
      mint: e.mint,
      name: e.name ?? e.label ?? undefined,
      image: e.image ?? undefined,
      collectionSize: e.collectionSize,
      uniqueTraitCount: e.uniqueTraitCount,
    }))
    pickerValue.value = { spl, nfts }
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Failed to load address book'
  } finally {
    loading.value = false
  }
}

async function fetchDiscordMintSet() {
  const id = tenantId.value
  if (!id) return
  try {
    const supabase = useSupabase()
    const { data } = await supabase
      .from('watchtower_watches')
      .select('mint')
      .eq('tenant_id', id)
      .eq('track_holders', true)
    discordMintSet.value = new Set((data ?? []).map((r) => r.mint as string))
  } catch {
    discordMintSet.value = new Set()
  }
}

onMounted(() => {
  fetchAddressBook()
  fetchDiscordMintSet()
})

watch(addressBook, fetchDiscordMintSet)

async function apiAdd(mint: string, kind: MintKind, name?: string | null, image?: string | null) {
  saveError.value = null
  try {
    await catalog.add({ mint, kind, name, label: name, image })
    await fetchAddressBook()
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Failed to add mint'
  }
}

async function apiRemove(mint: string) {
  try {
    await catalog.remove(mint)
    addressBook.value = addressBook.value.filter((e) => e.mint !== mint)
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Failed to remove mint'
  }
}

function onPickerUpdate(value: MintAssetPickerValue) {
  pickerValue.value = value
}

function onMintAdded(mint: string, kind: MintKind) {
  const item = kind === 'SPL'
    ? pickerValue.value.spl.find((s) => s.mint === mint)
    : pickerValue.value.nfts.find((n) => n.mint === mint)
  apiAdd(mint, kind, item?.name ?? null, (item as { image?: string | null })?.image ?? null)
}

async function onAddressBookSelect(mint: string, entry: AddressBookEntry) {
  await apiAdd(mint, entry.kind, entry.name ?? entry.label ?? null, entry.image ?? null)
  await fetchAddressBook()
}

function onMintRemoved(mint: string, _kind: MintKind) {
  apiRemove(mint)
}

function onInspectCollection(collection: Record<string, unknown>) {
  const c = collection as CollectionMint
  const entry = addressBook.value.find((e) => e.mint === c.mint)
  selectedMint.value = {
    id: c.mint,
    mint: c.mint,
    kind: 'NFT',
    label: c.name || c.mint,
    image: c.image ?? null,
    sellerFeeBasisPoints: c.sellerFeeBasisPoints ?? null,
    traitTypes: c.traitTypes ?? null,
    shipment_banner_image: entry?.shipment_banner_image ?? null,
  }
  showMintModal.value = true
}

function onInspectSpl(spl: SplAssetMint) {
  const entry = addressBook.value.find((e) => e.mint === spl.mint)
  selectedMint.value = {
    id: spl.mint,
    mint: spl.mint,
    kind: 'SPL',
    label: spl.name || spl.symbol || spl.mint,
    image: spl.image ?? null,
    symbol: spl.symbol ?? null,
    decimals: spl.decimals ?? null,
    sellerFeeBasisPoints: spl.sellerFeeBasisPoints ?? null,
    shipment_banner_image: entry?.shipment_banner_image ?? null,
  }
  showMintModal.value = true
}

function onError(msg: string) {
  saveError.value = msg
}
</script>

<style scoped>
.addressbook-tab__hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin-bottom: var(--theme-space-md);
}

.addressbook-tab__loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  color: var(--theme-text-muted);
  font-size: var(--theme-font-sm);
}

.addressbook-tab__spinner {
  animation: addressbook-spin 1s linear infinite;
}

@keyframes addressbook-spin {
  to { transform: rotate(360deg); }
}

.addressbook-tab__error {
  margin-top: var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}
</style>
