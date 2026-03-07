<template>
  <Card class="discord-mint-catalog">
    <h3 class="discord-mint-catalog__title">
      Mint catalog
      <span v-if="!catalogLoading && catalogMints.length" class="discord-mint-catalog__count">({{ catalogMints.length }})</span>
    </h3>
    <p class="discord-mint-catalog__hint">
      Configure SPL tokens and NFT collections used in Discord role rules.
      Define them here, then pick from dropdowns when creating rules.
      Holders are synced every 15 min–6 hr depending on collection size.
    </p>

    <AdminMintCatalog
      :mints="catalogItems"
      :loading="catalogLoading"
      :pending-ids="deletePending"
      @inspect="onInspect"
      @delete="onDelete"
    >
      <template #item-extra="{ item }">
        <Button
          v-if="item.kind === 'NFT' && !item.traitKeys?.length"
          variant="ghost"
          size="small"
          :disabled="refreshTraitsPending[item.id as number]"
          title="Fetch collection traits for rule dropdowns"
          @click.stop="onRefreshTraits(item.id as number)"
        >
          <Icon v-if="refreshTraitsPending[item.id as number]" icon="mdi:loading" class="discord-mint-catalog__btn-spin" />
          <Icon v-else icon="mdi:refresh" />
          <span class="discord-mint-catalog__action-label">Load traits</span>
        </Button>
      </template>

      <template #add>
        <h4 class="discord-mint-catalog__add-title">Add mint</h4>
        <AddMintInput
          v-model="newMint"
          v-model:kind="newKind"
          :error="createError"
          :loading="creating"
          @submit="onCreateSubmit"
        />
      </template>
    </AdminMintCatalog>

    <MintDetailModal v-model="showModal" :mint="selectedMint" />
  </Card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { API_V1 } from '~/utils/apiBase'
import { Card, Button } from '@decentraguild/ui/components'
import { Icon } from '@iconify/vue'
import type { CatalogMint, CatalogMintItem } from '~/types/mints'
import AdminMintCatalog from '~/components/AdminMintCatalog.vue'
import MintDetailModal from '~/components/MintDetailModal.vue'
import AddMintInput from '~/components/AddMintInput.vue'

export type { CatalogMint }

const props = defineProps<{
  slug: string
  catalogMints: CatalogMint[]
  catalogLoading: boolean
}>()
const emit = defineEmits<{ 'mints-changed': [] }>()
const tenantId = computed(() => useTenantStore().tenantId)
const apiBase = useApiBase()

const creating = ref(false)
const createError = ref<string | null>(null)
const newMint = ref('')
const newKind = ref<'auto' | 'SPL' | 'NFT'>('auto')
const deletePending = ref<Record<number, boolean>>({})
const refreshTraitsPending = ref<Record<number, boolean>>({})

const showModal = ref(false)
const selectedMint = ref<CatalogMintItem | null>(null)

const catalogItems = computed<CatalogMintItem[]>(() =>
  props.catalogMints.map((m) => ({
    id: m.id,
    mint: m.asset_id,
    kind: m.kind,
    label: m.label,
    symbol: m.symbol,
    image: m.image,
    decimals: m.decimals,
    traitKeys: m.trait_keys,
    traitTypes: m.trait_keys,
  }))
)

function onInspect(item: CatalogMintItem) {
  selectedMint.value = item
  showModal.value = true
}

async function onRefreshTraits(id: number) {
  refreshTraitsPending.value = { ...refreshTraitsPending.value, [id]: true }
  createError.value = null
  try {
    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${tenantId.value}/discord/mints/${id}/refresh-traits`,
      { method: 'PATCH', credentials: 'include' }
    )
    const data = (await res.json().catch(() => ({}))) as { error?: string } & CatalogMint
    if (!res.ok) {
      createError.value = data.error ?? `Failed to load traits (${res.status})`
      return
    }
    emit('mints-changed')
  } finally {
    refreshTraitsPending.value = { ...refreshTraitsPending.value, [id]: false }
  }
}

async function onCreateSubmit(mint: string, kind: 'auto' | 'SPL' | 'NFT') {
  const asset = mint.trim()
  if (!asset || asset.length < 32) return
  creating.value = true
  createError.value = null
  try {
    const body: Record<string, unknown> = { asset_id: asset }
    if (kind !== 'auto') {
      body.kind = kind
    }
    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${tenantId.value}/discord/mints`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      }
    )
    const data = (await res.json().catch(() => ({}))) as
      | (CatalogMint & { error?: string })
      | { error?: string }
    if (!res.ok) {
      createError.value =
        (data as { error?: string }).error ??
        `Failed to add mint (${res.status})`
      return
    }
    newMint.value = ''
    newKind.value = 'auto'
    emit('mints-changed')
  } finally {
    creating.value = false
  }
}

async function onDelete(item: CatalogMintItem) {
  const id = item.id as number
  deletePending.value = { ...deletePending.value, [id]: true }
  createError.value = null
  try {
    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${tenantId.value}/discord/mints/${id}`,
      { method: 'DELETE', credentials: 'include' }
    )
    const body = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean }
    if (!res.ok || body.ok === false) {
      createError.value =
        body.error ?? `Failed to delete mint from catalog (${res.status})`
      return
    }
    emit('mints-changed')
  } finally {
    deletePending.value = { ...deletePending.value, [id]: false }
  }
}

</script>

<style scoped>
.discord-mint-catalog {
  margin-top: var(--theme-space-lg);
}

.discord-mint-catalog__title {
  display: flex;
  align-items: baseline;
  gap: var(--theme-space-sm);
  margin-bottom: var(--theme-space-xs);
}

.discord-mint-catalog__count {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  font-weight: 400;
}

.discord-mint-catalog__hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin-bottom: var(--theme-space-md);
}

.discord-mint-catalog__add-title {
  font-size: var(--theme-font-md);
  margin-bottom: var(--theme-space-sm);
}

.discord-mint-catalog__action-label {
  margin-left: var(--theme-space-xs);
}

@media (max-width: 480px) {
  .discord-mint-catalog__action-label {
    display: none;
  }
}

.discord-mint-catalog__btn-spin {
  animation: discord-mint-btn-spin 0.8s linear infinite;
}

@keyframes discord-mint-btn-spin {
  to { transform: rotate(360deg); }
}
</style>




